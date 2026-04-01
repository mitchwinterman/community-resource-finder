import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { initializeApp, applicationDefault, cert, getApps } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { getResourceTitle, normalizeString } from "../assets/js/contact-fields.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORTS_DIR = path.join(__dirname, "reports");
const TOOL_ACTOR_UID = "resource-title-migration";
const TOOL_ACTOR_EMAIL = "resource-title-migration@local";

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith("--")) continue;

    const key = part.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

function coerceBoolean(value, defaultValue = false) {
  if (value == null) return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function timestampSuffix() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function defaultReportPath() {
  return path.join(REPORTS_DIR, `migrate-resource-titles-${timestampSuffix()}.json`);
}

function initAdminApp() {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    return initializeApp({
      credential: cert(JSON.parse(serviceAccountJson))
    });
  }

  return initializeApp({
    credential: applicationDefault()
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = coerceBoolean(args.apply, false);
  const removeLegacy = coerceBoolean(args["remove-legacy"], false);
  const reportPath = normalizeString(args.report) || defaultReportPath();

  initAdminApp();
  const db = getFirestore();

  const snap = await db.collection("resources").get();
  const resources = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  const report = {
    generatedAt: new Date().toISOString(),
    apply,
    removeLegacy,
    totalResources: resources.length,
    updatedCount: 0,
    alreadyMigratedCount: 0,
    missingLegacyTitleCount: 0,
    titleConflictCount: 0,
    updates: [],
    missingLegacyTitle: [],
    titleConflicts: []
  };

  for (const resource of resources) {
    const resourceId = normalizeString(resource.id);
    const resourceTitle = normalizeString(resource.resourceTitle);
    const legacyTitle = normalizeString(resource.Organization);
    const displayTitle = getResourceTitle(resource) || resourceId;

    if (resourceTitle && (!legacyTitle || resourceTitle === legacyTitle || !removeLegacy)) {
      report.alreadyMigratedCount += 1;
      continue;
    }

    if (!resourceTitle && !legacyTitle) {
      report.missingLegacyTitleCount += 1;
      report.missingLegacyTitle.push({
        resourceId,
        reason: "No resourceTitle or legacy Organization field present"
      });
      continue;
    }

    if (resourceTitle && legacyTitle && resourceTitle !== legacyTitle) {
      report.titleConflictCount += 1;
      report.titleConflicts.push({
        resourceId,
        resourceTitle,
        legacyTitle
      });
      continue;
    }

    const update = {
      resourceId,
      previousTitle: resourceTitle,
      legacyTitle,
      nextTitle: resourceTitle || legacyTitle,
      removeLegacy
    };
    report.updates.push(update);

    if (apply) {
      const payload = {
        resourceTitle: resourceTitle || legacyTitle,
        updatedAt: FieldValue.serverTimestamp(),
        updatedByUid: TOOL_ACTOR_UID,
        updatedByEmail: TOOL_ACTOR_EMAIL
      };

      if (removeLegacy && legacyTitle) {
        payload.Organization = FieldValue.delete();
      }

      await db.collection("resources").doc(resourceId).update(payload);
    }
  }

  report.updatedCount = report.updates.length;

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Resources scanned: ${report.totalResources}`);
  console.log(`Resources needing updates: ${report.updatedCount}`);
  console.log(`Already migrated: ${report.alreadyMigratedCount}`);
  console.log(`Missing any title field: ${report.missingLegacyTitleCount}`);
  console.log(`Conflicting resourceTitle vs legacy Organization: ${report.titleConflictCount}`);
  console.log(`Report written to: ${reportPath}`);
  if (!apply) {
    console.log("Dry run only. Re-run with --apply true to write updates.");
  }
}

main().catch(error => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
