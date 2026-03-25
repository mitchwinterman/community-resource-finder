import { db, auth } from "./firebase.js";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getIdTokenResult
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const loginScreen = document.getElementById("login-screen");
const toolScreen = document.getElementById("tool-screen");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logoutBtn");
const bootstrapBtn = document.getElementById("bootstrapBtn");
const previewBtn = document.getElementById("previewBtn");
const runBtn = document.getElementById("runBtn");
const logEl = document.getElementById("log");
const rowsEl = document.getElementById("rows");

let previewRows = [];
let organizations = [];

function normalizeString(value) {
  return String(value ?? "").trim();
}

function clearChildren(el) {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
}

function appendLog(message) {
  const stamp = new Date().toISOString();
  logEl.textContent += `[${stamp}] ${message}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

function normalizeNameForMatch(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function slugify(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getCurrentActor() {
  return {
    uid: auth.currentUser?.uid || "",
    email: normalizeString(auth.currentUser?.email)
  };
}

async function userHasAdminClaim(user) {
  if (!user) return false;

  try {
    const tokenResult = await getIdTokenResult(user, true);
    return tokenResult?.claims?.admin === true;
  } catch (err) {
    console.error("Error reading admin claim:", err);
    return false;
  }
}

function suggestOrganizationId(resource, orgs) {
  const candidates = [
    normalizeString(resource.OrganizationName),
    normalizeString(resource.Organization)
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeNameForMatch(candidate);
    const match = orgs.find(org => normalizeNameForMatch(org.name) === normalizedCandidate);
    if (match) return match.id;
  }

  return "";
}

function createRow(resource, suggestedOrganizationId) {
  const row = document.createElement("div");
  row.className = "backfill-row";
  row.dataset.resourceId = resource.id;
  row.dataset.currentOrganizationId = normalizeString(resource.organizationId);

  const resourceCell = document.createElement("div");
  resourceCell.className = "backfill-resource";

  const title = document.createElement("strong");
  title.textContent = normalizeString(resource.Organization) || "(Unnamed resource)";
  resourceCell.appendChild(title);

  const detailBits = [];
  if (normalizeString(resource.OrganizationName)) {
    detailBits.push(`OrganizationName: ${normalizeString(resource.OrganizationName)}`);
  }
  if (normalizeString(resource.organizationId)) {
    detailBits.push(`Current owner id: ${normalizeString(resource.organizationId)}`);
  } else {
    detailBits.push("Current owner id: none");
  }
  resourceCell.appendChild(document.createTextNode(detailBits.join(" | ")));
  row.appendChild(resourceCell);

  const ownerCell = document.createElement("div");
  ownerCell.className = "backfill-cell";
  const ownerLabel = document.createElement("label");
  ownerLabel.textContent = "Owning Organization";
  const ownerSelect = document.createElement("select");
  ownerSelect.className = "resource-org-select";

  const blankOwner = document.createElement("option");
  blankOwner.value = "";
  blankOwner.textContent = "Select organization";
  ownerSelect.appendChild(blankOwner);

  organizations.forEach(org => {
    const option = document.createElement("option");
    option.value = org.id;
    option.textContent = org.name;
    ownerSelect.appendChild(option);
  });

  ownerSelect.value = normalizeString(resource.organizationId) || suggestedOrganizationId || "";
  ownerCell.appendChild(ownerLabel);
  ownerCell.appendChild(ownerSelect);

  if (suggestedOrganizationId && !normalizeString(resource.organizationId)) {
    const note = document.createElement("div");
    note.className = "backfill-note";
    const suggestedOrg = organizations.find(org => org.id === suggestedOrganizationId);
    note.textContent = suggestedOrg
      ? `Suggested from exact name match: ${suggestedOrg.name}`
      : "Suggested from exact name match";
    ownerCell.appendChild(note);
  }

  row.appendChild(ownerCell);

  const statusCell = document.createElement("div");
  statusCell.className = "backfill-cell";
  const statusLabel = document.createElement("label");
  statusLabel.textContent = "Publication Status";
  const statusSelect = document.createElement("select");
  statusSelect.className = "resource-status-select";
  [
    ["published", "Published"],
    ["draft", "Draft"],
    ["archived", "Archived"]
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    statusSelect.appendChild(option);
  });
  statusSelect.value = normalizeString(resource.status) || "published";
  statusCell.appendChild(statusLabel);
  statusCell.appendChild(statusSelect);
  row.appendChild(statusCell);

  const submissionCell = document.createElement("div");
  submissionCell.className = "backfill-cell";
  const submissionLabel = document.createElement("label");
  submissionLabel.textContent = "Submission State";
  const submissionSelect = document.createElement("select");
  submissionSelect.className = "resource-submission-select";
  [
    ["approved", "Approved"],
    ["pending", "Pending Review"],
    ["rejected", "Rejected"],
    ["cancelled", "Cancelled"]
  ].forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    submissionSelect.appendChild(option);
  });
  submissionSelect.value = normalizeString(resource.submissionState) || "approved";
  submissionCell.appendChild(submissionLabel);
  submissionCell.appendChild(submissionSelect);
  row.appendChild(submissionCell);

  const noteCell = document.createElement("div");
  noteCell.className = "backfill-cell";
  const noteLabel = document.createElement("label");
  noteLabel.textContent = "Needs";
  const noteBody = document.createElement("div");
  const needs = [];
  if (!normalizeString(resource.organizationId)) needs.push("owner");
  if (!normalizeString(resource.status)) needs.push("status");
  if (!normalizeString(resource.submissionState)) needs.push("submission");
  noteBody.textContent = needs.length ? needs.join(", ") : "manual review";
  noteCell.appendChild(noteLabel);
  noteCell.appendChild(noteBody);
  row.appendChild(noteCell);

  return row;
}

async function loadSnapshot() {
  const [orgSnap, resourceSnap] = await Promise.all([
    getDocs(collection(db, "organizations")),
    getDocs(collection(db, "resources"))
  ]);

  organizations = [];
  orgSnap.forEach(ds => {
    const data = ds.data() || {};
    const name = normalizeString(data.name);
    if (!name) return;
    organizations.push({ id: ds.id, name });
  });
  organizations.sort((a, b) => a.name.localeCompare(b.name));

  const resources = [];
  resourceSnap.forEach(ds => resources.push({ id: ds.id, ...ds.data() }));
  return resources;
}

function buildUniqueOrganizationDocId(name, existingIds) {
  const base = slugify(name) || "organization";
  let candidate = base;
  let counter = 2;

  while (existingIds.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }

  existingIds.add(candidate);
  return candidate;
}

async function bootstrapOrganizations() {
  logEl.textContent = "";
  appendLog("Bootstrapping organizations from distinct resource names...");

  try {
    const actor = getCurrentActor();
    const [orgSnap, resourceSnap] = await Promise.all([
      getDocs(collection(db, "organizations")),
      getDocs(collection(db, "resources"))
    ]);

    const existingByNormalizedName = new Map();
    const existingIds = new Set();

    orgSnap.forEach(ds => {
      const data = ds.data() || {};
      const name = normalizeString(data.name);
      if (!name) return;
      existingByNormalizedName.set(normalizeNameForMatch(name), ds.id);
      existingIds.add(ds.id);
    });

    const candidateNames = new Map();
    resourceSnap.forEach(ds => {
      const data = ds.data() || {};
      const name = normalizeString(data.Organization) || normalizeString(data.OrganizationName);
      if (!name) return;

      const key = normalizeNameForMatch(name);
      if (!key || existingByNormalizedName.has(key) || candidateNames.has(key)) return;

      candidateNames.set(key, {
        name,
        primaryEmail: normalizeString(data.Email),
        phone: normalizeString(data.Phone),
        website: normalizeString(data.Website)
      });
    });

    if (!candidateNames.size) {
      appendLog("No new organization records were needed.");
      return;
    }

    let created = 0;
    for (const org of candidateNames.values()) {
      const docId = buildUniqueOrganizationDocId(org.name, existingIds);
      await setDoc(doc(db, "organizations", docId), {
        name: org.name,
        status: "active",
        primaryEmail: org.primaryEmail,
        phone: org.phone,
        website: org.website,
        notes: "Bootstrapped from existing resource data during Phase 2A.",
        createdAt: serverTimestamp(),
        createdBy: actor.uid,
        createdByEmail: actor.email,
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
        updatedByEmail: actor.email
      });

      created += 1;
      if (created % 25 === 0) {
        appendLog(`Created ${created} organization doc(s) so far...`);
      }
    }

    appendLog(`Bootstrap complete. Created ${created} organization doc(s).`);
  } catch (err) {
    console.error("Bootstrap error:", err);
    appendLog(`ERROR: ${err?.message || err}`);
  }
}

async function previewBackfill() {
  clearChildren(rowsEl);
  previewRows = [];
  logEl.textContent = "";
  appendLog("Scanning Firestore for resources missing ownership or publication metadata...");

  try {
    const resources = await loadSnapshot();

    if (!organizations.length) {
      appendLog("No organizations found. Create organization records in admin.html before using this tool.");
      return;
    }

    const candidates = resources
      .map(resource => ({
        resource,
        suggestedOrganizationId: suggestOrganizationId(resource, organizations)
      }))
      .filter(item =>
        !normalizeString(item.resource.organizationId) ||
        !normalizeString(item.resource.status) ||
        !normalizeString(item.resource.submissionState)
      )
      .sort((a, b) => normalizeString(a.resource.Organization).localeCompare(normalizeString(b.resource.Organization)));

    previewRows = candidates;
    const suggestedCount = candidates.filter(item => item.suggestedOrganizationId).length;

    candidates.forEach(item => rowsEl.appendChild(createRow(item.resource, item.suggestedOrganizationId)));

    appendLog(`Loaded ${organizations.length} organization doc(s).`);
    appendLog(`Preview complete. ${candidates.length} resource doc(s) need backfill.`);
    appendLog(`${suggestedCount} resource doc(s) received an exact-name owner suggestion.`);
    if (!candidates.length) {
      appendLog("No resources require ownership/status backfill.");
    }
  } catch (err) {
    console.error("Backfill preview error:", err);
    appendLog(`ERROR: ${err?.message || err}`);
  }
}

async function runBackfill() {
  if (!previewRows.length) {
    appendLog("Run a preview first.");
    return;
  }

  const actor = getCurrentActor();
  let updated = 0;
  let skipped = 0;
  appendLog("Starting ownership backfill...");

  for (const previewItem of previewRows) {
    const { resource } = previewItem;
    const row = rowsEl.querySelector(`[data-resource-id="${resource.id}"]`);
    if (!row) continue;

    const selectedOrganizationId = normalizeString(row.querySelector(".resource-org-select")?.value);
    const selectedStatus = normalizeString(row.querySelector(".resource-status-select")?.value) || "published";
    const selectedSubmissionState = normalizeString(row.querySelector(".resource-submission-select")?.value) || "approved";

    const payload = {
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByEmail: actor.email
    };

    let shouldWrite = false;

    if (selectedOrganizationId && selectedOrganizationId !== normalizeString(resource.organizationId)) {
      payload.organizationId = selectedOrganizationId;
      shouldWrite = true;
    }

    if (!normalizeString(resource.status)) {
      payload.status = selectedStatus;
      shouldWrite = true;
    }

    if (!normalizeString(resource.submissionState)) {
      payload.submissionState = selectedSubmissionState;
      shouldWrite = true;
    }

    if (!normalizeString(resource.lastSubmittedBy)) {
      payload.lastSubmittedAt = serverTimestamp();
      payload.lastSubmittedBy = actor.uid;
      shouldWrite = true;
    }

    const effectiveStatus = payload.status || normalizeString(resource.status) || selectedStatus;
    const effectiveSubmissionState = payload.submissionState || normalizeString(resource.submissionState) || selectedSubmissionState;
    if (
      effectiveStatus === "published" &&
      effectiveSubmissionState === "approved" &&
      !resource.lastApprovedAt
    ) {
      payload.lastApprovedAt = serverTimestamp();
      payload.lastApprovedBy = actor.uid;
      shouldWrite = true;
    }

    if (!selectedOrganizationId && !normalizeString(resource.organizationId)) {
      skipped += 1;
      appendLog(`SKIPPED ${resource.id} (${normalizeString(resource.Organization) || "Unnamed"}): no organization selected.`);
      continue;
    }

    if (!shouldWrite) {
      continue;
    }

    try {
      await updateDoc(doc(db, "resources", resource.id), payload);
      updated += 1;
      if (updated % 25 === 0) {
        appendLog(`Updated ${updated} resource doc(s) so far...`);
      }
    } catch (err) {
      console.error("Backfill update error:", err);
      appendLog(`ERROR updating ${resource.id}: ${err?.message || err}`);
    }
  }

  appendLog(`Ownership backfill complete. Updated ${updated} resource doc(s); skipped ${skipped}.`);
}

loginBtn?.addEventListener("click", async () => {
  loginError.textContent = "";

  const email = normalizeString(emailInput.value);
  const password = passwordInput.value;
  if (!email || !password) {
    loginError.textContent = "Please enter email and password.";
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error("Login error:", err);
    loginError.textContent = err?.message || "Login failed.";
  }
});

logoutBtn?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.error("Logout error:", err);
  }
});

previewBtn?.addEventListener("click", previewBackfill);
runBtn?.addEventListener("click", runBackfill);
bootstrapBtn?.addEventListener("click", bootstrapOrganizations);

onAuthStateChanged(auth, async user => {
  if (!user) {
    loginScreen.classList.remove("hidden");
    toolScreen.classList.add("hidden");
    loginError.textContent = "";
    return;
  }

  const isAdmin = await userHasAdminClaim(user);
  if (!isAdmin) {
    loginScreen.classList.remove("hidden");
    toolScreen.classList.add("hidden");
    loginError.textContent = `Signed in as ${user.email || "(no email)"} but this account does not have the required admin claim.`;
    await signOut(auth);
    return;
  }

  loginScreen.classList.add("hidden");
  toolScreen.classList.remove("hidden");
  appendLog(`Authenticated as ${user.email || "(no email)"}.`);
});
