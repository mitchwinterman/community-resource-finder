import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
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
const scriptPath = path.resolve("tools", "send_outlook_mail.ps1");
const fromEmail = normalizeString(process.env.CRF_OUTLOOK_FROM_EMAIL);
const publicBaseUrl = normalizeBaseUrl(process.env.CRF_PUBLIC_BASE_URL);

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBaseUrl(value) {
  const normalized = normalizeString(value);
  if (!normalized) return "";

  try {
    const url = new URL(normalized);
    return url.origin.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function rewriteLocalUrls(content) {
  if (!publicBaseUrl || !content) return content;
  return content.replace(/https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?/gi, publicBaseUrl);
}

async function claimQueuedDoc(docRef) {
  return db.runTransaction(async transaction => {
    const snapshot = await transaction.get(docRef);
    if (!snapshot.exists) return null;

    const data = snapshot.data() || {};
    if (data.status !== "queued") return null;

    transaction.update(docRef, {
      status: "processing",
      processingStartedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { id: snapshot.id, ...data };
  });
}

async function sendWithOutlook(queueDoc) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "crf-mail-"));
  const messagePath = path.join(tempDir, "message.json");

  const payload = {
    to: normalizeString(queueDoc.to),
    subject: normalizeString(queueDoc.subject),
    text: rewriteLocalUrls(normalizeString(queueDoc.text)),
    html: rewriteLocalUrls(normalizeString(queueDoc.html))
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

async function main() {
  const snapshot = await db.collection("mail_queue")
    .where("status", "==", "queued")
    .limit(limit)
    .get();

  if (snapshot.empty) {
    console.log("No queued mail found.");
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
