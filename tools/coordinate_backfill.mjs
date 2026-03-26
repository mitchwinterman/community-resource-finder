import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { initializeApp, applicationDefault, cert, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORTS_DIR = path.join(__dirname, "reports");
const TOOL_ACTOR_UID = "coordinate-backfill-tool";
const TOOL_ACTOR_EMAIL = "coordinate-backfill-tool@local";
const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const REQUEST_DELAY_MS = 1100;
const execFileAsync = promisify(execFile);

let lastGeocodeRequestAt = 0;

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith("--")) continue;

    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }

    args[key] = next;
    i += 1;
  }

  return args;
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeCoordinateValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const text = normalizeString(value);
  if (!text) return null;
  const parsed = Number.parseFloat(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasValidCoordinates(resource) {
  return normalizeCoordinateValue(resource?.Latitude) != null &&
    normalizeCoordinateValue(resource?.Longitude) != null;
}

function normalizeName(value) {
  return normalizeString(value) || "(unnamed resource)";
}

function formatResourceAddress(resource) {
  return [resource?.Address, resource?.City, resource?.Zip]
    .map(part => normalizeString(part))
    .filter(Boolean)
    .join(", ");
}

function stripAddressUnitDetails(address) {
  return normalizeString(address)
    .replace(/\b(?:suite|ste|unit|apt|apartment|bldg|building|floor|fl|room|rm)\b[\s.#-]*[a-z0-9-]+/gi, "")
    .replace(/\s+#\s*[a-z0-9-]+\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/,+$/g, "")
    .trim();
}

function buildGeocodeQueries(resource) {
  const address = normalizeString(resource?.Address);
  const city = normalizeString(resource?.City);
  const zip = normalizeString(resource?.Zip);
  const simplifiedAddress = stripAddressUnitDetails(address);

  const variants = city
    ? [
        [address, city, zip, "Nevada", "USA"],
        [simplifiedAddress, city, zip, "Nevada", "USA"],
        [address, city, "Nevada", "USA"],
        [simplifiedAddress, city, "Nevada", "USA"]
      ]
    : [
        [address, zip, "Nevada", "USA"],
        [simplifiedAddress, zip, "Nevada", "USA"],
        [address, "Nevada", "USA"],
        [simplifiedAddress, "Nevada", "USA"]
      ];

  return Array.from(new Set(
    variants
      .map(parts => parts.filter(Boolean).join(", "))
      .map(query => normalizeString(query))
      .filter(Boolean)
  ));
}

function isStatewideFallbackMatch(geocodeResult) {
  const matchedQuery = normalizeString(geocodeResult?.query).toLowerCase();
  const displayName = normalizeString(geocodeResult?.displayName).toLowerCase();

  return matchedQuery === "nevada, usa" ||
    displayName === "nevada, united states";
}

function timestampSuffix() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function defaultReportPath(mode) {
  return path.join(REPORTS_DIR, `coordinate-backfill-${mode}-${timestampSuffix()}.json`);
}

function limitEntries(entries, limitValue) {
  const limit = Number.parseInt(limitValue, 10);
  if (!Number.isFinite(limit) || limit <= 0) {
    return entries;
  }

  return entries.slice(0, limit);
}

async function sleep(ms) {
  await new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function throttleGeocodeRequests() {
  const now = Date.now();
  const delta = now - lastGeocodeRequestAt;
  if (delta < REQUEST_DELAY_MS) {
    await sleep(REQUEST_DELAY_MS - delta);
  }
  lastGeocodeRequestAt = Date.now();
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

async function geocodeResource(resource) {
  const queries = buildGeocodeQueries(resource);
  if (!queries.length) {
    return {
      ok: false,
      reason: "No usable address, city, or zip was available for geocoding.",
      queries
    };
  }

  let lastError = "";

  for (const queryText of queries) {
    await throttleGeocodeRequests();

    try {
      const url = new URL(NOMINATIM_ENDPOINT);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      url.searchParams.set("countrycodes", "us");
      url.searchParams.set("q", queryText);

      const psCommand = [
        "$ProgressPreference='SilentlyContinue'",
        `$url='${url.toString().replace(/'/g, "''")}'`,
        "$response = Invoke-RestMethod -UseBasicParsing -Headers @{ 'User-Agent' = 'community-resource-finder-coordinate-backfill/1.0 (contact: mwinterman@washoecounty.gov)'; 'Accept' = 'application/json' } -Uri $url",
        "$response | ConvertTo-Json -Compress -Depth 8"
      ].join("; ");

      const { stdout } = await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-Command",
        psCommand
      ], {
        timeout: 60000,
        maxBuffer: 1024 * 1024 * 5
      });

      const raw = normalizeString(stdout);
      const parsed = raw ? JSON.parse(raw) : [];
      const results = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
      const best = Array.isArray(results) ? results[0] : null;
      const latitude = normalizeCoordinateValue(best?.lat);
      const longitude = normalizeCoordinateValue(best?.lon);

      if (latitude != null && longitude != null) {
        const candidate = {
          ok: true,
          query: queryText,
          latitude,
          longitude,
          displayName: normalizeString(best?.display_name)
        };

        if (isStatewideFallbackMatch(candidate)) {
          lastError = "Only a statewide Nevada match was found.";
          continue;
        }

        return {
          ...candidate
        };
      }
    } catch (error) {
      lastError = normalizeString(error?.message || String(error));
    }
  }

  return {
    ok: false,
    reason: lastError || "No coordinates found for the available address variants.",
    queries
  };
}

function summarizeEntries(entries, mode) {
  const counts = {
    total: entries.length,
    skippedExisting: 0,
    ready: 0,
    updated: 0,
    failed: 0
  };

  for (const entry of entries) {
    if (entry.status === "skipped_existing") counts.skippedExisting += 1;
    if (entry.status === "ready") counts.ready += 1;
    if (entry.status === "updated") counts.updated += 1;
    if (entry.status === "failed") counts.failed += 1;
  }

  return {
    mode,
    generatedAt: new Date().toISOString(),
    ...counts
  };
}

async function writeReport(reportPath, summary, entries) {
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  const payload = {
    summary,
    entries
  };
  await fs.writeFile(reportPath, JSON.stringify(payload, null, 2), "utf8");
}

function toPreviewEntry(docSnap) {
  const resource = docSnap.data();
  return {
    id: docSnap.id,
    name: normalizeName(resource?.Organization),
    address: formatResourceAddress(resource),
    existingLatitude: normalizeCoordinateValue(resource?.Latitude),
    existingLongitude: normalizeCoordinateValue(resource?.Longitude),
    resource
  };
}

async function buildPreviewEntries(resourceDocs) {
  const previewEntries = [];

  for (const docSnap of resourceDocs) {
    const base = toPreviewEntry(docSnap);

    if (hasValidCoordinates(base.resource)) {
      previewEntries.push({
        ...base,
        status: "skipped_existing",
        message: "Skipped because valid coordinates already exist."
      });
      continue;
    }

    const geocodeResult = await geocodeResource(base.resource);
    if (geocodeResult.ok) {
      previewEntries.push({
        ...base,
        status: "ready",
        latitude: geocodeResult.latitude,
        longitude: geocodeResult.longitude,
        matchedQuery: geocodeResult.query,
        displayName: geocodeResult.displayName,
        message: "Ready to backfill."
      });
      continue;
    }

    previewEntries.push({
      ...base,
      status: "failed",
      matchedQuery: "",
      displayName: "",
      reason: geocodeResult.reason,
      attemptedQueries: geocodeResult.queries || [],
      needsManualCleanup: true,
      message: "Manual cleanup required before coordinates can be backfilled."
    });
  }

  return previewEntries;
}

function logSummary(summary) {
  console.log(`Mode: ${summary.mode}`);
  console.log(`Total resources scanned: ${summary.total}`);
  console.log(`Skipped with existing coordinates: ${summary.skippedExisting}`);
  if (summary.mode === "preview") {
    console.log(`Ready to backfill: ${summary.ready}`);
  }
  if (summary.mode === "run") {
    console.log(`Updated: ${summary.updated}`);
  }
  console.log(`Failed / manual cleanup: ${summary.failed}`);
}

function logPreviewEntries(entries) {
  for (const entry of entries) {
    if (entry.status === "skipped_existing") {
      console.log(`[SKIP] ${entry.id} | ${entry.name} | existing ${entry.existingLatitude}, ${entry.existingLongitude}`);
      continue;
    }

    if (entry.status === "ready") {
      console.log(`[READY] ${entry.id} | ${entry.name} | ${entry.latitude}, ${entry.longitude} | ${entry.matchedQuery}`);
      continue;
    }

    console.log(`[FAIL] ${entry.id} | ${entry.name} | ${entry.reason}`);
  }
}

async function runBackfill(db, resourceDocs) {
  const results = [];

  for (const docSnap of resourceDocs) {
    const base = toPreviewEntry(docSnap);

    if (hasValidCoordinates(base.resource)) {
      results.push({
        ...base,
        status: "skipped_existing",
        message: "Skipped because valid coordinates already exist."
      });
      console.log(`[SKIP] ${base.id} | ${base.name} | existing ${base.existingLatitude}, ${base.existingLongitude}`);
      continue;
    }

    const geocodeResult = await geocodeResource(base.resource);
    if (!geocodeResult.ok) {
      results.push({
        ...base,
        status: "failed",
        reason: geocodeResult.reason,
        attemptedQueries: geocodeResult.queries || [],
        needsManualCleanup: true,
        message: "Manual cleanup required before coordinates can be backfilled."
      });
      console.log(`[FAIL] ${base.id} | ${base.name} | ${geocodeResult.reason}`);
      continue;
    }

    await db.collection("resources").doc(base.id).update({
      Latitude: geocodeResult.latitude,
      Longitude: geocodeResult.longitude,
      updatedAt: FieldValue.serverTimestamp(),
      updatedByUid: TOOL_ACTOR_UID,
      updatedByEmail: TOOL_ACTOR_EMAIL
    });

    results.push({
      ...base,
      status: "updated",
      latitude: geocodeResult.latitude,
      longitude: geocodeResult.longitude,
      matchedQuery: geocodeResult.query,
      displayName: geocodeResult.displayName,
      message: "Coordinates written to Firestore."
    });
    console.log(`[UPDATED] ${base.id} | ${base.name} | ${geocodeResult.latitude}, ${geocodeResult.longitude}`);
  }

  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = String(args.run || "").toLowerCase() === "true" ? "run" : "preview";
  const reportPath = path.resolve(args.report || defaultReportPath(mode));

  initAdminApp();
  const db = getFirestore();

  const snapshot = await db.collection("resources").get();
  const docs = limitEntries(snapshot.docs, args.limit);

  if (docs.length === 0) {
    console.log("No resource documents found.");
    return;
  }

  console.log(`Scanning ${docs.length} resource document(s) in ${mode} mode...`);
  console.log("Resources with valid Latitude and Longitude are skipped automatically.");
  console.log("Geocoding failures are written to the report for manual cleanup.");

  const entries = mode === "run"
    ? await runBackfill(db, docs)
    : await buildPreviewEntries(docs);

  const summary = summarizeEntries(entries, mode);
  await writeReport(reportPath, summary, entries);
  logSummary(summary);

  if (mode === "preview") {
    logPreviewEntries(entries);
  }

  console.log(`Report written to: ${reportPath}`);
}

main().catch(error => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
