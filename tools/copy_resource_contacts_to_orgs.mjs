import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { initializeApp, applicationDefault, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

import {
  getResourceTitle,
  normalizeString,
  normalizeWebsiteList,
  normalizePhoneEntries,
  getPhoneDisplayText
} from "../assets/js/contact-fields.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORTS_DIR = path.join(__dirname, "reports");
const TOOL_ACTOR_UID = "copy-resource-contacts-tool";
const TOOL_ACTOR_EMAIL = "copy-resource-contacts-tool@local";

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
  return path.join(REPORTS_DIR, `copy-resource-contacts-${timestampSuffix()}.json`);
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

function getPrimaryResourceWebsite(resource) {
  const normalized = normalizeWebsiteList(
    Array.isArray(resource?.Websites) ? resource.Websites : resource?.Website
  );
  return normalizeString(normalized[0]);
}

function getPrimaryResourcePhone(resource) {
  const normalized = normalizePhoneEntries(
    Array.isArray(resource?.PhoneNumbers) ? resource.PhoneNumbers : resource?.Phone
  );
  return normalizeString(getPhoneDisplayText(normalized[0]));
}

function buildPlannedOrgUpdate(org, resource) {
  const planned = {};

  const resourceEmail = normalizeString(resource?.Email);
  const resourceWebsite = getPrimaryResourceWebsite(resource);
  const resourcePhone = getPrimaryResourcePhone(resource);

  if (!normalizeString(org?.primaryEmail) && resourceEmail) {
    planned.primaryEmail = resourceEmail;
  }

  if (!normalizeString(org?.website) && resourceWebsite) {
    planned.website = resourceWebsite;
  }

  if (!normalizeString(org?.phone) && resourcePhone) {
    planned.phone = resourcePhone;
  }

  return planned;
}

function pickResourceName(resource) {
  return getResourceTitle(resource) || "(Unnamed resource)";
}

function pickOrgName(org) {
  return normalizeString(org?.name) || "(Unnamed organization)";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = coerceBoolean(args.apply, false);
  const reportPath = normalizeString(args.report) || defaultReportPath();

  initAdminApp();
  const db = getFirestore();

  const [orgSnap, resourceSnap] = await Promise.all([
    db.collection("organizations").get(),
    db.collection("resources").get()
  ]);

  const organizations = orgSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
  const resources = resourceSnap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));

  const resourcesByOrg = new Map();
  resources.forEach(resource => {
    const orgId = normalizeString(resource?.organizationId);
    if (!orgId) return;
    if (!resourcesByOrg.has(orgId)) {
      resourcesByOrg.set(orgId, []);
    }
    resourcesByOrg.get(orgId).push(resource);
  });

  const report = {
    generatedAt: new Date().toISOString(),
    apply,
    totalOrganizations: organizations.length,
    totalResources: resources.length,
    skippedMultiResourceOrgCount: 0,
    skippedNoSingleResourceCount: 0,
    skippedNoContactToCopyCount: 0,
    updatedCount: 0,
    skippedMultiResourceOrgs: [],
    skippedNoSingleResourceOrgs: [],
    skippedNoContactToCopy: [],
    updates: []
  };

  for (const org of organizations) {
    const orgId = normalizeString(org?.id);
    const ownedResources = resourcesByOrg.get(orgId) || [];

    if (ownedResources.length === 0) {
      report.skippedNoSingleResourceCount += 1;
      report.skippedNoSingleResourceOrgs.push({
        organizationId: orgId,
        organizationName: pickOrgName(org),
        reason: "No owned resources"
      });
      continue;
    }

    if (ownedResources.length >= 2) {
      report.skippedMultiResourceOrgCount += 1;
      report.skippedMultiResourceOrgs.push({
        organizationId: orgId,
        organizationName: pickOrgName(org),
        resourceCount: ownedResources.length
      });
      continue;
    }

    const resource = ownedResources[0];
    const plannedUpdate = buildPlannedOrgUpdate(org, resource);

    if (!Object.keys(plannedUpdate).length) {
      report.skippedNoContactToCopyCount += 1;
      report.skippedNoContactToCopy.push({
        organizationId: orgId,
        organizationName: pickOrgName(org),
        resourceId: normalizeString(resource?.id),
        resourceName: pickResourceName(resource),
        reason: "Org already had values or resource had no transferable contact info"
      });
      continue;
    }

    const entry = {
      organizationId: orgId,
      organizationName: pickOrgName(org),
      resourceId: normalizeString(resource?.id),
      resourceName: pickResourceName(resource),
      copiedFields: plannedUpdate
    };
    report.updates.push(entry);

    if (apply) {
      await db.collection("organizations").doc(orgId).update({
        ...plannedUpdate,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: TOOL_ACTOR_UID,
        updatedByEmail: TOOL_ACTOR_EMAIL
      });

      await db.collection("audit_logs").add({
        area: "access",
        action: "organization.contact_copied_from_resource",
        entityType: "organization",
        entityId: orgId,
        entityLabel: pickOrgName(org),
        organizationId: orgId,
        relatedResourceId: normalizeString(resource?.id),
        relatedRequestId: "",
        relatedMailId: "",
        actorType: "system_tool",
        actorUid: TOOL_ACTOR_UID,
        actorEmail: TOOL_ACTOR_EMAIL,
        source: "migration_script",
        summary: `Copied resource contact info into organization ${pickOrgName(org)}`,
        details: {
          resourceId: normalizeString(resource?.id),
          resourceName: pickResourceName(resource),
          copiedFields: plannedUpdate
        },
        createdAt: FieldValue.serverTimestamp()
      });
    }
  }

  report.updatedCount = report.updates.length;

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Organizations scanned: ${report.totalOrganizations}`);
  console.log(`Resources scanned: ${report.totalResources}`);
  console.log(`Eligible org updates: ${report.updatedCount}`);
  console.log(`Skipped orgs with 2+ resources: ${report.skippedMultiResourceOrgCount}`);
  console.log(`Skipped orgs with no single owned resource: ${report.skippedNoSingleResourceCount}`);
  console.log(`Skipped orgs with nothing to copy: ${report.skippedNoContactToCopyCount}`);
  console.log(`Report written to: ${reportPath}`);
  if (!apply) {
    console.log("Dry run only. Re-run with --apply true to update Firestore.");
  }
}

main().catch(error => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
