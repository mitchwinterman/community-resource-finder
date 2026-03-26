import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import process from "node:process";

import admin from "firebase-admin";

const DEFAULT_LIMIT = 25;
const SENT_RETENTION_DAYS = 183;
const SENT_CLEANUP_SCAN_LIMIT = 200;
const args = process.argv.slice(2);
const limitArgIndex = args.findIndex(arg => arg === "--limit");
const limit = (() => {
  if (limitArgIndex === -1) return DEFAULT_LIMIT;
  const raw = Number.parseInt(args[limitArgIndex + 1] || "", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LIMIT;
})();

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault()
  });
}

const db = admin.firestore();
const auth = admin.auth();
const scriptPath = path.resolve("tools", "send_outlook_mail.ps1");
const fromEmail = normalizeString(process.env.CRF_OUTLOOK_FROM_EMAIL);
const publicBaseUrl = normalizeBaseUrl(process.env.CRF_PUBLIC_BASE_URL) || "https://mitchwinterman.github.io/community-resource-finder";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBaseUrl(value) {
  const normalized = normalizeString(value);
  if (!normalized) return "";

  try {
    const url = new URL(normalized);
    const pathname = url.pathname.replace(/\/+$/, "");
    return `${url.origin}${pathname}`;
  } catch {
    return "";
  }
}

function rewriteLocalUrls(content) {
  if (!publicBaseUrl || !content) return content;
  return content.replace(/https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?/gi, publicBaseUrl);
}

async function claimQueuedDoc(docRef) {
  return claimStatusDoc(docRef, "queued");
}

async function claimPendingInvite(docRef) {
  return claimStatusDoc(docRef, "pending");
}

async function claimStatusDoc(docRef, expectedStatus) {
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(docRef);
    if (!snapshot.exists) return null;

    const data = snapshot.data() || {};
    if (data.status !== expectedStatus) return null;

    transaction.update(docRef, {
      status: "processing",
      processingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { id: snapshot.id, ...data };
  });
}

async function sendWithOutlook(payloadSource) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "crf-mail-"));
  const messagePath = path.join(tempDir, "message.json");

  const payload = {
    to: normalizeString(payloadSource.to),
    subject: normalizeString(payloadSource.subject),
    text: rewriteLocalUrls(normalizeString(payloadSource.text)),
    html: rewriteLocalUrls(normalizeString(payloadSource.html))
  };

  await writeFile(messagePath, JSON.stringify(payload), "utf8");

  try {
    const result = await runPowerShell(scriptPath, messagePath, fromEmail);
    return result;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function runPowerShell(psScriptPath, messagePath, senderEmail) {
  return new Promise((resolve, reject) => {
    const commandArgs = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      psScriptPath,
      "-MessagePath",
      messagePath
    ];

    if (senderEmail) {
      commandArgs.push("-FromEmail", senderEmail);
    }

    const child = spawn("powershell.exe", commandArgs, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", code => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `PowerShell exited with code ${code}`));
        return;
      }

      const trimmed = stdout.trim();
      if (!trimmed) {
        resolve({ ok: true, transportMessageId: "" });
        return;
      }

      try {
        resolve(JSON.parse(trimmed));
      } catch (err) {
        reject(new Error(`Unable to parse Outlook send result: ${trimmed}`));
      }
    });
  });
}

async function markSent(docId, sendResult) {
  await db.collection("mail_queue").doc(docId).update({
    status: "sent",
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    transportMessageId: normalizeString(sendResult?.transportMessageId),
    error: "",
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function markFailed(docId, error) {
  await db.collection("mail_queue").doc(docId).update({
    status: "failed",
    error: normalizeString(error?.message || String(error)),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function logSystemAuditEvent({
  action = "",
  entityType = "",
  entityId = "",
  entityLabel = "",
  organizationId = "",
  relatedResourceId = "",
  relatedRequestId = "",
  relatedMailId = "",
  summary = "",
  details = {}
} = {}) {
  await db.collection("audit_logs").add({
    area: "mail",
    action: normalizeString(action),
    entityType: normalizeString(entityType),
    entityId: normalizeString(entityId),
    entityLabel: normalizeString(entityLabel),
    organizationId: normalizeString(organizationId),
    relatedResourceId: normalizeString(relatedResourceId),
    relatedRequestId: normalizeString(relatedRequestId),
    relatedMailId: normalizeString(relatedMailId),
    actorType: "system",
    actorUid: "mail_worker",
    actorEmail: "",
    source: "mail_worker",
    summary: normalizeString(summary),
    details: details && typeof details === "object" ? details : {},
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

function isOlderThanRetention(timestampValue) {
  const millis = timestampValue?.toMillis?.();
  if (!millis) return false;
  const cutoff = Date.now() - (SENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return millis < cutoff;
}

async function cleanupOldSentMail() {
  const snapshot = await db.collection("mail_queue")
    .where("status", "==", "sent")
    .limit(SENT_CLEANUP_SCAN_LIMIT)
    .get();

  const staleDocs = snapshot.docs.filter(docSnap => isOlderThanRetention(docSnap.data()?.sentAt));
  if (!staleDocs.length) return 0;

  await Promise.all(staleDocs.map(docSnap => docSnap.ref.delete()));
  return staleDocs.length;
}

function buildInviteMessage({ inviteDoc, organizationName, setupLink }) {
  const email = normalizeString(inviteDoc.email);
  const roleLabel = normalizeString(inviteDoc.role) === "org_admin" ? "Organization Admin" : "Organization Editor";
  const orgName = organizationName || "your organization";
  const customMessage = normalizeString(inviteDoc.customMessage);
  const subject = `[CRF] Set up your editor account for ${orgName}`;

  const text = [
    `You have been invited to manage updates for "${orgName}" in the Community Resource Finder as a ${roleLabel}.`,
    customMessage ? "" : "",
    customMessage ? `Library message:\n${customMessage}` : "",
    "",
    "To finish setup, open this link and set your password:",
    setupLink,
    "",
    `After setting your password, return to ${publicBaseUrl}/login.html and sign in normally with ${email}.`
  ].filter(Boolean).join("\n");

  const html = [
    `<p>You have been invited to manage updates for <strong>${escapeHtml(orgName)}</strong> in the Community Resource Finder as a <strong>${escapeHtml(roleLabel)}</strong>.</p>`,
    customMessage
      ? `<p><strong>Library message:</strong><br>${escapeHtml(customMessage).replace(/\r?\n/g, "<br>")}</p>`
      : "",
    `<p><a href="${escapeHtml(setupLink)}">Set your password and activate your editor account</a></p>`,
    `<p>After setting your password, return to <a href="${escapeHtml(`${publicBaseUrl}/login.html`)}">${escapeHtml(`${publicBaseUrl}/login.html`)}</a> and sign in normally with ${escapeHtml(email)}.</p>`
  ].filter(Boolean).join("");

  return {
    to: email,
    subject,
    text,
    html
  };
}

function escapeHtml(value) {
  return normalizeString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function createTemporaryPassword() {
  return randomBytes(18).toString("base64url");
}

async function ensureAuthUser(email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (err) {
    if (err?.code !== "auth/user-not-found") throw err;
  }

  return auth.createUser({
    email,
    password: createTemporaryPassword(),
    emailVerified: true
  });
}

async function ensureMembershipForInvite(inviteDoc, userRecord) {
  const membershipRef = db.collection("organization_members").doc(userRecord.uid);
  const existing = await membershipRef.get();
  const basePayload = {
    uid: userRecord.uid,
    email: normalizeString(inviteDoc.email),
    organizationId: normalizeString(inviteDoc.organizationId),
    role: normalizeString(inviteDoc.role) || "org_editor",
    status: "active",
    notes: normalizeString(inviteDoc.notes),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: "mail_worker",
    updatedByEmail: ""
  };

  if (existing.exists) {
    const existingData = existing.data() || {};
    const existingOrgId = normalizeString(existingData.organizationId);
    const targetOrgId = normalizeString(inviteDoc.organizationId);
    if (existingOrgId && targetOrgId && existingOrgId !== targetOrgId) {
      throw new Error("This email already has editor access for a different organization.");
    }
    await membershipRef.update(basePayload);
    return;
  }

  await membershipRef.set({
    ...basePayload,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: "mail_worker",
    createdByEmail: ""
  });
}

async function markInviteSent(inviteId, values) {
  await db.collection("editor_invites").doc(inviteId).update({
    status: "sent",
    firebaseUid: normalizeString(values.firebaseUid),
    setupLink: normalizeString(values.setupLink),
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    error: "",
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function markInviteFailed(inviteId, error) {
  await db.collection("editor_invites").doc(inviteId).update({
    status: "failed",
    error: normalizeString(error?.message || String(error)),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });
}

async function processPendingInvites(limit) {
  const snapshot = await db.collection("editor_invites")
    .where("status", "==", "pending")
    .limit(limit)
    .get();

  if (snapshot.empty) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (const inviteDoc of snapshot.docs) {
    const claimed = await claimPendingInvite(inviteDoc.ref);
    if (!claimed) continue;

    try {
      const email = normalizeString(claimed.email).toLowerCase();
      if (!email) {
        throw new Error("Invite email is missing.");
      }

      const userRecord = await ensureAuthUser(email);
      await ensureMembershipForInvite(claimed, userRecord);

      const actionCodeSettings = {
        url: `${publicBaseUrl}/login.html`
      };
      const setupLink = await auth.generatePasswordResetLink(email, actionCodeSettings);

      const organizationSnap = await db.collection("organizations").doc(normalizeString(claimed.organizationId)).get();
      const organizationName = normalizeString(organizationSnap.data()?.name) || "your organization";
      const inviteMessage = buildInviteMessage({
        inviteDoc: claimed,
        organizationName,
        setupLink
      });

      const sendResult = await sendWithOutlook(inviteMessage);
      if (!sendResult?.ok) {
        throw new Error(normalizeString(sendResult?.error) || "Outlook invite send failed.");
      }
      await markInviteSent(claimed.id, { firebaseUid: userRecord.uid, setupLink });
      await logSystemAuditEvent({
        action: "invite.sent",
        entityType: "editor_invite",
        entityId: claimed.id,
        entityLabel: email,
        organizationId: normalizeString(claimed.organizationId),
        summary: `Sent editor invite to ${email}`,
        details: {
          firebaseUid: userRecord.uid,
          role: normalizeString(claimed.role)
        }
      });
      sent += 1;
    } catch (error) {
      await markInviteFailed(claimed.id, error);
      await logSystemAuditEvent({
        action: "invite.failed",
        entityType: "editor_invite",
        entityId: claimed.id,
        entityLabel: normalizeString(claimed.email),
        organizationId: normalizeString(claimed.organizationId),
        summary: `Invite failed for ${normalizeString(claimed.email) || claimed.id}`,
        details: {
          error: normalizeString(error?.message || String(error))
        }
      });
      failed += 1;
    }
  }

  return { processed: snapshot.size, sent, failed };
}

async function main() {
  const inviteResult = await processPendingInvites(limit);
  if (inviteResult.processed > 0) {
    console.log(`Processed ${inviteResult.processed} pending invite(s). Sent: ${inviteResult.sent}. Failed: ${inviteResult.failed}.`);
  }

  const snapshot = await db.collection("mail_queue")
    .where("status", "==", "queued")
    .limit(limit)
    .get();

  if (snapshot.empty) {
    const deletedCount = await cleanupOldSentMail();
    if (deletedCount > 0) {
      await logSystemAuditEvent({
        action: "mail.cleanup_deleted",
        entityType: "mail_queue",
        entityId: "",
        entityLabel: "",
        summary: `Deleted ${deletedCount} sent mail item(s) older than ${SENT_RETENTION_DAYS} days`,
        details: {
          deletedCount,
          retentionDays: SENT_RETENTION_DAYS
        }
      });
      console.log(`Deleted ${deletedCount} sent mail item(s) older than ${SENT_RETENTION_DAYS} days.`);
    }
    if (inviteResult.processed === 0) {
      console.log("No queued mail found.");
    }
    return;
  }

  let sent = 0;
  let failed = 0;

  for (const queuedDoc of snapshot.docs) {
    const claimed = await claimQueuedDoc(queuedDoc.ref);
    if (!claimed) continue;

    try {
      const result = await sendWithOutlook(claimed);
      if (!result?.ok) {
        throw new Error(normalizeString(result?.error) || "Outlook send failed.");
      }

      await markSent(claimed.id, result);
      await logSystemAuditEvent({
        action: "mail.sent",
        entityType: "mail_queue",
        entityId: claimed.id,
        entityLabel: normalizeString(claimed.subject),
        relatedMailId: claimed.id,
        relatedRequestId: normalizeString(claimed.sourceCollection) === "resource_change_requests" ? normalizeString(claimed.sourceId) : "",
        summary: `Sent mail ${normalizeString(claimed.subject) || claimed.id}`,
        details: {
          to: normalizeString(claimed.to),
          transportMessageId: normalizeString(result?.transportMessageId)
        }
      });
      sent += 1;
    } catch (error) {
      await markFailed(claimed.id, error);
      await logSystemAuditEvent({
        action: "mail.failed",
        entityType: "mail_queue",
        entityId: claimed.id,
        entityLabel: normalizeString(claimed.subject),
        relatedMailId: claimed.id,
        relatedRequestId: normalizeString(claimed.sourceCollection) === "resource_change_requests" ? normalizeString(claimed.sourceId) : "",
        summary: `Mail failed ${normalizeString(claimed.subject) || claimed.id}`,
        details: {
          to: normalizeString(claimed.to),
          error: normalizeString(error?.message || String(error))
        }
      });
      failed += 1;
    }
  }

  console.log(`Processed ${snapshot.size} queued mail item(s). Sent: ${sent}. Failed: ${failed}.`);
  const deletedCount = await cleanupOldSentMail();
  if (deletedCount > 0) {
    await logSystemAuditEvent({
      action: "mail.cleanup_deleted",
      entityType: "mail_queue",
      entityId: "",
      entityLabel: "",
      summary: `Deleted ${deletedCount} sent mail item(s) older than ${SENT_RETENTION_DAYS} days`,
      details: {
        deletedCount,
        retentionDays: SENT_RETENTION_DAYS
      }
    });
    console.log(`Deleted ${deletedCount} sent mail item(s) older than ${SENT_RETENTION_DAYS} days.`);
  }
}

main().catch(error => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
