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
const REVIEW_REMINDER_DAYS = 90;
const FAILED_REVIEW_RETRY_HOURS = 24;
const REVIEW_TOKEN_EXPIRATION_DAYS = 120;
const requestAccessMailto = "mailto:mwinterman@washoecounty.gov?subject=Community%20Resource%20Finder%20Editor%20Access%20Request";

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

function parseYyyyMmDd(value) {
  const normalized = normalizeString(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;

  const parsed = new Date(`${normalized}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getValueDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;

  const normalized = normalizeString(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getLatestDate(dates = []) {
  return dates.reduce((latest, current) => {
    if (!current) return latest;
    if (!latest || current.getTime() > latest.getTime()) return current;
    return latest;
  }, null);
}

function getDaysSince(dateValue) {
  if (!(dateValue instanceof Date)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - dateValue.getTime()) / (24 * 60 * 60 * 1000));
}

function getHoursSince(dateValue) {
  if (!(dateValue instanceof Date)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - dateValue.getTime()) / (60 * 60 * 1000));
}

function formatLocalDate(dateValue = new Date()) {
  const year = dateValue.getFullYear();
  const month = `${dateValue.getMonth() + 1}`.padStart(2, "0");
  const day = `${dateValue.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateValue, days) {
  const copy = new Date(dateValue.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function getResourceReviewAnchor(resource) {
  const candidates = [
    { source: "Last Verified", date: parseYyyyMmDd(resource?.["Last Verified"]) },
    { source: "Last Approved", date: getValueDate(resource?.lastApprovedAt) },
    { source: "Last Submitted", date: getValueDate(resource?.lastSubmittedAt) },
    { source: "Created", date: getValueDate(resource?.createdAt) }
  ].filter(candidate => candidate.date instanceof Date);

  if (!candidates.length) {
    return {
      source: "",
      date: null,
      displayValue: ""
    };
  }

  const latest = candidates.reduce((best, candidate) =>
    !best || candidate.date.getTime() > best.date.getTime() ? candidate : best
  , null);

  return {
    source: latest.source,
    date: latest.date,
    displayValue: latest.source === "Last Verified"
      ? normalizeString(resource?.["Last Verified"])
      : latest.date.toLocaleString()
  };
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

function buildQuarterlyReminderMessage({ recipientEmail, organizationName, resourceEntries }) {
  const loginUrl = `${publicBaseUrl}/login.html`;
  const subject = `[CRF] Quarterly review requested for ${organizationName || "your organization"}`;
  const intro = `It is time to review your Community Resource Finder listing${resourceEntries.length === 1 ? "" : "s"} for ${organizationName || "your organization"}.`;

  const textSections = resourceEntries.map(entry => ([
    `${entry.resourceName}`,
    `Current review date: ${entry.reviewAnchorDate || "Not set"}`,
    `Yes, this looks correct: ${entry.confirmUrl}`,
    `No, I need to make changes: ${loginUrl}`
  ].join("\n")));

  const htmlSections = resourceEntries.map(entry => [
    `<div style="margin: 0 0 16px 0; padding: 14px; border: 1px solid #dbe4ff; border-radius: 10px; background: #f8fbff;">`,
    `<p style="margin: 0 0 6px 0;"><strong>${escapeHtml(entry.resourceName)}</strong></p>`,
    `<p style="margin: 0 0 10px 0;">Current review date: ${escapeHtml(entry.reviewAnchorDate || "Not set")}</p>`,
    `<p style="margin: 0 0 8px 0;"><a href="${escapeHtml(entry.confirmUrl)}">Yes, this looks correct</a></p>`,
    `<p style="margin: 0;"><a href="${escapeHtml(loginUrl)}">No, I need to make changes</a></p>`,
    `</div>`
  ].join("")).join("");

  const text = [
    intro,
    "",
    ...textSections.flatMap(section => [section, ""]),
    `If you do not already have editor access, request it here: ${requestAccessMailto}`,
    `Organization portal: ${loginUrl}`
  ].join("\n").trim();

  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    htmlSections,
    `<p>If you do not already have editor access, <a href="${escapeHtml(requestAccessMailto)}">request it here</a>.</p>`,
    `<p>You can also sign in directly at <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a>.</p>`
  ].join("");

  return {
    to: recipientEmail,
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

function normalizeReviewConfirmationStatus(value) {
  const status = normalizeString(value).toLowerCase();
  if (["processing", "sent", "confirmed", "applied", "failed", "expired"].includes(status)) {
    return status;
  }
  return "processing";
}

function getQuarterlyReviewDocsForResource(resourceId, reviewDocs) {
  const targetId = normalizeString(resourceId);
  if (!targetId) return [];
  return reviewDocs.filter(doc =>
    normalizeString(doc.resourceId) === targetId
    && normalizeString(doc.type) === "quarterly_review"
  );
}

function getQuarterlyReviewActivity(resourceId, reviewDocs) {
  const docs = getQuarterlyReviewDocsForResource(resourceId, reviewDocs);
  const latestSuccessful = getLatestDate(docs
    .filter(doc => ["sent", "confirmed", "applied", "expired"].includes(normalizeReviewConfirmationStatus(doc.status)))
    .map(doc => getLatestDate([
      getValueDate(doc.appliedAt),
      getValueDate(doc.confirmedAt),
      getValueDate(doc.sentAt),
      getValueDate(doc.createdAt)
    ])));
  const latestFailure = getLatestDate(docs
    .filter(doc => ["failed", "processing"].includes(normalizeReviewConfirmationStatus(doc.status)))
    .map(doc => getLatestDate([
      getValueDate(doc.updatedAt),
      getValueDate(doc.createdAt)
    ])));

  return {
    latestSuccessful,
    latestFailure
  };
}

function isQuarterlyReviewDue(resource, reviewDocs) {
  const anchor = getResourceReviewAnchor(resource);
  const daysSinceAnchor = getDaysSince(anchor.date);
  if (daysSinceAnchor < REVIEW_REMINDER_DAYS) {
    return false;
  }

  const activity = getQuarterlyReviewActivity(resource.id, reviewDocs);
  if (activity.latestSuccessful && getDaysSince(activity.latestSuccessful) < REVIEW_REMINDER_DAYS) {
    return false;
  }

  if (activity.latestFailure && getHoursSince(activity.latestFailure) < FAILED_REVIEW_RETRY_HOURS) {
    return false;
  }

  return true;
}

function collectOrganizationRecipients(organization, memberships) {
  const recipients = new Map();
  const primaryEmail = normalizeString(organization?.primaryEmail).toLowerCase();
  if (primaryEmail) {
    recipients.set(primaryEmail, {
      email: primaryEmail,
      type: "organization_primary",
      uid: ""
    });
  }

  memberships.forEach(member => {
    const email = normalizeString(member?.email).toLowerCase();
    if (!email || normalizeString(member?.status).toLowerCase() !== "active") return;

    const existing = recipients.get(email);
    recipients.set(email, {
      ...(existing || {}),
      email,
      type: "organization_editor",
      uid: normalizeString(member?.uid) || normalizeString(member?.id),
      role: normalizeString(member?.role) || "org_editor"
    });
  });

  return Array.from(recipients.values());
}

async function createQuarterlyReviewDocs({ recipient, organization, dueResources, now }) {
  const expiresAt = admin.firestore.Timestamp.fromDate(addDays(now, REVIEW_TOKEN_EXPIRATION_DAYS));
  const emailBatchId = randomBytes(12).toString("hex");
  const entries = [];

  for (const resource of dueResources) {
    const token = randomBytes(24).toString("base64url");
    const anchor = getResourceReviewAnchor(resource);
    const reviewAnchorDate = normalizeString(resource?.["Last Verified"])
      || formatLocalDate(anchor.date || now);

    await db.collection("review_confirmations").doc(token).set({
      type: "quarterly_review",
      status: "processing",
      organizationId: normalizeString(organization?.id),
      organizationName: normalizeString(organization?.name),
      resourceId: normalizeString(resource?.id),
      resourceName: normalizeString(resource?.Organization),
      recipientEmail: normalizeString(recipient?.email),
      recipientType: normalizeString(recipient?.type) || "organization_editor",
      recipientUid: normalizeString(recipient?.uid),
      reviewAnchorSource: normalizeString(anchor.source),
      reviewAnchorDate,
      emailBatchId,
      error: "",
      expiresAt,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    entries.push({
      token,
      resourceId: normalizeString(resource?.id),
      resourceName: normalizeString(resource?.Organization) || "Resource listing",
      reviewAnchorDate,
      confirmUrl: `${publicBaseUrl}/review.html?token=${encodeURIComponent(token)}`
    });
  }

  return { emailBatchId, entries };
}

async function markQuarterlyReviewDocsStatus(tokens, status, errorMessage = "") {
  await Promise.all(tokens.map(token =>
    db.collection("review_confirmations").doc(token).update({
      status,
      error: normalizeString(errorMessage),
      sentAt: status === "sent" ? admin.firestore.FieldValue.serverTimestamp() : null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    })
  ));
}

async function processQuarterlyReviewReminders(limit) {
  const [resourceSnap, organizationSnap, membershipSnap, confirmationSnap] = await Promise.all([
    db.collection("resources").get(),
    db.collection("organizations").get(),
    db.collection("organization_members").get(),
    db.collection("review_confirmations").get()
  ]);

  const resources = resourceSnap.docs
    .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
    .filter(resource => {
      const status = normalizeString(resource?.status).toLowerCase();
      return !status || status === "published";
    });
  const organizations = organizationSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  const memberships = membershipSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  const reviewDocs = confirmationSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

  const organizationMap = new Map(organizations.map(org => [normalizeString(org.id), org]));
  const dueResources = resources
    .filter(resource => isQuarterlyReviewDue(resource, reviewDocs))
    .slice(0, limit);

  if (!dueResources.length) {
    return { processed: 0, sent: 0, failed: 0 };
  }

  const batches = [];
  const resourcesByOrg = new Map();
  dueResources.forEach(resource => {
    const orgId = normalizeString(resource.organizationId);
    if (!orgId) return;
    if (!resourcesByOrg.has(orgId)) {
      resourcesByOrg.set(orgId, []);
    }
    resourcesByOrg.get(orgId).push(resource);
  });

  resourcesByOrg.forEach((orgResources, orgId) => {
    const organization = organizationMap.get(orgId);
    if (!organization) return;
    const orgMemberships = memberships.filter(member => normalizeString(member.organizationId) === orgId);
    const recipients = collectOrganizationRecipients(organization, orgMemberships);

    recipients.forEach(recipient => {
      batches.push({
        organization,
        recipient,
        dueResources: orgResources
      });
    });
  });

  if (!batches.length) {
    return { processed: dueResources.length, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  const now = new Date();

  for (const batch of batches) {
    let created = null;

    try {
      created = await createQuarterlyReviewDocs({
        recipient: batch.recipient,
        organization: batch.organization,
        dueResources: batch.dueResources,
        now
      });

      const payload = buildQuarterlyReminderMessage({
        recipientEmail: batch.recipient.email,
        organizationName: normalizeString(batch.organization.name),
        resourceEntries: created.entries
      });
      const sendResult = await sendWithOutlook(payload);
      if (!sendResult?.ok) {
        throw new Error(normalizeString(sendResult?.error) || "Outlook reminder send failed.");
      }

      await markQuarterlyReviewDocsStatus(created.entries.map(entry => entry.token), "sent");
      await logSystemAuditEvent({
        action: "review.reminder.sent",
        entityType: "review_batch",
        entityId: created.emailBatchId,
        entityLabel: normalizeString(batch.organization.name),
        organizationId: normalizeString(batch.organization.id),
        summary: `Sent quarterly review reminder to ${batch.recipient.email}`,
        details: {
          recipientEmail: normalizeString(batch.recipient.email),
          resourceIds: created.entries.map(entry => entry.resourceId),
          resourceNames: created.entries.map(entry => entry.resourceName)
        }
      });
      sent += 1;
    } catch (error) {
      if (created?.entries?.length) {
        await markQuarterlyReviewDocsStatus(
          created.entries.map(entry => entry.token),
          "failed",
          error?.message || String(error)
        );
      }

      await logSystemAuditEvent({
        action: "review.reminder.failed",
        entityType: "review_batch",
        entityId: normalizeString(created?.emailBatchId),
        entityLabel: normalizeString(batch.organization.name),
        organizationId: normalizeString(batch.organization.id),
        summary: `Quarterly review reminder failed for ${batch.recipient.email}`,
        details: {
          recipientEmail: normalizeString(batch.recipient.email),
          error: normalizeString(error?.message || String(error))
        }
      });
      failed += 1;
    }
  }

  return {
    processed: dueResources.length,
    sent,
    failed
  };
}

async function processConfirmedReviewConfirmations(limit) {
  const snapshot = await db.collection("review_confirmations")
    .where("status", "==", "confirmed")
    .limit(limit)
    .get();

  if (snapshot.empty) {
    return { processed: 0, applied: 0, failed: 0 };
  }

  let applied = 0;
  let failed = 0;
  const todayString = formatLocalDate(new Date());

  for (const docSnap of snapshot.docs) {
    const confirmation = { id: docSnap.id, ...docSnap.data() };

    try {
      const resourceId = normalizeString(confirmation.resourceId);
      if (!resourceId) {
        throw new Error("Confirmation is missing a resource id.");
      }

      await db.collection("resources").doc(resourceId).update({
        "Last Verified": todayString,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedByUid: normalizeString(confirmation.recipientUid),
        updatedByEmail: normalizeString(confirmation.recipientEmail),
        UpdatedBy: "Quarterly review confirmation"
      });

      await docSnap.ref.update({
        status: "applied",
        appliedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        error: ""
      });

      const siblingSnap = await db.collection("review_confirmations")
        .where("resourceId", "==", resourceId)
        .get();
      const siblingUpdates = [];
      siblingSnap.forEach(siblingDoc => {
        if (siblingDoc.id === docSnap.id) return;
        const siblingData = siblingDoc.data() || {};
        if (normalizeString(siblingData.type) !== "quarterly_review") return;
        if (normalizeReviewConfirmationStatus(siblingData.status) !== "sent") return;
        siblingUpdates.push(siblingDoc.ref.update({
          status: "expired",
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }));
      });
      if (siblingUpdates.length) {
        await Promise.all(siblingUpdates);
      }

      await logSystemAuditEvent({
        action: "review.confirmation_applied",
        entityType: "review_confirmation",
        entityId: docSnap.id,
        entityLabel: normalizeString(confirmation.resourceName),
        organizationId: normalizeString(confirmation.organizationId),
        relatedResourceId: resourceId,
        summary: `Applied quarterly review confirmation for ${normalizeString(confirmation.resourceName) || resourceId}`,
        details: {
          recipientEmail: normalizeString(confirmation.recipientEmail),
          reviewDate: todayString
        }
      });
      applied += 1;
    } catch (error) {
      await docSnap.ref.update({
        status: "failed",
        error: normalizeString(error?.message || String(error)),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      await logSystemAuditEvent({
        action: "review.confirmation_failed",
        entityType: "review_confirmation",
        entityId: docSnap.id,
        entityLabel: normalizeString(confirmation.resourceName),
        organizationId: normalizeString(confirmation.organizationId),
        relatedResourceId: normalizeString(confirmation.resourceId),
        summary: `Quarterly review confirmation failed for ${normalizeString(confirmation.resourceName) || docSnap.id}`,
        details: {
          recipientEmail: normalizeString(confirmation.recipientEmail),
          error: normalizeString(error?.message || String(error))
        }
      });
      failed += 1;
    }
  }

  return { processed: snapshot.size, applied, failed };
}

async function main() {
  const inviteResult = await processPendingInvites(limit);
  if (inviteResult.processed > 0) {
    console.log(`Processed ${inviteResult.processed} pending invite(s). Sent: ${inviteResult.sent}. Failed: ${inviteResult.failed}.`);
  }

  const confirmationResult = await processConfirmedReviewConfirmations(limit);
  if (confirmationResult.processed > 0) {
    console.log(`Processed ${confirmationResult.processed} confirmed review(s). Applied: ${confirmationResult.applied}. Failed: ${confirmationResult.failed}.`);
  }

  const reminderResult = await processQuarterlyReviewReminders(limit);
  if (reminderResult.processed > 0) {
    console.log(`Processed ${reminderResult.processed} resource(s) for quarterly reminders. Sent: ${reminderResult.sent}. Failed: ${reminderResult.failed}.`);
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
    if (inviteResult.processed === 0 && confirmationResult.processed === 0 && reminderResult.processed === 0) {
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
