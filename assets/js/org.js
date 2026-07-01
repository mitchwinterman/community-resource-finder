import { db, auth } from "./firebase.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  query,
  updateDoc,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getWebsiteDisplayText,
  getResourceTitle,
  normalizeWebsiteList,
  normalizePhoneEntries
} from "./contact-fields.js";
import {
  getAccessProfile,
  redirectToPortalForProfile,
  redirectToUnifiedLogin
} from "./auth-routing.js";
import {
  ORG_EDITABLE_RESOURCE_FIELDS as orgEditableResourceFields,
  isOrgResourceRequestType,
  normalizeResourceRequestType
} from "./request-contract.js";

const loginScreen = document.getElementById("login-screen");
const orgScreen = document.getElementById("org-screen");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logoutBtn");
const orgStatusBanner = document.getElementById("org-status-banner");
const organizationSummary = document.getElementById("organization-summary");
const organizationEditor = document.getElementById("organization-editor");
const organizationForm = document.getElementById("organization-form");
const editOrganizationBtn = document.getElementById("edit-organization-btn");
const saveOrganizationBtn = document.getElementById("save-organization-btn");
const cancelOrganizationBtn = document.getElementById("cancel-organization-btn");

const resourceList = document.getElementById("resource-list");
const resourceEditor = document.getElementById("resource-editor");
const editorTitle = document.getElementById("editor-title");
const resourceForm = document.getElementById("resource-form");
const submitterNotesInput = document.getElementById("submitter-notes");
const submitRequestBtn = document.getElementById("submit-request-btn");
const cancelResourceBtn = document.getElementById("cancel-resource-btn");
const deleteResourceRequestBtn = document.getElementById("delete-resource-request-btn");
const requestList = document.getElementById("request-list");
const addResourceBtn = document.getElementById("add-resource-btn");

let membershipDoc = null;
let organizationDoc = null;
let categoryMeta = [];
let resourceMeta = [];
let requestMeta = [];
let editingResource = null;
let editingResourceMode = "edit";
let editingPendingRequest = null;

const quillEditors = new Map();
const quillToolbarOptions = [
  ["bold", "italic", "underline"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["link", "clean"]
];
const quillFormats = ["bold", "italic", "underline", "list", "link"];
const richTextAllowedTags = ["a", "br", "em", "li", "ol", "p", "strong", "u", "ul"];
const richTextAllowedAttrs = ["href"];
function show(el) {
  el?.classList.remove("hidden");
}

function hide(el) {
  el?.classList.add("hidden");
}

function clearChildren(el) {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => normalizeString(item)).filter(Boolean);
}

function normalizeCoordinateValue(value) {
  const normalized = normalizeString(value);
  if (!normalized) return "";

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : normalized;
}

function normalizeMapIncludeValue(value, defaultValue = true) {
  if (typeof value === "boolean") return value;

  const normalized = normalizeString(value).toLowerCase();
  if (!normalized) return defaultValue;
  if (["true", "yes", "y", "1", "include"].includes(normalized)) return true;
  if (["false", "no", "n", "0", "exclude"].includes(normalized)) return false;
  return defaultValue;
}

function normalizeRequestStatus(value) {
  const status = normalizeString(value).toLowerCase();
  if (status === "approved" || status === "rejected" || status === "cancelled") return status;
  return "pending";
}

function normalizeRequestType(value) {
  return normalizeResourceRequestType(value) || "resource_edit";
}

function getRequestTypeLabel(value) {
  const requestType = normalizeRequestType(value);
  if (requestType === "resource_create") return "New resource";
  if (requestType === "resource_delete") return "Delete resource";
  if (requestType === "quarterly_confirmation") return "Quarterly confirmation";
  return "Resource update";
}

function formatRequestTimestamp(value) {
  if (value?.toDate) {
    return value.toDate().toLocaleString();
  }
  return "";
}

function createEl(tag, opts = {}) {
  const el = document.createElement(tag);
  if (opts.className) el.className = opts.className;
  if (opts.text != null) el.textContent = opts.text;
  if (opts.attrs) {
    for (const [key, value] of Object.entries(opts.attrs)) {
      el.setAttribute(key, value);
    }
  }
  return el;
}

function getQuillCtor() {
  if (typeof window.Quill !== "function") {
    throw new Error("Quill failed to load.");
  }
  return window.Quill;
}

function getDOMPurify() {
  if (!window.DOMPurify) {
    throw new Error("DOMPurify failed to load.");
  }
  return window.DOMPurify;
}

function sanitizeRichTextHtml(html) {
  const DOMPurify = getDOMPurify();
  const clean = DOMPurify.sanitize(String(html ?? ""), {
    ALLOWED_TAGS: richTextAllowedTags,
    ALLOWED_ATTR: richTextAllowedAttrs
  });

  const template = document.createElement("template");
  template.innerHTML = clean;
  if (!normalizeString(template.content.textContent || "")) {
    return "";
  }

  return clean;
}

function normalizeStoredDelta(deltaValue) {
  let parsed = deltaValue;
  if (!parsed) return null;

  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.ops)) {
    return null;
  }

  return parsed;
}

function loadQuillContents(quill, htmlValue, deltaValue) {
  const delta = normalizeStoredDelta(deltaValue);
  if (delta) {
    quill.setContents(delta, "api");
    quill.history.clear();
    return;
  }

  const cleanHtml = sanitizeRichTextHtml(htmlValue);
  if (cleanHtml) {
    quill.clipboard.dangerouslyPasteHTML(cleanHtml, "api");
  } else {
    quill.setText("", "api");
  }

  quill.history.clear();
}

function exportQuillContents(quill) {
  if (normalizeString(quill.getText()) === "") {
    return { html: "", delta: null };
  }

  const delta = JSON.parse(JSON.stringify(quill.getContents()));
  const rawHtml = typeof quill.getSemanticHTML === "function"
    ? quill.getSemanticHTML()
    : quill.root.innerHTML;

  return {
    html: sanitizeRichTextHtml(rawHtml),
    delta
  };
}

function sanitizeRequestedResourceData(value) {
  const source = value && typeof value === "object" ? value : {};
  const payload = {};

  orgEditableResourceFields.forEach(field => {
    const rawValue = field === "resourceTitle"
      ? source.resourceTitle ?? source.Organization
      : source[field];

    if (field === "Description" || field === "Notes") {
      payload[field] = sanitizeRichTextHtml(rawValue);
      return;
    }

    if (field === "DescriptionDelta" || field === "NotesDelta") {
      payload[field] = normalizeStoredDelta(rawValue);
      return;
    }

    if (field === "Categories" || field === "Subcategories") {
      payload[field] = normalizeStringArray(rawValue);
      return;
    }

    if (field === "Latitude" || field === "Longitude") {
      payload[field] = normalizeCoordinateValue(rawValue);
      return;
    }

    if (field === "Websites") {
      payload[field] = normalizeWebsiteList(rawValue);
      return;
    }

    if (field === "PhoneNumbers") {
      payload[field] = normalizePhoneEntries(rawValue);
      return;
    }

    payload[field] = normalizeString(rawValue);
  });

  payload.Website = "";
  payload.Phone = "";
  return payload;
}

function setBanner(text) {
  orgStatusBanner.textContent = text;
}

function getCurrentActor() {
  return {
    uid: auth.currentUser?.uid || "",
    email: normalizeString(auth.currentUser?.email)
  };
}

async function logOrgAuditEvent({
  action = "",
  entityType = "",
  entityId = "",
  entityLabel = "",
  organizationId = "",
  relatedResourceId = "",
  relatedRequestId = "",
  summary = "",
  details = {}
} = {}) {
  try {
    const actor = getCurrentActor();
    await addDoc(collection(db, "audit_logs"), {
      area: "requests",
      action: normalizeString(action),
      entityType: normalizeString(entityType),
      entityId: normalizeString(entityId),
      entityLabel: normalizeString(entityLabel),
      organizationId: normalizeString(organizationId),
      relatedResourceId: normalizeString(relatedResourceId),
      relatedRequestId: normalizeString(relatedRequestId),
      relatedMailId: "",
      actorType: "org_editor",
      actorUid: actor.uid,
      actorEmail: actor.email,
      source: "org_portal",
      summary: normalizeString(summary),
      details: details && typeof details === "object" ? details : {},
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.error("Org audit log write failed:", err);
  }
}

async function loadOrganizationForMembership(membership) {
  const organizationId = normalizeString(membership?.organizationId);
  if (!organizationId) {
    organizationDoc = null;
    renderOrganizationSummary();
    return null;
  }

  const organizationSnap = await getDoc(doc(db, "organizations", organizationId));
  organizationDoc = organizationSnap.exists() ? { id: organizationSnap.id, ...organizationSnap.data() } : null;
  renderOrganizationSummary();
  return organizationDoc;
}

function renderOrganizationSummary() {
  clearChildren(organizationSummary);
  if (!organizationSummary) return;

  const summaryRows = [
    ["Organization", normalizeString(organizationDoc?.name) || "(Unnamed organization)"],
    ["Primary Email", normalizeString(organizationDoc?.primaryEmail) || "(Not set)"],
    ["Phone", normalizeString(organizationDoc?.phone) || "(Not set)"],
    ["Website", normalizeString(organizationDoc?.website) || ""]
  ];

  summaryRows.forEach(([label, value]) => {
    const row = createEl("div", { className: "organization-summary-row" });
    row.appendChild(createEl("strong", { text: label }));

    if (label === "Website" && value) {
      const href = normalizeWebsiteList(value)[0] || value;
      row.appendChild(createEl("a", {
        text: getWebsiteDisplayText(href) || href,
        attrs: { href, target: "_blank", rel: "noopener noreferrer" }
      }));
    } else {
      row.appendChild(createEl("span", { text: value || "(Not set)" }));
    }

    organizationSummary.appendChild(row);
  });
}

async function loadCategories() {
  const snap = await getDocs(collection(db, "categories"));
  const categories = [];
  snap.forEach(ds => {
    const data = ds.data() || {};
    categories.push({
      id: ds.id,
      name: normalizeString(data.name),
      subcategories: normalizeStringArray(data.subcategories)
    });
  });
  categories.sort((a, b) => a.name.localeCompare(b.name));
  categoryMeta = categories;
}

async function loadOwnedResources() {
  resourceList.textContent = "Loading...";
  const orgId = normalizeString(membershipDoc?.organizationId);
  const snap = await getDocs(query(collection(db, "resources"), where("organizationId", "==", orgId)));
  const resources = [];
  snap.forEach(ds => resources.push({ id: ds.id, ...ds.data() }));
  resources.sort((a, b) => getResourceTitle(a).localeCompare(getResourceTitle(b)));
  resourceMeta = resources;
  renderResourceList(resources);
}

async function loadRequests() {
  requestList.textContent = "Loading...";
  const orgId = normalizeString(membershipDoc?.organizationId);
  const snap = await getDocs(query(collection(db, "resource_change_requests"), where("organizationId", "==", orgId)));
  const requests = [];
  snap.forEach(ds => requests.push({ id: ds.id, ...ds.data() }));
  requests.sort((a, b) => {
    const aTime = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
    const bTime = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
    return bTime - aTime;
  });
  requestMeta = requests;
  renderRequestList(requests);
}

async function markMatchingInvitesAccepted() {
  const email = normalizeString(auth.currentUser?.email).toLowerCase();
  const organizationId = normalizeString(membershipDoc?.organizationId);
  if (!email || !organizationId) return;

  const snap = await getDocs(query(
    collection(db, "editor_invites"),
    where("organizationId", "==", organizationId),
    where("email", "==", email),
    where("status", "==", "sent")
  ));

  if (snap.empty) return;

  await Promise.all(snap.docs.map(async ds => {
    await updateDoc(doc(db, "editor_invites", ds.id), {
      status: "accepted",
      firebaseUid: auth.currentUser?.uid || "",
      acceptedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await logOrgAuditEvent({
      action: "invite.accepted",
      entityType: "editor_invite",
      entityId: ds.id,
      entityLabel: email,
      organizationId,
      summary: `Accepted invite for ${email}`,
      details: {}
    });
  }));
}

function renderResourceList(resources) {
  clearChildren(resourceList);

  if (!resources.length) {
    resourceList.textContent = "No resources are assigned to your organization.";
    return;
  }

  resources.forEach(resource => {
    const row = createEl("div", { className: "list-row list-row-stacked" });
    row.appendChild(createEl("div", {
      className: "list-row-title",
      text: getResourceTitle(resource) || "(Unnamed resource)"
    }));

    const pendingCount = requestMeta.filter(requestDoc =>
      normalizeString(requestDoc.resourceId) === resource.id &&
      normalizeString(requestDoc.status) === "pending"
    ).length;

    const metaBits = [
      normalizeString(resource.status) || "published"
    ];
    if (pendingCount > 0) {
      metaBits.push(`${pendingCount} pending request(s)`);
    }

    row.appendChild(createEl("div", {
      className: "list-row-meta",
      text: metaBits.join(" | ")
    }));
    row.addEventListener("click", () => openResourceEditor(resource));
    resourceList.appendChild(row);
  });
}

async function cancelPendingRequest(requestDoc) {
  const requestName = normalizeString(requestDoc?.resourceName) || "this request";
  const confirmed = window.confirm(
    `Cancel the pending request for "${requestName}"?\n\nThis will remove it from library review.`
  );
  if (!confirmed) return;

  await updateDoc(doc(db, "resource_change_requests", requestDoc.id), {
    status: "cancelled",
    cancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await logOrgAuditEvent({
    action: "request.cancelled",
    entityType: "request",
    entityId: requestDoc.id,
    entityLabel: normalizeString(requestDoc.resourceName),
    organizationId: normalizeString(membershipDoc?.organizationId),
    relatedResourceId: normalizeString(requestDoc.resourceId),
    relatedRequestId: requestDoc.id,
    summary: `Cancelled pending request for ${normalizeString(requestDoc.resourceName) || requestDoc.id}`,
    details: {
      requestType: normalizeRequestType(requestDoc.requestType)
    }
  });

  await loadRequests();
  await loadOwnedResources();
}

function openPendingRequestEditor(requestDoc) {
  const requestType = normalizeRequestType(requestDoc?.requestType);
  if (!["resource_create", "resource_edit"].includes(requestType)) {
    return;
  }

  const baseResource = requestType === "resource_create"
    ? createNewResourceDraft()
    : resourceMeta.find(resource => resource.id === normalizeString(requestDoc.resourceId)) || { id: normalizeString(requestDoc.resourceId) };

  editingPendingRequest = requestDoc;
  editingResourceMode = requestType === "resource_create" ? "create" : "edit";
  editingResource = {
    ...baseResource,
    ...(requestDoc?.proposedData || {})
  };

  if (requestType === "resource_edit") {
    editingResource.id = normalizeString(requestDoc.resourceId) || normalizeString(baseResource.id);
  }

  buildResourceForm(editingResource);
  submitterNotesInput.value = normalizeString(requestDoc.submitterNotes);
  show(resourceEditor);
}

async function editPendingDeleteRequest(requestDoc) {
  const nextNotes = window.prompt(
    "Update notes for library staff:",
    normalizeString(requestDoc?.submitterNotes)
  );
  if (nextNotes == null) return;

  await updateDoc(doc(db, "resource_change_requests", requestDoc.id), {
    submitterNotes: normalizeString(nextNotes),
    updatedAt: serverTimestamp()
  });

  await logOrgAuditEvent({
    action: "request.updated",
    entityType: "request",
    entityId: requestDoc.id,
    entityLabel: normalizeString(requestDoc.resourceName),
    organizationId: normalizeString(membershipDoc?.organizationId),
    relatedResourceId: normalizeString(requestDoc.resourceId),
    relatedRequestId: requestDoc.id,
    summary: `Updated pending delete request for ${normalizeString(requestDoc.resourceName) || requestDoc.id}`,
    details: {
      requestType: normalizeRequestType(requestDoc.requestType)
    }
  });

  await loadRequests();
}

function renderRequestList(requests) {
  clearChildren(requestList);

  const sections = [
    { status: "pending", label: "Pending" },
    { status: "approved", label: "Approved" },
    { status: "rejected", label: "Rejected" },
    { status: "cancelled", label: "Cancelled" }
  ];

  sections.forEach(section => {
    const sectionWrap = createEl("div", { className: "request-history-section" });
    sectionWrap.appendChild(createEl("h4", { text: section.label }));

    const sectionItems = requests.filter(requestDoc => normalizeRequestStatus(requestDoc.status) === section.status);
    if (!sectionItems.length) {
      sectionWrap.appendChild(createEl("div", {
        className: "request-history-empty",
        text: `No ${section.label.toLowerCase()} requests.`
      }));
      requestList.appendChild(sectionWrap);
      return;
    }

    sectionItems.forEach(requestDoc => {
      const row = createEl("div", { className: "list-row list-row-stacked" });
      row.appendChild(createEl("div", {
        className: "list-row-title",
        text: normalizeString(requestDoc.resourceName) || "(Unnamed request)"
      }));
      row.appendChild(createEl("div", {
        className: "list-row-meta",
        text: [
          section.label,
          getRequestTypeLabel(requestDoc.requestType),
          normalizeString(requestDoc.submittedByEmail) || normalizeString(requestDoc.submittedByUid),
          formatRequestTimestamp(requestDoc.createdAt)
        ].filter(Boolean).join(" | ")
      }));

      const reviewNotes = normalizeString(requestDoc.reviewNotes);
      if (reviewNotes) {
        row.appendChild(createEl("div", {
          className: "request-history-note",
          text: `${section.status === "rejected" ? "Rejection notes" : "Library notes"}: ${reviewNotes}`
        }));
      }

      if (section.status === "pending") {
        const actions = createEl("div", { className: "request-history-actions" });

        const editBtn = createEl("button", { text: "Edit Request", attrs: { type: "button" } });
        editBtn.addEventListener("click", async event => {
          event.stopPropagation();
          try {
            if (normalizeRequestType(requestDoc.requestType) === "resource_delete") {
              await editPendingDeleteRequest(requestDoc);
            } else {
              openPendingRequestEditor(requestDoc);
            }
          } catch (err) {
            console.error("Error editing pending request:", err);
            alert("Error loading the pending request. See console for details.");
          }
        });

        const cancelBtn = createEl("button", {
          text: "Cancel Request",
          className: "danger-btn",
          attrs: { type: "button" }
        });
        cancelBtn.addEventListener("click", async event => {
          event.stopPropagation();
          try {
            await cancelPendingRequest(requestDoc);
          } catch (err) {
            console.error("Error cancelling pending request:", err);
            alert("Error cancelling the pending request. See console for details.");
          }
        });

        actions.appendChild(editBtn);
        actions.appendChild(cancelBtn);
        row.appendChild(actions);
      }

      sectionWrap.appendChild(row);
    });

    requestList.appendChild(sectionWrap);
  });
}

function buildFieldText(fieldKey, label, value = "", required = false) {
  const wrap = createEl("div", {
    className: "field-group",
    attrs: { "data-field": fieldKey, "data-type": "text" }
  });
  const lbl = createEl("label", { className: "field-label", text: label });
  const input = createEl("input", { attrs: { type: "text" } });
  input.value = normalizeString(value);
  if (required) input.required = true;
  wrap.appendChild(lbl);
  wrap.appendChild(input);
  return wrap;
}

function buildOrganizationForm(organization) {
  clearChildren(organizationForm);
  organizationForm.appendChild(buildFieldText("primaryEmail", "Primary Email", organization?.primaryEmail || "", false));
  organizationForm.appendChild(buildFieldText("phone", "Phone", organization?.phone || "", false));
  organizationForm.appendChild(buildFieldText("website", "Website", organization?.website || "", false));
}

function collectOrganizationPayload() {
  const payload = {};
  const groups = Array.from(organizationForm.querySelectorAll(".field-group"));
  groups.forEach(group => {
    const field = group.dataset.field;
    const input = group.querySelector("input, textarea");
    payload[field] = input ? normalizeString(input.value) : "";
  });
  return payload;
}

function openOrganizationEditor() {
  buildOrganizationForm(organizationDoc || {});
  show(organizationEditor);
}

function closeOrganizationEditor() {
  hide(organizationEditor);
  clearChildren(organizationForm);
}

function buildFieldDate(fieldKey, label, value = "") {
  const wrap = createEl("div", {
    className: "field-group",
    attrs: { "data-field": fieldKey, "data-type": "date" }
  });
  const lbl = createEl("label", { className: "field-label", text: label });
  const input = createEl("input", { attrs: { type: "date" } });
  input.value = /^\d{4}-\d{2}-\d{2}$/.test(normalizeString(value)) ? normalizeString(value) : "";
  wrap.appendChild(lbl);
  wrap.appendChild(input);
  return wrap;
}

function buildFieldBooleanSelect(fieldKey, label, value = true, trueLabel = "Yes", falseLabel = "No") {
  const wrap = createEl("div", {
    className: "field-group",
    attrs: { "data-field": fieldKey, "data-type": "select" }
  });
  const lbl = createEl("label", { className: "field-label", text: label });
  const select = createEl("select");
  select.appendChild(createEl("option", { text: trueLabel, attrs: { value: "true" } }));
  select.appendChild(createEl("option", { text: falseLabel, attrs: { value: "false" } }));
  select.value = normalizeMapIncludeValue(value, true) ? "true" : "false";
  wrap.appendChild(lbl);
  wrap.appendChild(select);
  return wrap;
}

function buildFieldRichText(fieldKey, label, htmlValue = "", deltaValue = null) {
  const wrap = createEl("div", {
    className: "field-group quill-field",
    attrs: { "data-field": fieldKey, "data-type": "richtext" }
  });
  const lbl = createEl("label", { className: "field-label", text: label });
  const editorHost = createEl("div", { className: "quill-editor-host" });
  wrap.appendChild(lbl);
  wrap.appendChild(editorHost);

  const Quill = getQuillCtor();
  const quill = new Quill(editorHost, {
    theme: "snow",
    placeholder: `Enter ${label.toLowerCase()}...`,
    modules: {
      toolbar: quillToolbarOptions,
      history: {
        delay: 1000,
        maxStack: 100,
        userOnly: true
      }
    },
    formats: quillFormats
  });

  loadQuillContents(quill, htmlValue, deltaValue);
  quillEditors.set(fieldKey, quill);

  return wrap;
}

function buildFieldStringList(fieldKey, label, values = [], placeholder = "") {
  const wrap = createEl("div", {
    className: "field-group field-list-group",
    attrs: { "data-field": fieldKey, "data-type": "stringlist" }
  });
  const lbl = createEl("label", { className: "field-label", text: label });
  const list = createEl("div", { className: "field-list-rows" });
  const addBtn = createEl("button", {
    className: "field-list-add-btn",
    text: `+ Add ${label.endsWith("s") ? label.slice(0, -1) : label}`
  });
  addBtn.type = "button";

  function addRow(initialValue = "") {
    const row = createEl("div", { className: "field-list-row" });
    const input = createEl("input", { attrs: { type: "text", placeholder } });
    input.value = normalizeString(initialValue);
    const removeBtn = createEl("button", { className: "field-list-remove-btn", text: "Remove" });
    removeBtn.type = "button";
    removeBtn.addEventListener("click", () => row.remove());
    row.appendChild(input);
    row.appendChild(removeBtn);
    list.appendChild(row);
  }

  const initialValues = Array.isArray(values) ? values : [];
  if (initialValues.length) {
    initialValues.forEach(value => addRow(value));
  } else {
    addRow("");
  }

  addBtn.addEventListener("click", () => addRow(""));
  wrap.appendChild(lbl);
  wrap.appendChild(list);
  wrap.appendChild(addBtn);
  return wrap;
}

function buildFieldPhoneList(fieldKey, label, values = []) {
  const wrap = createEl("div", {
    className: "field-group field-list-group",
    attrs: { "data-field": fieldKey, "data-type": "phoneentries" }
  });
  const lbl = createEl("label", { className: "field-label", text: label });
  const list = createEl("div", { className: "field-list-rows" });
  const addBtn = createEl("button", {
    className: "field-list-add-btn",
    text: "+ Add Phone Number"
  });
  addBtn.type = "button";

  function addRow(entry = {}) {
    const row = createEl("div", { className: "field-list-row field-phone-row" });
    const labelInput = createEl("input", { attrs: { type: "text", placeholder: "Label (optional)" } });
    const numberInput = createEl("input", { attrs: { type: "text", placeholder: "(775) 555-1234" } });
    labelInput.value = normalizeString(entry.label);
    numberInput.value = normalizeString(entry.number);

    const removeBtn = createEl("button", { className: "field-list-remove-btn", text: "Remove" });
    removeBtn.type = "button";
    removeBtn.addEventListener("click", () => row.remove());

    row.appendChild(labelInput);
    row.appendChild(numberInput);
    row.appendChild(removeBtn);
    list.appendChild(row);
  }

  const initialValues = Array.isArray(values) ? values : [];
  if (initialValues.length) {
    initialValues.forEach(value => addRow(value));
  } else {
    addRow({});
  }

  addBtn.addEventListener("click", () => addRow({}));
  wrap.appendChild(lbl);
  wrap.appendChild(list);
  wrap.appendChild(addBtn);
  return wrap;
}

function buildNestedCategorySelector(selectedCategories, selectedSubcategories) {
  const wrapper = createEl("div", {
    className: "field-group",
    attrs: {
      "data-field": "__nested_categories__",
      "data-type": "nestedcats"
    }
  });

  wrapper.appendChild(createEl("div", { className: "field-label", text: "Categories and Subcategories" }));
  const container = createEl("div", { className: "cat-nested" });
  const selectedCatSet = new Set(normalizeStringArray(selectedCategories).map(item => item.toLowerCase()));
  const selectedSubSet = new Set(normalizeStringArray(selectedSubcategories).map(item => item.toLowerCase()));

  categoryMeta.forEach(cat => {
    const catName = normalizeString(cat.name);
    if (!catName) return;

    const block = createEl("div", { className: "cat-block" });
    const header = createEl("div", { className: "cat-header" });
    const catLabel = createEl("label", { className: "cat-row" });
    const catCb = createEl("input", { attrs: { type: "checkbox" } });
    catCb.value = catName;
    catCb.checked = selectedCatSet.has(catName.toLowerCase());
    catLabel.appendChild(catCb);
    catLabel.appendChild(createEl("span", { text: catName }));

    const toggleBtn = createEl("button", {
      className: "cat-toggle-btn",
      text: "Show",
      attrs: { type: "button", "aria-expanded": "false" }
    });

    header.appendChild(catLabel);
    header.appendChild(toggleBtn);
    block.appendChild(header);

    const subsWrap = createEl("div", { className: "cat-subs" });
    const subs = normalizeStringArray(cat.subcategories).sort((a, b) => a.localeCompare(b));
    if (subs.length) {
      const subList = createEl("div", { className: "cat-sub-list" });
      subs.forEach(sub => {
        const subRow = createEl("label", { className: "cat-sub-row" });
        const subCb = createEl("input", { attrs: { type: "checkbox" } });
        subCb.value = sub;
        subCb.checked = catCb.checked && selectedSubSet.has(sub.toLowerCase());
        subCb.disabled = !catCb.checked;
        subRow.appendChild(subCb);
        subRow.appendChild(createEl("span", { text: sub }));
        subList.appendChild(subRow);
      });
      subsWrap.appendChild(subList);
    } else {
      subsWrap.appendChild(createEl("div", { className: "cat-sub-empty", text: "(No subcategories)" }));
    }

    let expanded = catCb.checked;
    function syncSubsUI() {
      subsWrap.style.display = expanded ? "block" : "none";
      subsWrap.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.disabled = !catCb.checked;
        if (!catCb.checked) cb.checked = false;
      });
      toggleBtn.textContent = expanded ? "Hide" : "Show";
      toggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
    }

    toggleBtn.addEventListener("click", () => {
      expanded = !expanded;
      syncSubsUI();
    });
    catCb.addEventListener("change", syncSubsUI);

    block.appendChild(subsWrap);
    container.appendChild(block);
    syncSubsUI();
  });

  wrapper.appendChild(container);
  return wrapper;
}

function buildResourceForm(resource) {
  quillEditors.clear();
  clearChildren(resourceForm);
  submitterNotesInput.value = "";

  resourceForm.appendChild(buildFieldText("resourceTitle", "Resource Title", getResourceTitle(resource), true));
  resourceForm.appendChild(buildFieldRichText("Description", "Short Description", resource.Description || "", resource.DescriptionDelta || null));
  resourceForm.appendChild(buildFieldRichText("Notes", "Detailed Description", resource.Notes || "", resource.NotesDelta || null));
  resourceForm.appendChild(buildNestedCategorySelector(resource.Categories, resource.Subcategories));
  resourceForm.appendChild(buildFieldStringList("Websites", "Websites", normalizeWebsiteList(resource.Websites), "https://example.org"));
  resourceForm.appendChild(buildFieldPhoneList("PhoneNumbers", "Phone Numbers", normalizePhoneEntries(resource.PhoneNumbers)));
  resourceForm.appendChild(buildFieldText("Email", "Email", resource.Email || "", false));
  resourceForm.appendChild(buildFieldText("Address", "Address", resource.Address || "", false));
  resourceForm.appendChild(buildFieldText("City", "City", resource.City || "", false));
  resourceForm.appendChild(buildFieldText("Zip", "Zip", resource.Zip || "", false));
  resourceForm.appendChild(buildFieldText("Latitude", "Latitude", resource.Latitude ?? "", false));
  resourceForm.appendChild(buildFieldText("Longitude", "Longitude", resource.Longitude ?? "", false));
  resourceForm.appendChild(buildFieldBooleanSelect("IncludeInMap", "Include in Map", resource.IncludeInMap ?? true, "Include", "Don't Include"));
  resourceForm.appendChild(buildFieldText("Hours", "Hours", resource.Hours || "", false));
  resourceForm.appendChild(buildFieldText("Eligibility", "Eligibility", resource.Eligibility || "", false));
  resourceForm.appendChild(buildFieldText("Cost", "Cost", resource.Cost || "", false));
  resourceForm.appendChild(buildFieldText("Languages", "Languages", resource.Languages || "", false));
  resourceForm.appendChild(buildFieldText("Keywords", "Keywords", resource.Keywords || "", false));

  const resourceName = getResourceTitle(resource) || "Resource";
  editorTitle.textContent = editingPendingRequest
    ? `Modify Pending Request: ${resourceName}`
    : editingResourceMode === "create"
      ? "Submit New Resource"
      : `Submit Update: ${resourceName}`;
  submitRequestBtn.textContent = editingPendingRequest ? "Update Pending Request" : editingResourceMode === "create" ? "Submit New Resource" : "Submit for Review";
  deleteResourceRequestBtn?.classList.toggle("hidden", editingResourceMode !== "edit" || Boolean(editingPendingRequest));
}

function collectProposedData() {
  const payload = {};
  const groups = Array.from(resourceForm.querySelectorAll(".field-group"));

  groups.forEach(group => {
    const field = group.dataset.field;
    const type = group.dataset.type;

    if (field === "__nested_categories__" && type === "nestedcats") {
      const selectedCats = [];
      const selectedSubs = [];
      Array.from(group.querySelectorAll(".cat-block")).forEach(block => {
        const catCb = block.querySelector(".cat-row input[type='checkbox']");
        if (catCb?.checked) {
          selectedCats.push(catCb.value);
          Array.from(block.querySelectorAll(".cat-sub-row input[type='checkbox']")).forEach(subCb => {
            if (subCb.checked) selectedSubs.push(subCb.value);
          });
        }
      });
      payload.Categories = selectedCats;
      payload.Subcategories = selectedSubs;
      return;
    }

    if (type === "richtext") {
      const quill = quillEditors.get(field);
      const { html, delta } = quill ? exportQuillContents(quill) : { html: "", delta: null };
      payload[field] = html;
      payload[`${field}Delta`] = delta;
      return;
    }

    if (type === "stringlist") {
      payload[field] = Array.from(group.querySelectorAll(".field-list-row input"))
        .map(input => normalizeString(input.value))
        .filter(Boolean);
      return;
    }

    if (type === "phoneentries") {
      payload[field] = Array.from(group.querySelectorAll(".field-phone-row"))
        .map(row => {
          const inputs = row.querySelectorAll("input");
          const label = normalizeString(inputs[0]?.value);
          const number = normalizeString(inputs[1]?.value);
          if (!number) return null;
          return label ? { label, number } : { number };
        })
        .filter(Boolean);
      return;
    }

    if (field === "IncludeInMap") {
      payload[field] = normalizeMapIncludeValue(group.querySelector("select")?.value, true);
      return;
    }

    const input = group.querySelector("input, textarea");
    payload[field] = input ? normalizeString(input.value) : "";
  });

  payload.Website = "";
  payload.Phone = "";
  return payload;
}

function openResourceEditor(resource) {
  editingPendingRequest = null;
  editingResource = resource;
  editingResourceMode = "edit";
  buildResourceForm(resource);
  show(resourceEditor);
}

function createNewResourceDraft() {
  return {
    resourceTitle: "",
    Description: "",
    DescriptionDelta: null,
    Categories: [],
    Subcategories: [],
    Websites: [],
    PhoneNumbers: [],
    Email: "",
    Address: "",
    City: "",
    Zip: "",
    Latitude: "",
    Longitude: "",
    IncludeInMap: true,
    Hours: "",
    Eligibility: "",
    Cost: "",
    Languages: "",
    Keywords: "",
    Notes: "",
    NotesDelta: null
  };
}

function openNewResourceEditor() {
  editingPendingRequest = null;
  editingResource = createNewResourceDraft();
  editingResourceMode = "create";
  buildResourceForm(editingResource);
  show(resourceEditor);
}

function closeResourceEditor() {
  hide(resourceEditor);
  editingPendingRequest = null;
  editingResource = null;
  editingResourceMode = "edit";
}

function getOwnedResourceById(resourceId) {
  const normalizedResourceId = normalizeString(resourceId);
  if (!normalizedResourceId) return null;
  return resourceMeta.find(resource => normalizeString(resource.id) === normalizedResourceId) || null;
}

function validateOrgRequestBeforeSubmit(requestType, relatedResourceId) {
  const normalizedRequestType = normalizeResourceRequestType(requestType);
  const organizationId = normalizeString(membershipDoc?.organizationId);
  const resourceId = normalizeString(relatedResourceId);

  if (!isOrgResourceRequestType(normalizedRequestType)) {
    throw new Error("Only resource create, edit, and delete requests can be submitted from the organization portal.");
  }

  if (!organizationId) {
    throw new Error("Your account is not connected to an active organization.");
  }

  if (normalizedRequestType === "resource_create") {
    if (resourceId) {
      throw new Error("New resource requests cannot point at an existing live resource.");
    }
    return;
  }

  if (!resourceId) {
    throw new Error("This request is missing the live resource it would change.");
  }

  const ownedResource = getOwnedResourceById(resourceId);
  if (!ownedResource) {
    throw new Error("This request cannot be submitted because the live resource is not owned by your organization.");
  }

  if (normalizeString(ownedResource.organizationId) !== organizationId) {
    throw new Error("This request cannot be submitted because the live resource belongs to another organization.");
  }
}

async function submitResourceRequest(requestType, proposedData, submitterNotes) {
  const actor = getCurrentActor();
  const normalizedRequestType = normalizeRequestType(requestType);
  const relatedResourceId = normalizedRequestType === "resource_edit" || normalizedRequestType === "resource_delete"
    ? normalizeString(editingResource?.id)
    : "";
  const resourceName = normalizedRequestType === "resource_delete"
    ? getResourceTitle(editingResource)
    : getResourceTitle(proposedData) || getResourceTitle(editingResource);

  validateOrgRequestBeforeSubmit(normalizedRequestType, relatedResourceId);

  let requestId = normalizeString(editingPendingRequest?.id);
  let summary = "";
  let action = "request.submitted";

  if (editingPendingRequest) {
    await updateDoc(doc(db, "resource_change_requests", requestId), {
      resourceId: relatedResourceId,
      resourceName,
      requestType: normalizedRequestType,
      proposedData,
      submitterNotes,
      updatedAt: serverTimestamp()
    });
    summary = `Updated pending request for ${resourceName || requestId}`;
    action = "request.updated";
  } else {
    const requestRef = await addDoc(collection(db, "resource_change_requests"), {
      resourceId: relatedResourceId,
      resourceName,
      organizationId: normalizeString(membershipDoc?.organizationId),
      submittedByUid: actor.uid,
      submittedByEmail: actor.email,
      requestType: normalizedRequestType,
      status: "pending",
      proposedData,
      submitterNotes,
      reviewNotes: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    requestId = requestRef.id;
    summary = normalizedRequestType === "resource_create"
      ? `Submitted new resource request for ${resourceName || requestId}`
      : normalizedRequestType === "resource_delete"
        ? `Submitted delete request for ${resourceName || requestId}`
        : `Submitted update request for ${resourceName || requestId}`;
  }

  await logOrgAuditEvent({
    action,
    entityType: "request",
    entityId: requestId,
    entityLabel: resourceName,
    organizationId: normalizeString(membershipDoc?.organizationId),
    relatedResourceId,
    relatedRequestId: requestId,
    summary,
    details: {
      requestType: normalizedRequestType,
      submitterNotes,
      changedFieldCount: Object.keys(proposedData || {}).length
    }
  });

  alert(
    editingPendingRequest
      ? "Pending request updated."
      : normalizedRequestType === "resource_create"
      ? "New resource submitted for library review."
      : normalizedRequestType === "resource_delete"
        ? "Delete request submitted for library review."
        : "Update submitted for library review."
  );

  closeResourceEditor();
  await loadRequests();
  await loadOwnedResources();
}

logoutBtn?.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.error("Logout error:", err);
  }
});

cancelResourceBtn?.addEventListener("click", () => {
  closeResourceEditor();
});

addResourceBtn?.addEventListener("click", () => {
  openNewResourceEditor();
});

editOrganizationBtn?.addEventListener("click", () => {
  openOrganizationEditor();
});

cancelOrganizationBtn?.addEventListener("click", () => {
  closeOrganizationEditor();
});

saveOrganizationBtn?.addEventListener("click", async () => {
  if (!organizationDoc?.id) return;

  const payload = collectOrganizationPayload();
  const actor = getCurrentActor();

  try {
    await updateDoc(doc(db, "organizations", organizationDoc.id), {
      primaryEmail: payload.primaryEmail,
      phone: payload.phone,
      website: payload.website,
      updatedAt: serverTimestamp(),
      updatedBy: actor.uid,
      updatedByEmail: actor.email
    });

    organizationDoc = {
      ...organizationDoc,
      primaryEmail: payload.primaryEmail,
      phone: payload.phone,
      website: payload.website
    };
    renderOrganizationSummary();
    closeOrganizationEditor();
    await logOrgAuditEvent({
      action: "organization.updated",
      entityType: "organization",
      entityId: organizationDoc.id,
      entityLabel: normalizeString(organizationDoc.name),
      organizationId: organizationDoc.id,
      summary: `Updated organization details for ${normalizeString(organizationDoc.name) || organizationDoc.id}`,
      details: {
        updatedFields: ["primaryEmail", "phone", "website"]
      }
    });
    alert("Organization details saved.");
  } catch (err) {
    console.error("Error saving organization details:", err);
    alert("Error saving organization details. See console for details.");
  }
});

submitRequestBtn?.addEventListener("click", async () => {
  if (!editingResource || !membershipDoc) return;

  const orgInput = resourceForm.querySelector('.field-group[data-field="resourceTitle"] input');
  if (orgInput && typeof orgInput.checkValidity === "function" && !orgInput.checkValidity()) {
    orgInput.reportValidity?.();
    return;
  }

  const proposedData = sanitizeRequestedResourceData(collectProposedData());
  const submitterNotes = normalizeString(submitterNotesInput.value);
  const requestType = editingResourceMode === "create" ? "resource_create" : "resource_edit";

  try {
    await submitResourceRequest(requestType, proposedData, submitterNotes);
  } catch (err) {
    console.error("Error submitting request:", err);
    alert(err instanceof Error ? err.message : "Error submitting request. See console for details.");
  }
});

deleteResourceRequestBtn?.addEventListener("click", async () => {
  if (!editingResource || editingResourceMode !== "edit") return;

  const resourceName = getResourceTitle(editingResource) || "this resource";
  const confirmed = window.confirm(
    `Are you sure you want to delete "${resourceName}"?\n\nThis action cannot be undone. The deletion will be submitted to library staff for review before it is applied.`
  );
  if (!confirmed) return;

  const submitterNotes = normalizeString(submitterNotesInput.value);
  const proposedData = sanitizeRequestedResourceData(editingResource);

  try {
    await submitResourceRequest("resource_delete", proposedData, submitterNotes);
  } catch (err) {
    console.error("Error submitting delete request:", err);
    alert(err instanceof Error ? err.message : "Error submitting delete request. See console for details.");
  }
});

onAuthStateChanged(auth, async user => {
  if (!user) {
    redirectToUnifiedLogin();
    membershipDoc = null;
    organizationDoc = null;
    return;
  }

  try {
    const profile = await getAccessProfile(user);
    if (profile.isAdmin) {
      redirectToPortalForProfile(profile);
      return;
    }

    if (!profile.hasActiveMembership) {
      await signOut(auth);
      redirectToUnifiedLogin();
      return;
    }

    membershipDoc = profile.membership;
    await loadOrganizationForMembership(membershipDoc);
    await markMatchingInvitesAccepted();
    await loadCategories();
    await loadRequests();
    await loadOwnedResources();

    hide(loginScreen);
    show(orgScreen);
    setBanner(`Signed in as ${normalizeString(user.email)} for ${normalizeString(organizationDoc?.name) || "your organization"}. Organization contact details save immediately. Resource changes still require library approval before they go live.`);
  } catch (err) {
    console.error("Portal load error:", err);
    await signOut(auth);
    redirectToUnifiedLogin();
  }
});
