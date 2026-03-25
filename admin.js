// ------------------------------------------------------
// admin.js - Admin dashboard (Firebase Auth + Firestore)
// ------------------------------------------------------

import { db, auth } from "./firebase.js";

import {
  collection,
  doc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  canonicalizeSubcategoryInput,
  formatNormalizationChange
} from "./taxonomy-rules.js";
import {
  normalizeWebsiteList,
  normalizePhoneEntries,
  getPhoneDisplayText,
  getPhoneHref,
  getWebsiteDisplayText
} from "./contact-fields.js";
import {
  getAccessProfile,
  redirectToPortalForProfile,
  redirectToUnifiedLogin
} from "./auth-routing.js";

// ------------------------------------------------------
// CONFIG
// ------------------------------------------------------
// ------------------------------------------------------
// DOM
// ------------------------------------------------------
const loginScreen = document.getElementById("login-screen");
const adminScreen = document.getElementById("admin-screen");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logoutBtn");

const navButtons = Array.from(document.querySelectorAll(".nav-btn"));
const panelResources = document.getElementById("panel-resources");
const panelCategories = document.getElementById("panel-categories");
const panelOrganizations = document.getElementById("panel-organizations");
const panelRequests = document.getElementById("panel-requests");

// Resources UI
const resourceList = document.getElementById("resource-list");
const resourceEditor = document.getElementById("resource-editor");
const editorTitle = document.getElementById("editor-title");
const resourceForm = document.getElementById("resource-form");

const addResourceBtn = document.getElementById("add-resource-btn");
const saveResourceBtn = document.getElementById("save-resource-btn");
const deleteResourceBtn = document.getElementById("delete-resource-btn");
const cancelResourceBtn = document.getElementById("cancel-resource-btn");

// Categories UI
const categoryList = document.getElementById("category-list");
const categoryEditor = document.getElementById("category-editor");
const categoryEditorTitle = document.getElementById("category-editor-title");
const categoryNameInput = document.getElementById("category-name-input");
const subcategoryList = document.getElementById("subcategory-list");

const addSubBtn = document.getElementById("add-sub-btn");
const addCategoryBtn = document.getElementById("add-category-btn");
const saveCategoryBtn = document.getElementById("save-category-btn");
const deleteCategoryBtn = document.getElementById("delete-category-btn");
const cancelCategoryBtn = document.getElementById("cancel-category-btn");

// Organizations UI
const organizationList = document.getElementById("organization-list");
const organizationEditor = document.getElementById("organization-editor");
const organizationEditorTitle = document.getElementById("organization-editor-title");
const organizationNameInput = document.getElementById("organization-name-input");
const organizationStatusInput = document.getElementById("organization-status-input");
const organizationPrimaryEmailInput = document.getElementById("organization-primary-email-input");
const organizationPhoneInput = document.getElementById("organization-phone-input");
const organizationWebsiteInput = document.getElementById("organization-website-input");
const organizationNotesInput = document.getElementById("organization-notes-input");
const addOrganizationBtn = document.getElementById("add-organization-btn");
const saveOrganizationBtn = document.getElementById("save-organization-btn");
const deleteOrganizationBtn = document.getElementById("delete-organization-btn");
const cancelOrganizationBtn = document.getElementById("cancel-organization-btn");

// Memberships UI
const membershipList = document.getElementById("membership-list");
const membershipEditor = document.getElementById("membership-editor");
const membershipEditorTitle = document.getElementById("membership-editor-title");
const membershipSectionHelper = document.getElementById("membership-section-helper");
const membershipUidInput = document.getElementById("membership-uid-input");
const membershipEmailInput = document.getElementById("membership-email-input");
const membershipRoleSelect = document.getElementById("membership-role-select");
const membershipStatusSelect = document.getElementById("membership-status-select");
const membershipNotesInput = document.getElementById("membership-notes-input");
const addMembershipBtn = document.getElementById("add-membership-btn");
const saveMembershipBtn = document.getElementById("save-membership-btn");
const deleteMembershipBtn = document.getElementById("delete-membership-btn");
const cancelMembershipBtn = document.getElementById("cancel-membership-btn");

// Requests UI
const requestList = document.getElementById("request-list");
const requestEditor = document.getElementById("request-editor");
const requestEditorTitle = document.getElementById("request-editor-title");
const requestSummary = document.getElementById("request-summary");
const requestEditForm = document.getElementById("request-edit-form");
const requestReviewNotes = document.getElementById("request-review-notes");
const requestFilterPendingBtn = document.getElementById("request-filter-pending");
const requestFilterApprovedBtn = document.getElementById("request-filter-approved");
const requestFilterRejectedBtn = document.getElementById("request-filter-rejected");
const requestSelectionCount = document.getElementById("request-selection-count");
const bulkApproveRequestsBtn = document.getElementById("bulk-approve-requests-btn");
const bulkRejectRequestsBtn = document.getElementById("bulk-reject-requests-btn");
const bulkDeleteRequestsBtn = document.getElementById("bulk-delete-requests-btn");
const approveRequestBtn = document.getElementById("approve-request-btn");
const rejectRequestBtn = document.getElementById("reject-request-btn");
const editRequestBtn = document.getElementById("edit-request-btn");
const deleteRequestBtn = document.getElementById("delete-request-btn");
const closeRequestBtn = document.getElementById("close-request-btn");

// ------------------------------------------------------
// STATE
// ------------------------------------------------------
let editingResourceId = null;
let editingCategoryId = null;
let editingOrganizationId = null;
let editingMembershipId = null;
let editingRequestId = null;
let editingResourceData = null;
let categoryMeta = [];
let organizationMeta = [];
let resourceMeta = [];
let membershipMeta = [];
let requestMeta = [];
let navInitialized = false;
let activeRequestFilter = "pending";
let selectedRequestIds = new Set();
let requestEditMode = false;

const quillEditors = new Map();
const quillToolbarOptions = [
  ["bold", "italic", "underline"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["link", "clean"]
];
const quillFormats = ["bold", "italic", "underline", "list", "link"];
const richTextAllowedTags = ["a", "br", "em", "li", "ol", "p", "strong", "u", "ul"];
const richTextAllowedAttrs = ["href"];
const orgEditableResourceFields = [
  "Organization",
  "Description",
  "DescriptionDelta",
  "Categories",
  "Subcategories",
  "Keywords",
  "Websites",
  "PhoneNumbers",
  "Email",
  "Address",
  "City",
  "Zip",
  "Hours",
  "Eligibility",
  "Cost",
  "Languages",
  "Last Verified",
  "Notes",
  "NotesDelta"
];
const requestReviewFieldConfig = [
  { field: "Organization", label: "Organization" },
  { field: "Description", label: "Description", type: "richtext" },
  { field: "Categories", label: "Categories", type: "string-array" },
  { field: "Subcategories", label: "Subcategories", type: "string-array" },
  { field: "Keywords", label: "Keywords" },
  { field: "Websites", label: "Websites", type: "website-array" },
  { field: "PhoneNumbers", label: "Phone Numbers", type: "phone-array" },
  { field: "Email", label: "Email", type: "email" },
  { field: "Address", label: "Address" },
  { field: "City", label: "City" },
  { field: "Zip", label: "Zip" },
  { field: "Hours", label: "Hours" },
  { field: "Eligibility", label: "Eligibility" },
  { field: "Cost", label: "Cost" },
  { field: "Languages", label: "Languages" },
  { field: "Last Verified", label: "Last Verified" },
  { field: "Notes", label: "Notes", type: "richtext" }
];

// ------------------------------------------------------
// Helpers
// ------------------------------------------------------
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

function normalizeString(v) {
  return String(v ?? "").trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => normalizeString(item)).filter(Boolean);
}

function getCurrentActorMetadata() {
  return {
    uid: auth.currentUser?.uid || "",
    email: normalizeString(auth.currentUser?.email)
  };
}

function getOrganizationDisplayName(org) {
  return normalizeString(org?.name) || "(Unnamed organization)";
}

function getOrganizationSummary(org) {
  const status = normalizeString(org?.status) || "active";
  const pieces = [status];
  const email = normalizeString(org?.primaryEmail);
  if (email) pieces.push(email);
  return pieces.join(" | ");
}

function getOrganizationNameById(organizationId) {
  const targetId = normalizeString(organizationId);
  if (!targetId) return "";

  const match = organizationMeta.find(org => org.id === targetId);
  return match ? getOrganizationDisplayName(match) : "";
}

function getMembershipSummary(membership) {
  const orgName = getOrganizationNameById(membership.organizationId) || "(No organization)";
  const role = normalizeString(membership.role) || "org_editor";
  const status = normalizeString(membership.status) || "active";
  return `${orgName} | ${role} | ${status}`;
}

function getRequestSummaryText(requestDoc) {
  const orgName = getOrganizationNameById(requestDoc.organizationId) || "(Unknown organization)";
  const resourceName = normalizeString(requestDoc.resourceName) || "(Unnamed resource)";
  const status = getRequestStatusLabel(requestDoc.status);
  return `${resourceName} | ${orgName} | ${status}`;
}

function normalizeRequestStatus(value) {
  const status = normalizeString(value).toLowerCase();
  if (status === "approved" || status === "rejected") return status;
  return "pending";
}

function getRequestStatusLabel(value) {
  const status = normalizeRequestStatus(value);
  if (status === "approved") return "accepted";
  if (status === "rejected") return "rejected";
  return "pending";
}

function getFilteredRequests() {
  return requestMeta.filter(requestDoc => normalizeRequestStatus(requestDoc.status) === activeRequestFilter);
}

function updateRequestSelectionUi() {
  if (!requestSelectionCount) return;

  const count = selectedRequestIds.size;
  requestSelectionCount.textContent = `${count} selected`;

  const disabled = count === 0;
  if (bulkApproveRequestsBtn) bulkApproveRequestsBtn.disabled = disabled;
  if (bulkRejectRequestsBtn) bulkRejectRequestsBtn.disabled = disabled;
  if (bulkDeleteRequestsBtn) bulkDeleteRequestsBtn.disabled = disabled;
}

function updateRequestFilterUi() {
  const tabConfig = [
    { btn: requestFilterPendingBtn, status: "pending", label: "Pending" },
    { btn: requestFilterApprovedBtn, status: "approved", label: "Accepted" },
    { btn: requestFilterRejectedBtn, status: "rejected", label: "Rejected" }
  ];

  tabConfig.forEach(({ btn, status, label }) => {
    if (!btn) return;
    const count = requestMeta.filter(requestDoc => normalizeRequestStatus(requestDoc.status) === status).length;
    btn.textContent = `${label} (${count})`;
    btn.classList.toggle("active", activeRequestFilter === status);
  });
}

function setActiveRequestFilter(nextFilter) {
  activeRequestFilter = normalizeRequestStatus(nextFilter);
  selectedRequestIds = new Set(
    Array.from(selectedRequestIds).filter(id =>
      normalizeRequestStatus(requestMeta.find(item => item.id === id)?.status) === activeRequestFilter
    )
  );
  const openRequest = requestMeta.find(item => item.id === editingRequestId);
  if (openRequest && normalizeRequestStatus(openRequest.status) !== activeRequestFilter) {
    hide(requestEditor);
    editingRequestId = null;
  }
  updateRequestFilterUi();
  updateRequestSelectionUi();
  renderRequestList(getFilteredRequests());
}

function getMembershipsForOrganization(organizationId) {
  const targetId = normalizeString(organizationId);
  if (!targetId) return [];
  return membershipMeta.filter(item => normalizeString(item.organizationId) === targetId);
}

function refreshOrganizationMembershipSection() {
  if (!membershipList || !membershipSectionHelper || !addMembershipBtn) return;

  if (!editingOrganizationId) {
    hide(membershipEditor);
    editingMembershipId = null;
    addMembershipBtn.disabled = true;
    membershipSectionHelper.textContent = "Save this organization first, then add authorized editors.";
    membershipList.textContent = "";
    return;
  }

  addMembershipBtn.disabled = false;
  membershipSectionHelper.textContent = "Users in this list can sign in and submit updates for this organization.";
  renderMembershipList(getMembershipsForOrganization(editingOrganizationId));
}

function formatJsonBlock(value) {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function sanitizeRequestedResourceData(value) {
  const source = value && typeof value === "object" ? value : {};
  const payload = {};

  orgEditableResourceFields.forEach(field => {
    const rawValue = source[field];

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

function createEl(tag, opts = {}) {
  const el = document.createElement(tag);
  if (opts.className) el.className = opts.className;
  if (opts.text != null) el.textContent = opts.text;
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) el.setAttribute(k, v);
  }
  return el;
}

function appendSafeHtml(el, html) {
  el.innerHTML = sanitizeRichTextHtml(html);
}

function normalizeRequestComparableValue(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }

  return normalizeString(value);
}

function getRequestChangeKind(currentValue, proposedValue) {
  const currentComparable = normalizeRequestComparableValue(currentValue);
  const proposedComparable = normalizeRequestComparableValue(proposedValue);

  if (!currentComparable && proposedComparable) return "added";
  if (currentComparable && !proposedComparable) return "removed";
  return "changed";
}

function buildRequestMetaBlock(requestDoc) {
  const block = createEl("div", { className: "request-block" });
  block.appendChild(createEl("h4", { text: "Request Summary" }));

  const metaList = createEl("div", { className: "request-meta-list" });
  const rows = [
    ["Resource", normalizeString(requestDoc.resourceName) || "(Unnamed resource)"],
    ["Organization", getOrganizationNameById(requestDoc.organizationId) || requestDoc.organizationId || "(Unknown organization)"],
    ["Status", getRequestStatusLabel(requestDoc.status)],
    ["Submitted by", normalizeString(requestDoc.submittedByEmail) || normalizeString(requestDoc.submittedByUid) || "(Unknown user)"],
    ["Submitted at", formatTimestampValue(requestDoc.createdAt)],
    ["Submitter notes", normalizeString(requestDoc.submitterNotes) || "(None)"]
  ];

  rows.forEach(([label, value]) => {
    const row = createEl("div", { className: "request-meta-row" });
    row.appendChild(createEl("strong", { text: label }));
    row.appendChild(createEl("span", { text: value }));
    metaList.appendChild(row);
  });

  block.appendChild(metaList);
  return block;
}

function buildEmptyRequestValue() {
  return createEl("div", {
    className: "request-value empty",
    text: "(blank)"
  });
}

function buildRequestStringList(items) {
  if (!items.length) {
    return buildEmptyRequestValue();
  }

  const wrapper = createEl("div", { className: "request-value" });
  const list = createEl("ul");
  items.forEach(item => {
    list.appendChild(createEl("li", { text: item }));
  });
  wrapper.appendChild(list);
  return wrapper;
}

function buildRequestWebsiteList(items) {
  if (!items.length) {
    return buildEmptyRequestValue();
  }

  const wrapper = createEl("div", { className: "request-value" });
  const list = createEl("ul");
  items.forEach(item => {
    const li = createEl("li");
    const href = normalizeString(item);
    const label = getWebsiteDisplayText(href) || href;

    if (/^(https?:|mailto:)/i.test(href)) {
      const anchor = createEl("a", {
        text: label,
        attrs: { href, target: "_blank", rel: "noopener noreferrer" }
      });
      li.appendChild(anchor);
    } else {
      li.textContent = label;
    }

    list.appendChild(li);
  });
  wrapper.appendChild(list);
  return wrapper;
}

function buildRequestPhoneList(items) {
  if (!items.length) {
    return buildEmptyRequestValue();
  }

  const wrapper = createEl("div", { className: "request-value" });
  const list = createEl("ul");
  items.forEach(item => {
    const li = createEl("li");
    const display = getPhoneDisplayText(item);
    const href = getPhoneHref(item);

    if (href) {
      li.appendChild(createEl("a", { text: display, attrs: { href } }));
    } else {
      li.textContent = display || "(blank)";
    }

    list.appendChild(li);
  });
  wrapper.appendChild(list);
  return wrapper;
}

function buildRequestValue(fieldConfig, value) {
  const fieldType = fieldConfig?.type || "text";

  if (fieldType === "richtext") {
    const html = sanitizeRichTextHtml(value);
    if (!html) return buildEmptyRequestValue();

    const wrapper = createEl("div", { className: "request-value" });
    appendSafeHtml(wrapper, html);
    return wrapper;
  }

  if (fieldType === "string-array") {
    return buildRequestStringList(normalizeStringArray(value));
  }

  if (fieldType === "website-array") {
    return buildRequestWebsiteList(normalizeWebsiteList(value));
  }

  if (fieldType === "phone-array") {
    return buildRequestPhoneList(normalizePhoneEntries(value));
  }

  const normalized = normalizeString(value);
  if (!normalized) return buildEmptyRequestValue();

  const wrapper = createEl("div", { className: "request-value" });
  if (fieldType === "email") {
    wrapper.appendChild(createEl("a", {
      text: normalized,
      attrs: { href: `mailto:${normalized}` }
    }));
    return wrapper;
  }

  wrapper.textContent = normalized;
  return wrapper;
}

function buildRequestDiffCard(fieldConfig, currentValue, proposedValue) {
  const changeKind = getRequestChangeKind(currentValue, proposedValue);
  const card = createEl("div", { className: `request-diff-card ${changeKind}` });
  card.appendChild(createEl("h5", { text: fieldConfig.label }));

  const badge = createEl("span", {
    className: `request-change-badge ${changeKind}`,
    text: changeKind === "added" ? "Added" : changeKind === "removed" ? "Removed" : "Changed"
  });
  card.appendChild(badge);

  const columns = createEl("div", { className: "request-diff-columns" });

  const beforeColumn = createEl("div", { className: "request-diff-column before" });
  beforeColumn.appendChild(createEl("h6", { text: "Current" }));
  beforeColumn.appendChild(buildRequestValue(fieldConfig, currentValue));

  const afterColumn = createEl("div", { className: "request-diff-column after" });
  afterColumn.appendChild(createEl("h6", { text: "Requested" }));
  afterColumn.appendChild(buildRequestValue(fieldConfig, proposedValue));

  columns.appendChild(beforeColumn);
  columns.appendChild(afterColumn);
  card.appendChild(columns);
  return card;
}

function valuesMatchForReview(fieldConfig, currentValue, proposedValue) {
  const currentComparable = normalizeRequestComparableValue(
    fieldConfig?.type === "string-array" ? normalizeStringArray(currentValue)
      : fieldConfig?.type === "website-array" ? normalizeWebsiteList(currentValue)
      : fieldConfig?.type === "phone-array" ? normalizePhoneEntries(currentValue)
      : fieldConfig?.type === "richtext" ? sanitizeRichTextHtml(currentValue)
      : normalizeString(currentValue)
  );
  const proposedComparable = normalizeRequestComparableValue(
    fieldConfig?.type === "string-array" ? normalizeStringArray(proposedValue)
      : fieldConfig?.type === "website-array" ? normalizeWebsiteList(proposedValue)
      : fieldConfig?.type === "phone-array" ? normalizePhoneEntries(proposedValue)
      : fieldConfig?.type === "richtext" ? sanitizeRichTextHtml(proposedValue)
      : normalizeString(proposedValue)
  );

  return currentComparable === proposedComparable;
}

function buildRequestDiffList(currentResource, proposedData) {
  const wrapper = createEl("div", { className: "request-block" });
  wrapper.appendChild(createEl("h4", { text: "Requested Changes" }));

  const list = createEl("div", { className: "request-diff-list" });
  const currentEditable = sanitizeRequestedResourceData(currentResource || {});
  const proposedEditable = sanitizeRequestedResourceData(proposedData || {});

  let changedCount = 0;
  requestReviewFieldConfig.forEach(fieldConfig => {
    const currentValue = currentEditable[fieldConfig.field];
    const proposedValue = proposedEditable[fieldConfig.field];
    if (valuesMatchForReview(fieldConfig, currentValue, proposedValue)) return;

    changedCount += 1;
    list.appendChild(buildRequestDiffCard(fieldConfig, currentValue, proposedValue));
  });

  if (!changedCount) {
    const emptyState = createEl("div", { className: "request-diff-card" });
    emptyState.appendChild(createEl("h5", { text: "No changed fields detected" }));
    emptyState.appendChild(createEl("div", {
      className: "request-value empty",
      text: "The submitted request matches the current live values for all reviewable fields."
    }));
    list.appendChild(emptyState);
  }

  wrapper.appendChild(list);
  return wrapper;
}

function buildRequestEditFieldset(data) {
  quillEditors.clear();
  clearChildren(requestEditForm);

  requestEditForm.appendChild(createEl("h4", { text: "Edit Proposed Changes" }));
  requestEditForm.appendChild(buildFieldText("Organization", "Organization", data.Organization || "", true));
  requestEditForm.appendChild(buildFieldRichText(
    "Description",
    "Description",
    data.Description || "",
    data.DescriptionDelta || null
  ));
  requestEditForm.appendChild(buildNestedCategorySelector(data.Categories, data.Subcategories));
  requestEditForm.appendChild(buildFieldText("Keywords", "Keywords", data.Keywords || "", false));
  requestEditForm.appendChild(buildFieldStringList(
    "Websites",
    "Websites",
    normalizeWebsiteList(Array.isArray(data.Websites) ? data.Websites : data.Website),
    "https://example.org"
  ));
  requestEditForm.appendChild(buildFieldPhoneList(
    "PhoneNumbers",
    "Phone Numbers",
    normalizePhoneEntries(Array.isArray(data.PhoneNumbers) ? data.PhoneNumbers : data.Phone)
  ));
  requestEditForm.appendChild(buildFieldText("Email", "Email", data.Email || "", false));
  requestEditForm.appendChild(buildFieldText("Address", "Address", data.Address || "", false));
  requestEditForm.appendChild(buildFieldText("City", "City", data.City || "", false));
  requestEditForm.appendChild(buildFieldText("Zip", "Zip", data.Zip || "", false));
  requestEditForm.appendChild(buildFieldText("Hours", "Hours", data.Hours || "", false));
  requestEditForm.appendChild(buildFieldText("Eligibility", "Eligibility", data.Eligibility || "", false));
  requestEditForm.appendChild(buildFieldText("Cost", "Cost", data.Cost || "", false));
  requestEditForm.appendChild(buildFieldText("Languages", "Languages", data.Languages || "", false));
  requestEditForm.appendChild(buildFieldDate("Last Verified", "Last Verified", data["Last Verified"] || ""));
  requestEditForm.appendChild(buildFieldRichText(
    "Notes",
    "Notes",
    data.Notes || "",
    data.NotesDelta || null
  ));
}

function collectRequestEditPayload() {
  const payload = {};
  const groups = Array.from(requestEditForm.querySelectorAll(".field-group"));

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

    const input = group.querySelector("input, textarea, select");
    payload[field] = input ? normalizeString(input.value) : "";
  });

  payload.Website = "";
  payload.Phone = "";
  return sanitizeRequestedResourceData(payload);
}

function setRequestEditMode(enabled, requestDoc = null) {
  requestEditMode = Boolean(enabled);
  editRequestBtn.textContent = requestEditMode ? "Cancel Edit" : "Edit";

  if (!requestEditMode || !requestDoc) {
    hide(requestEditForm);
    clearChildren(requestEditForm);
    return;
  }

  const proposed = sanitizeRequestedResourceData(requestDoc.proposedData || {});
  buildRequestEditFieldset(proposed);
  show(requestEditForm);
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

function toDateInputValue(v) {
  const s = normalizeString(v);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return "";
}

function formatTimestampValue(value) {
  if (!value) return "";

  if (typeof value?.toDate === "function") {
    return value.toDate().toLocaleString();
  }

  if (value instanceof Date) {
    return value.toLocaleString();
  }

  const stringValue = normalizeString(value);
  if (!stringValue) return "";

  const parsed = new Date(stringValue);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString();
  }

  return stringValue;
}

// ------------------------------------------------------
// AUTH
// ------------------------------------------------------
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

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    redirectToUnifiedLogin();
    return;
  }

  const profile = await getAccessProfile(user);
  if (!profile.isAdmin) {
    if (redirectToPortalForProfile(profile)) {
      return;
    }

    await signOut(auth);
    redirectToUnifiedLogin();
    return;
  }

  hide(loginScreen);
  show(adminScreen);

  initNav();

  await loadOrganizations();
  await loadCategories();
  await loadResources();
  await loadMemberships();
  await loadReviewRequests();
});

// ------------------------------------------------------
// NAV
// ------------------------------------------------------
function initNav() {
  if (navInitialized) {
    setActivePanel("resources");
    return;
  }

  navButtons.forEach(btn => {
    btn.addEventListener("click", () => setActivePanel(btn.dataset.panel));
  });

  navInitialized = true;
  setActivePanel("resources");
}

function setActivePanel(panelName) {
  navButtons.forEach(b => b.classList.remove("active"));
  const active = navButtons.find(b => b.dataset.panel === panelName);
  active?.classList.add("active");

  hide(panelResources);
  hide(panelCategories);
  hide(panelOrganizations);
  hide(panelRequests);

  if (panelName === "categories") {
    show(panelCategories);
    return;
  }

  if (panelName === "organizations") {
    show(panelOrganizations);
    return;
  }

  if (panelName === "requests") {
    show(panelRequests);
    return;
  }

  show(panelResources);
}

// ------------------------------------------------------
// RESOURCES
// ------------------------------------------------------
function getResourceDisplayName(resource) {
  return normalizeString(resource?.Organization) || "(Unnamed)";
}

async function loadResources() {
  hide(resourceEditor);
  editingResourceId = null;
  editingResourceData = null;

  resourceList.textContent = "Loading...";

  try {
    const snap = await getDocs(collection(db, "resources"));
    const resources = [];
    snap.forEach(ds => resources.push({ id: ds.id, ...ds.data() }));

    resources.sort((a, b) => {
      const an = getResourceDisplayName(a).toLowerCase();
      const bn = getResourceDisplayName(b).toLowerCase();
      return an.localeCompare(bn);
    });

    resourceMeta = resources;
    renderResourceList(resources);
  } catch (err) {
    console.error("Error loading resources:", err);
    resourceList.textContent = "Error loading resources.";
  }
}

function renderResourceList(resources) {
  clearChildren(resourceList);

  if (!resources.length) {
    resourceList.textContent = "No resources found.";
    return;
  }

  resources.forEach(r => {
    const row = createEl("div", { className: "list-row list-row-stacked" });
    row.appendChild(createEl("div", { className: "list-row-title", text: getResourceDisplayName(r) }));

    const orgName = getOrganizationNameById(r.organizationId);
    const statusParts = [];
    if (orgName) {
      statusParts.push(orgName);
    } else {
      statusParts.push("Unassigned owner");
    }

    statusParts.push(normalizeString(r.status) || "published");

    const submissionState = normalizeString(r.submissionState);
    if (submissionState) {
      statusParts.push(submissionState);
    }

    row.appendChild(createEl("div", {
      className: "list-row-meta",
      text: statusParts.join(" | ")
    }));
    row.addEventListener("click", () => openResourceEditor(r.id, r));
    resourceList.appendChild(row);
  });
}

function openResourceEditor(docId, data) {
  editingResourceId = docId;
  editingResourceData = data ? { ...data } : {};
  editorTitle.textContent = "Edit Resource";
  buildResourceForm(data || {});
  show(resourceEditor);
}

addResourceBtn?.addEventListener("click", () => {
  editingResourceId = null;
  editingResourceData = {};
  editorTitle.textContent = "Add New Resource";
  buildResourceForm({});
  show(resourceEditor);
});

cancelResourceBtn?.addEventListener("click", () => {
  hide(resourceEditor);
  editingResourceData = null;
});

// ------------------------------------------------------
// Resource Form Fields
// ------------------------------------------------------
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

function buildFieldDate(fieldKey, label, value = "") {
  const wrap = createEl("div", {
    className: "field-group",
    attrs: { "data-field": fieldKey, "data-type": "date" }
  });
  const lbl = createEl("label", { className: "field-label", text: label });
  const input = createEl("input", { attrs: { type: "date" } });

  input.value = toDateInputValue(value);

  wrap.appendChild(lbl);
  wrap.appendChild(input);
  return wrap;
}

function buildFieldSelect(fieldKey, label, value = "", options = [], placeholder = "Select an option") {
  const wrap = createEl("div", {
    className: "field-group",
    attrs: { "data-field": fieldKey, "data-type": "select" }
  });
  const lbl = createEl("label", { className: "field-label", text: label });
  const select = createEl("select");

  const placeholderOption = createEl("option", {
    text: placeholder,
    attrs: { value: "" }
  });
  select.appendChild(placeholderOption);

  options.forEach(option => {
    const opt = createEl("option", {
      text: option.label,
      attrs: { value: option.value }
    });
    if (normalizeString(value) === option.value) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });

  if (!normalizeString(value)) {
    select.value = "";
  }

  wrap.appendChild(lbl);
  wrap.appendChild(select);
  return wrap;
}

function buildReadOnlyMetaField(label, value) {
  const wrap = createEl("div", { className: "field-group field-meta-group" });
  const lbl = createEl("div", { className: "field-label", text: label });
  const body = createEl("div", { className: "field-meta-value", text: normalizeString(value) || "-" });
  wrap.appendChild(lbl);
  wrap.appendChild(body);
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

  const lbl = createEl("div", { className: "field-label", text: "Categories & Subcategories" });
  wrapper.appendChild(lbl);

  const container = createEl("div", { className: "cat-nested" });

  const selectedCatSet = new Set(normalizeStringArray(selectedCategories).map(x => x.toLowerCase()));
  const selectedSubSet = new Set(normalizeStringArray(selectedSubcategories).map(x => x.toLowerCase()));

  const cats = [...categoryMeta].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  cats.forEach(cat => {
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

    let expanded = false;

    function syncSubsUI() {
      const forceVisible = catCb.checked;
      const shouldShow = forceVisible || expanded;

      subsWrap.style.display = shouldShow ? "block" : "none";

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

    catCb.addEventListener("change", () => {
      syncSubsUI();
    });

    block.appendChild(subsWrap);
    container.appendChild(block);
    syncSubsUI();
  });

  wrapper.appendChild(container);
  return wrapper;
}

// ------------------------------------------------------
// Build resource editor form
// ------------------------------------------------------
function buildResourceForm(data) {
  quillEditors.clear();
  clearChildren(resourceForm);

  const organizationOptions = organizationMeta
    .map(org => ({
      value: org.id,
      label: getOrganizationDisplayName(org)
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  resourceForm.appendChild(buildFieldText("Organization", "Organization", data.Organization || "", true));
  resourceForm.appendChild(buildFieldSelect(
    "organizationId",
    "Owning Organization",
    data.organizationId || "",
    organizationOptions,
    organizationOptions.length ? "Select organization owner" : "No organizations available"
  ));
  resourceForm.appendChild(buildFieldSelect(
    "status",
    "Publication Status",
    data.status || "published",
    [
      { value: "published", label: "Published" },
      { value: "draft", label: "Draft" },
      { value: "archived", label: "Archived" }
    ],
    "Select status"
  ));
  resourceForm.appendChild(buildFieldSelect(
    "submissionState",
    "Submission State",
    data.submissionState || "approved",
    [
      { value: "approved", label: "Approved" },
      { value: "pending", label: "Pending Review" },
      { value: "rejected", label: "Rejected" },
      { value: "cancelled", label: "Cancelled" }
    ],
    "Select submission state"
  ));
  resourceForm.appendChild(buildFieldRichText(
    "Description",
    "Description",
    data.Description || "",
    data.DescriptionDelta || null
  ));

  resourceForm.appendChild(buildNestedCategorySelector(data.Categories, data.Subcategories));

  resourceForm.appendChild(buildFieldText("Keywords", "Keywords", data.Keywords || "", false));
  resourceForm.appendChild(buildFieldStringList(
    "Websites",
    "Websites",
    normalizeWebsiteList(Array.isArray(data.Websites) ? data.Websites : data.Website),
    "https://example.org"
  ));
  resourceForm.appendChild(buildFieldPhoneList(
    "PhoneNumbers",
    "Phone Numbers",
    normalizePhoneEntries(Array.isArray(data.PhoneNumbers) ? data.PhoneNumbers : data.Phone)
  ));
  resourceForm.appendChild(buildFieldText("Email", "Email", data.Email || "", false));
  resourceForm.appendChild(buildFieldText("Address", "Address", data.Address || "", false));
  resourceForm.appendChild(buildFieldText("City", "City", data.City || "", false));
  resourceForm.appendChild(buildFieldText("Zip", "Zip", data.Zip || "", false));
  resourceForm.appendChild(buildFieldText("Hours", "Hours", data.Hours || "", false));
  resourceForm.appendChild(buildFieldText("Eligibility", "Eligibility", data.Eligibility || "", false));
  resourceForm.appendChild(buildFieldText("Cost", "Cost", data.Cost || "", false));
  resourceForm.appendChild(buildFieldText("Languages", "Languages", data.Languages || "", false));
  resourceForm.appendChild(buildFieldDate("Last Verified", "Last Verified", data["Last Verified"] || ""));
  resourceForm.appendChild(buildFieldText("UpdatedBy", "Updated By", data.UpdatedBy || "", false));

  resourceForm.appendChild(buildFieldRichText(
    "Notes",
    "Notes",
    data.Notes || "",
    data.NotesDelta || null
  ));

  if (editingResourceId) {
    resourceForm.appendChild(buildReadOnlyMetaField("Created", formatTimestampValue(data.createdAt)));
    resourceForm.appendChild(buildReadOnlyMetaField("Last Submitted", formatTimestampValue(data.lastSubmittedAt)));
    resourceForm.appendChild(buildReadOnlyMetaField("Last Approved", formatTimestampValue(data.lastApprovedAt)));
  }
}

function collectResourcePayload() {
  const payload = {};
  const groups = Array.from(resourceForm.querySelectorAll(".field-group"));

  for (const g of groups) {
    const field = g.dataset.field;
    const type = g.dataset.type;

    if (field === "__nested_categories__" && type === "nestedcats") {
      const selectedCats = [];
      const selectedSubs = [];

      const blocks = Array.from(g.querySelectorAll(".cat-block"));
      blocks.forEach(block => {
        const catCb = block.querySelector(".cat-row input[type='checkbox']");
        if (catCb?.checked) {
          selectedCats.push(catCb.value);

          const subCbs = Array.from(block.querySelectorAll(".cat-sub-row input[type='checkbox']"));
          subCbs.forEach(scb => {
            if (scb.checked) selectedSubs.push(scb.value);
          });
        }
      });

      payload.Categories = selectedCats;
      payload.Subcategories = selectedSubs;
      continue;
    }

    if (type === "richtext") {
      const quill = quillEditors.get(field);
      const { html, delta } = quill ? exportQuillContents(quill) : { html: "", delta: null };
      payload[field] = html;
      payload[`${field}Delta`] = delta;
      continue;
    }

    if (type === "stringlist") {
      const values = Array.from(g.querySelectorAll(".field-list-row input"))
        .map(input => normalizeString(input.value))
        .filter(Boolean);

      payload[field] = values;
      continue;
    }

    if (type === "phoneentries") {
      const values = Array.from(g.querySelectorAll(".field-phone-row"))
        .map(row => {
          const inputs = row.querySelectorAll("input");
          const label = normalizeString(inputs[0]?.value);
          const number = normalizeString(inputs[1]?.value);
          if (!number) return null;
          return label ? { label, number } : { number };
        })
        .filter(Boolean);

      payload[field] = values;
      continue;
    }

    const input = g.querySelector("input, textarea, select");
    payload[field] = input ? normalizeString(input.value) : "";
  }

  payload.Website = "";
  payload.Phone = "";

  return payload;
}

saveResourceBtn?.addEventListener("click", async () => {
  const orgInput = resourceForm.querySelector('.field-group[data-field="Organization"] input');
  if (orgInput && typeof orgInput.checkValidity === "function" && !orgInput.checkValidity()) {
    orgInput.reportValidity?.();
    return;
  }

  const payload = collectResourcePayload();
  const actor = getCurrentActorMetadata();
  const isNew = !editingResourceId;

  payload.status = normalizeString(payload.status) || "published";
  payload.submissionState = normalizeString(payload.submissionState) || "approved";
  payload.updatedAt = serverTimestamp();
  payload.updatedByUid = actor.uid;
  payload.updatedByEmail = actor.email;

  if (payload.organizationId && !getOrganizationNameById(payload.organizationId)) {
    alert("Selected owning organization no longer exists. Reload the page and try again.");
    return;
  }

  if (isNew) {
    payload.createdAt = serverTimestamp();
    payload.createdByUid = actor.uid;
    payload.createdByEmail = actor.email;
    payload.lastSubmittedAt = serverTimestamp();
    payload.lastSubmittedBy = actor.uid;
  }

  if (!editingResourceData?.lastSubmittedAt) {
    payload.lastSubmittedAt = payload.lastSubmittedAt || serverTimestamp();
    payload.lastSubmittedBy = actor.uid;
  }

  if (payload.status === "published" && payload.submissionState === "approved" && !editingResourceData?.lastApprovedAt) {
    payload.lastApprovedAt = serverTimestamp();
    payload.lastApprovedBy = actor.uid;
  }

  try {
    if (editingResourceId) {
      await updateDoc(doc(db, "resources", editingResourceId), payload);
    } else {
      await addDoc(collection(db, "resources"), payload);
    }
    hide(resourceEditor);
    await loadResources();
  } catch (err) {
    console.error("Error saving resource:", err);
    alert("Error saving resource. See console for details.");
  }
});

deleteResourceBtn?.addEventListener("click", async () => {
  if (!editingResourceId) return;
  if (!confirm("Delete this resource?")) return;

  try {
    await deleteDoc(doc(db, "resources", editingResourceId));
    hide(resourceEditor);
    await loadResources();
  } catch (err) {
    console.error("Error deleting resource:", err);
    alert("Error deleting resource. See console for details.");
  }
});

// ------------------------------------------------------
// ORGANIZATIONS (CRUD)
// ------------------------------------------------------
async function loadOrganizations() {
  if (!organizationList) return;

  hide(organizationEditor);
  editingOrganizationId = null;
  organizationList.textContent = "Loading...";
  organizationMeta = [];

  try {
    const snap = await getDocs(collection(db, "organizations"));
    const organizations = [];

    snap.forEach(ds => {
      const data = ds.data() || {};
      organizations.push({
        id: ds.id,
        name: normalizeString(data.name),
        status: normalizeString(data.status) || "active",
        primaryEmail: normalizeString(data.primaryEmail),
        phone: normalizeString(data.phone),
        website: normalizeString(data.website),
        notes: normalizeString(data.notes),
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null
      });
    });

    organizations.sort((a, b) => getOrganizationDisplayName(a).localeCompare(getOrganizationDisplayName(b)));
    organizationMeta = organizations;
    renderOrganizationList(organizations);
    refreshOrganizationMembershipSection();
  } catch (err) {
    console.error("Error loading organizations:", err);
    organizationList.textContent = "Error loading organizations.";
  }
}

function renderOrganizationList(orgs) {
  clearChildren(organizationList);

  if (!orgs.length) {
    organizationList.textContent = "No organizations defined.";
    return;
  }

  orgs.forEach(org => {
    const row = createEl("div", { className: "list-row list-row-stacked" });
    row.appendChild(createEl("div", { className: "list-row-title", text: getOrganizationDisplayName(org) }));
    row.appendChild(createEl("div", { className: "list-row-meta", text: getOrganizationSummary(org) }));
    row.addEventListener("click", () => openOrganizationEditor(org));
    organizationList.appendChild(row);
  });
}

function openOrganizationEditor(org) {
  editingOrganizationId = org?.id || null;
  organizationEditorTitle.textContent = editingOrganizationId ? "Edit Organization" : "Add Organization";

  organizationNameInput.value = normalizeString(org?.name);
  organizationStatusInput.value = normalizeString(org?.status) || "active";
  organizationPrimaryEmailInput.value = normalizeString(org?.primaryEmail);
  organizationPhoneInput.value = normalizeString(org?.phone);
  organizationWebsiteInput.value = normalizeString(org?.website);
  organizationNotesInput.value = normalizeString(org?.notes);

  hide(membershipEditor);
  editingMembershipId = null;
  membershipUidInput.disabled = false;
  refreshOrganizationMembershipSection();
  show(organizationEditor);
}

function collectOrganizationPayload() {
  return {
    name: normalizeString(organizationNameInput.value),
    status: normalizeString(organizationStatusInput.value) || "active",
    primaryEmail: normalizeString(organizationPrimaryEmailInput.value),
    phone: normalizeString(organizationPhoneInput.value),
    website: normalizeString(organizationWebsiteInput.value),
    notes: normalizeString(organizationNotesInput.value)
  };
}

addOrganizationBtn?.addEventListener("click", () => {
  openOrganizationEditor(null);
});

cancelOrganizationBtn?.addEventListener("click", () => {
  hide(organizationEditor);
  editingOrganizationId = null;
  hide(membershipEditor);
  editingMembershipId = null;
  membershipUidInput.disabled = false;
  refreshOrganizationMembershipSection();
});

saveOrganizationBtn?.addEventListener("click", async () => {
  const payload = collectOrganizationPayload();
  if (!payload.name) {
    alert("Organization name is required.");
    return;
  }

  const actor = getCurrentActorMetadata();
  const duplicate = organizationMeta.find(org =>
    org.id !== editingOrganizationId &&
    normalizeString(org.name).toLowerCase() === payload.name.toLowerCase()
  );

  if (duplicate) {
    alert(`An organization named "${duplicate.name}" already exists.`);
    return;
  }

  payload.updatedAt = serverTimestamp();
  payload.updatedBy = actor.uid;
  payload.updatedByEmail = actor.email;

  try {
    if (editingOrganizationId) {
      await updateDoc(doc(db, "organizations", editingOrganizationId), payload);
    } else {
      payload.createdAt = serverTimestamp();
      payload.createdBy = actor.uid;
      payload.createdByEmail = actor.email;
      await addDoc(collection(db, "organizations"), payload);
    }

    hide(organizationEditor);
    await loadOrganizations();
    await loadResources();
    await loadMemberships();
    await loadReviewRequests();
  } catch (err) {
    console.error("Error saving organization:", err);
    alert("Error saving organization. See console for details.");
  }
});

deleteOrganizationBtn?.addEventListener("click", async () => {
  if (!editingOrganizationId) return;

  const attachedResources = resourceMeta.filter(resource => normalizeString(resource.organizationId) === editingOrganizationId);
  if (attachedResources.length > 0) {
    alert(`Cannot delete this organization while ${attachedResources.length} resource(s) still reference it.`);
    return;
  }
  const attachedMemberships = membershipMeta.filter(item => normalizeString(item.organizationId) === editingOrganizationId);
  if (attachedMemberships.length > 0) {
    alert(`Cannot delete this organization while ${attachedMemberships.length} authorized editor record(s) still reference it.`);
    return;
  }

  if (!confirm("Delete this organization?")) return;

  try {
    await deleteDoc(doc(db, "organizations", editingOrganizationId));
    hide(organizationEditor);
    await loadOrganizations();
    await loadResources();
    await loadMemberships();
    await loadReviewRequests();
  } catch (err) {
    console.error("Error deleting organization:", err);
    alert("Error deleting organization. See console for details.");
  }
});

// ------------------------------------------------------
// MEMBERSHIPS (CRUD)
// ------------------------------------------------------
async function loadMemberships() {
  if (!membershipList) return;

  hide(membershipEditor);
  editingMembershipId = null;
  membershipList.textContent = editingOrganizationId ? "Loading..." : "";
  membershipMeta = [];

  try {
    const snap = await getDocs(collection(db, "organization_members"));
    const memberships = [];

    snap.forEach(ds => {
      const data = ds.data() || {};
      memberships.push({
        id: ds.id,
        uid: normalizeString(data.uid || ds.id),
        email: normalizeString(data.email),
        organizationId: normalizeString(data.organizationId),
        role: normalizeString(data.role) || "org_editor",
        status: normalizeString(data.status) || "active",
        notes: normalizeString(data.notes)
      });
    });

    memberships.sort((a, b) => normalizeString(a.email).localeCompare(normalizeString(b.email)));
    membershipMeta = memberships;
    refreshOrganizationMembershipSection();
  } catch (err) {
    console.error("Error loading memberships:", err);
    membershipList.textContent = "Error loading organization editors.";
  }
}

function renderMembershipList(memberships) {
  clearChildren(membershipList);

  if (!memberships.length) {
    membershipList.textContent = "No authorized editors yet.";
    return;
  }

  memberships.forEach(membership => {
    const row = createEl("div", { className: "list-row list-row-stacked" });
    row.appendChild(createEl("div", {
      className: "list-row-title",
      text: normalizeString(membership.email) || membership.uid || "(Unnamed membership)"
    }));
    row.appendChild(createEl("div", {
      className: "list-row-meta",
      text: getMembershipSummary(membership)
    }));
    row.addEventListener("click", () => openMembershipEditor(membership));
    membershipList.appendChild(row);
  });
}

function openMembershipEditor(membership) {
  if (!editingOrganizationId) {
    alert("Save the organization first, then add authorized editors.");
    return;
  }

  editingMembershipId = membership?.id || null;
  membershipEditorTitle.textContent = editingMembershipId ? "Edit Authorized Editor" : "Add Authorized Editor";
  membershipUidInput.disabled = Boolean(editingMembershipId);
  membershipUidInput.value = normalizeString(membership?.uid);
  membershipEmailInput.value = normalizeString(membership?.email);
  membershipRoleSelect.value = normalizeString(membership?.role) || "org_editor";
  membershipStatusSelect.value = normalizeString(membership?.status) || "active";
  membershipNotesInput.value = normalizeString(membership?.notes);

  show(membershipEditor);
}

function collectMembershipPayload() {
  return {
    uid: normalizeString(membershipUidInput.value),
    email: normalizeString(membershipEmailInput.value),
    organizationId: normalizeString(editingOrganizationId),
    role: normalizeString(membershipRoleSelect.value) || "org_editor",
    status: normalizeString(membershipStatusSelect.value) || "active",
    notes: normalizeString(membershipNotesInput.value)
  };
}

addMembershipBtn?.addEventListener("click", () => {
  openMembershipEditor(null);
});

cancelMembershipBtn?.addEventListener("click", () => {
  hide(membershipEditor);
  editingMembershipId = null;
  membershipUidInput.disabled = false;
});

saveMembershipBtn?.addEventListener("click", async () => {
  const payload = collectMembershipPayload();
  if (!editingOrganizationId) {
    alert("Save the organization first, then add authorized editors.");
    return;
  }
  if (!payload.uid) {
    alert("Firebase Auth UID is required.");
    return;
  }
  if (!editingMembershipId && membershipMeta.some(item => item.id === payload.uid)) {
    alert("A membership record for that UID already exists.");
    return;
  }

  const actor = getCurrentActorMetadata();
  payload.updatedAt = serverTimestamp();
  payload.updatedBy = actor.uid;
  payload.updatedByEmail = actor.email;

  try {
    if (editingMembershipId) {
      await updateDoc(doc(db, "organization_members", editingMembershipId), payload);
    } else {
      payload.createdAt = serverTimestamp();
      payload.createdBy = actor.uid;
      payload.createdByEmail = actor.email;
      await setDoc(doc(db, "organization_members", payload.uid), payload);
    }

    hide(membershipEditor);
    editingMembershipId = null;
    membershipUidInput.disabled = false;
    await loadMemberships();
  } catch (err) {
    console.error("Error saving membership:", err);
    alert("Error saving organization access. See console for details.");
  }
});

deleteMembershipBtn?.addEventListener("click", async () => {
  if (!editingMembershipId) return;
  if (!confirm("Delete this organization access record?")) return;

  try {
    await deleteDoc(doc(db, "organization_members", editingMembershipId));
    hide(membershipEditor);
    editingMembershipId = null;
    membershipUidInput.disabled = false;
    await loadMemberships();
  } catch (err) {
    console.error("Error deleting membership:", err);
    alert("Error deleting organization access. See console for details.");
  }
});

// ------------------------------------------------------
// REVIEW REQUESTS
// ------------------------------------------------------
async function loadReviewRequests() {
  if (!requestList) return;

  hide(requestEditor);
  editingRequestId = null;
  requestList.textContent = "Loading...";
  requestMeta = [];

  try {
    const snap = await getDocs(collection(db, "resource_change_requests"));
    const requests = [];

    snap.forEach(ds => {
      const data = ds.data() || {};
      requests.push({
        id: ds.id,
        ...data
      });
    });

    requests.sort((a, b) => {
      const statusRank = value => {
        const status = normalizeRequestStatus(value);
        if (status === "pending") return 0;
        if (status === "approved") return 1;
        return 2;
      };
      const rankDelta = statusRank(a.status) - statusRank(b.status);
      if (rankDelta !== 0) return rankDelta;

      const aTime = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
      const bTime = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
      return bTime - aTime;
    });

    requestMeta = requests;
    selectedRequestIds = new Set(
      Array.from(selectedRequestIds).filter(id => requests.some(requestDoc => requestDoc.id === id))
    );
    updateRequestFilterUi();
    updateRequestSelectionUi();
    renderRequestList(getFilteredRequests());
  } catch (err) {
    console.error("Error loading requests:", err);
    requestList.textContent = "Error loading requests.";
  }
}

function renderRequestList(requests) {
  clearChildren(requestList);

  if (!requests.length) {
    requestList.textContent = `No ${activeRequestFilter} requests found.`;
    return;
  }

  requests.forEach(requestDoc => {
    const row = createEl("div", {
      className: `list-row request-list-row${selectedRequestIds.has(requestDoc.id) ? " selected" : ""}`
    });

    const checkWrap = createEl("label", { className: "request-row-check" });
    const checkbox = createEl("input", {
      attrs: { type: "checkbox", "aria-label": `Select request for ${normalizeString(requestDoc.resourceName) || "resource"}` }
    });
    checkbox.checked = selectedRequestIds.has(requestDoc.id);
    checkbox.addEventListener("click", event => {
      event.stopPropagation();
    });
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedRequestIds.add(requestDoc.id);
      } else {
        selectedRequestIds.delete(requestDoc.id);
      }
      updateRequestSelectionUi();
      renderRequestList(getFilteredRequests());
    });
    checkWrap.appendChild(checkbox);
    row.appendChild(checkWrap);

    const content = createEl("div", { className: "request-row-content list-row-stacked" });
    content.appendChild(createEl("div", {
      className: "list-row-title",
      text: normalizeString(requestDoc.resourceName) || "(Unnamed request)"
    }));
    content.appendChild(createEl("div", {
      className: "list-row-meta",
      text: getRequestSummaryText(requestDoc)
    }));
    content.appendChild(createEl("span", {
      className: `request-status-pill ${normalizeRequestStatus(requestDoc.status)}`,
      text: getRequestStatusLabel(requestDoc.status)
    }));
    row.appendChild(content);
    row.addEventListener("click", () => openRequestEditor(requestDoc));
    requestList.appendChild(row);
  });
}

function openRequestEditor(requestDoc) {
  editingRequestId = requestDoc?.id || null;
  requestEditorTitle.textContent = "Review Request";
  requestReviewNotes.value = normalizeString(requestDoc?.reviewNotes);
  clearChildren(requestSummary);
  setRequestEditMode(false);

  const currentResource = resourceMeta.find(resource => resource.id === requestDoc.resourceId);
  requestSummary.appendChild(buildRequestMetaBlock(requestDoc));
  requestSummary.appendChild(buildRequestDiffList(currentResource, requestDoc.proposedData));

  show(requestEditor);
}

closeRequestBtn?.addEventListener("click", () => {
  hide(requestEditor);
  editingRequestId = null;
  setRequestEditMode(false);
});

async function applyReviewAction(requestDoc, nextStatus, reviewNotes, overrideProposedData = null) {
  if (!requestDoc) return;

  const actor = getCurrentActorMetadata();
  const effectiveProposedData = sanitizeRequestedResourceData(overrideProposedData || requestDoc.proposedData);

  if (nextStatus === "approved") {
    const resourcePayload = {
      ...effectiveProposedData,
      organizationId: normalizeString(requestDoc.organizationId),
      status: "published",
      submissionState: "approved",
      updatedAt: serverTimestamp(),
      updatedByUid: actor.uid,
      updatedByEmail: actor.email,
      lastSubmittedAt: requestDoc.createdAt || serverTimestamp(),
      lastSubmittedBy: normalizeString(requestDoc.submittedByUid),
      lastApprovedAt: serverTimestamp(),
      lastApprovedBy: actor.uid
    };

    await updateDoc(doc(db, "resources", requestDoc.resourceId), resourcePayload);
  }

  await updateDoc(doc(db, "resource_change_requests", requestDoc.id), {
    status: nextStatus,
    reviewNotes,
    proposedData: effectiveProposedData,
    reviewedAt: serverTimestamp(),
    reviewedBy: actor.uid,
    reviewedByEmail: actor.email,
    updatedAt: serverTimestamp()
  });
}

async function reviewRequest(nextStatus) {
  if (!editingRequestId) return;

  const requestDoc = requestMeta.find(item => item.id === editingRequestId);
  if (!requestDoc) return;

  const reviewNotes = normalizeString(requestReviewNotes.value);

  try {
    const editedProposedData = requestEditMode && nextStatus === "approved"
      ? collectRequestEditPayload()
      : null;
    await applyReviewAction(requestDoc, nextStatus, reviewNotes, editedProposedData);
    selectedRequestIds.delete(requestDoc.id);
    hide(requestEditor);
    editingRequestId = null;
    setRequestEditMode(false);
    await loadResources();
    await loadReviewRequests();
  } catch (err) {
    console.error("Error reviewing request:", err);
    alert("Error updating change request. See console for details.");
  }
}

async function deleteSingleRequest() {
  if (!editingRequestId) return;

  const requestDoc = requestMeta.find(item => item.id === editingRequestId);
  if (!requestDoc) return;
  if (!confirm("Delete this review request?")) return;

  try {
    await deleteDoc(doc(db, "resource_change_requests", requestDoc.id));
    selectedRequestIds.delete(requestDoc.id);
    hide(requestEditor);
    editingRequestId = null;
    setRequestEditMode(false);
    await loadReviewRequests();
  } catch (err) {
    console.error("Error deleting request:", err);
    alert("Error deleting change request. See console for details.");
  }
}

async function applyBulkRequestAction(action) {
  const selectedIds = Array.from(selectedRequestIds);
  if (!selectedIds.length) return;

  const selectedRequests = requestMeta.filter(item => selectedIds.includes(item.id));
  if (!selectedRequests.length) return;

  const actionLabel = action === "approved" ? "approve"
    : action === "rejected" ? "reject"
    : "delete";
  if (!confirm(`${actionLabel[0].toUpperCase()}${actionLabel.slice(1)} ${selectedRequests.length} selected request(s)?`)) {
    return;
  }

  try {
    if (action === "delete") {
      await Promise.all(selectedRequests.map(requestDoc =>
        deleteDoc(doc(db, "resource_change_requests", requestDoc.id))
      ));
    } else {
      await Promise.all(selectedRequests.map(requestDoc =>
        applyReviewAction(requestDoc, action, "")
      ));
      if (action === "approved") {
        await loadResources();
      }
    }

    selectedRequestIds.clear();
    if (editingRequestId && selectedIds.includes(editingRequestId)) {
      hide(requestEditor);
      editingRequestId = null;
      setRequestEditMode(false);
    }
    await loadReviewRequests();
  } catch (err) {
    console.error("Error applying bulk request action:", err);
    alert("Error applying bulk request action. See console for details.");
  }
}

approveRequestBtn?.addEventListener("click", async () => {
  await reviewRequest("approved");
});

rejectRequestBtn?.addEventListener("click", async () => {
  await reviewRequest("rejected");
});

deleteRequestBtn?.addEventListener("click", async () => {
  await deleteSingleRequest();
});

editRequestBtn?.addEventListener("click", () => {
  if (!editingRequestId) return;
  const requestDoc = requestMeta.find(item => item.id === editingRequestId);
  if (!requestDoc) return;
  setRequestEditMode(!requestEditMode, requestDoc);
});

requestFilterPendingBtn?.addEventListener("click", () => {
  setActiveRequestFilter("pending");
});

requestFilterApprovedBtn?.addEventListener("click", () => {
  setActiveRequestFilter("approved");
});

requestFilterRejectedBtn?.addEventListener("click", () => {
  setActiveRequestFilter("rejected");
});

bulkApproveRequestsBtn?.addEventListener("click", async () => {
  await applyBulkRequestAction("approved");
});

bulkRejectRequestsBtn?.addEventListener("click", async () => {
  await applyBulkRequestAction("rejected");
});

bulkDeleteRequestsBtn?.addEventListener("click", async () => {
  await applyBulkRequestAction("delete");
});

// ------------------------------------------------------
// CATEGORIES (CRUD)
// ------------------------------------------------------
async function loadCategories() {
  categoryList.textContent = "Loading...";
  categoryMeta = [];

  try {
    const snap = await getDocs(collection(db, "categories"));
    const cats = [];
    snap.forEach(ds => {
      const d = ds.data() || {};
      cats.push({
        id: ds.id,
        name: normalizeString(d.name),
        subcategories: normalizeStringArray(d.subcategories),
      });
    });

    cats.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    categoryMeta = cats;
    renderCategoryList(cats);
  } catch (err) {
    console.error("Error loading categories:", err);
    categoryList.textContent = "Error loading categories.";
  }
}

function renderCategoryList(cats) {
  clearChildren(categoryList);

  if (!cats.length) {
    categoryList.textContent = "No categories defined.";
    return;
  }

  cats.forEach(cat => {
    const row = createEl("div", { className: "list-row", text: cat.name || "(Unnamed)" });
    row.addEventListener("click", () => openCategoryEditor(cat));
    categoryList.appendChild(row);
  });
}

function openCategoryEditor(cat) {
  editingCategoryId = cat?.id || null;
  categoryEditorTitle.textContent = editingCategoryId ? "Edit Category" : "Add Category";

  categoryNameInput.value = cat?.name || "";
  renderSubcategoryEditorRows(cat?.subcategories || []);

  show(categoryEditor);
}

function renderSubcategoryEditorRows(subs) {
  clearChildren(subcategoryList);

  (subs || []).forEach((s) => {
    const row = createEl("div", { className: "sub-row" });
    const input = createEl("input", { className: "sub-input", attrs: { type: "text" } });
    input.value = normalizeString(s);

    const del = createEl("button", { className: "sub-delete-btn", text: "Remove" });
    del.addEventListener("click", () => row.remove());

    row.appendChild(input);
    row.appendChild(del);
    subcategoryList.appendChild(row);
  });
}

addSubBtn?.addEventListener("click", () => {
  const row = createEl("div", { className: "sub-row" });
  const input = createEl("input", { className: "sub-input", attrs: { type: "text" } });
  input.value = "";

  const del = createEl("button", { className: "sub-delete-btn", text: "Remove" });
  del.addEventListener("click", () => row.remove());

  row.appendChild(input);
  row.appendChild(del);
  subcategoryList.appendChild(row);
});

addCategoryBtn?.addEventListener("click", () => {
  openCategoryEditor(null);
});

cancelCategoryBtn?.addEventListener("click", () => {
  hide(categoryEditor);
});

saveCategoryBtn?.addEventListener("click", async () => {
  const name = normalizeString(categoryNameInput.value);
  if (!name) {
    alert("Category name is required.");
    return;
  }

  const rawSubs = Array.from(subcategoryList.querySelectorAll("input"))
    .map(i => normalizeString(i.value))
    .filter(Boolean);
  const normalizedSubs = canonicalizeSubcategoryInput(rawSubs);
  const subs = normalizedSubs.values;

  const payload = { name, subcategories: subs };

  try {
    if (editingCategoryId) {
      await updateDoc(doc(db, "categories", editingCategoryId), payload);
    } else {
      await addDoc(collection(db, "categories"), payload);
    }
    hide(categoryEditor);
    await loadCategories();
    await loadResources();
    if (normalizedSubs.changes.length > 0) {
      const preview = normalizedSubs.changes
        .slice(0, 8)
        .map(change => `- ${formatNormalizationChange(change)}`)
        .join("\n");
      const suffix = normalizedSubs.changes.length > 8
        ? `\n- ...and ${normalizedSubs.changes.length - 8} more`
        : "";

      alert(`Subcategories were normalized before save:\n${preview}${suffix}`);
    }
  } catch (err) {
    console.error("Error saving category:", err);
    alert("Error saving category. See console for details.");
  }
});

deleteCategoryBtn?.addEventListener("click", async () => {
  if (!editingCategoryId) return;
  if (!confirm("Delete this category?")) return;

  try {
    await deleteDoc(doc(db, "categories", editingCategoryId));
    hide(categoryEditor);
    await loadCategories();
    await loadResources();
  } catch (err) {
    console.error("Error deleting category:", err);
    alert("Error deleting category. See console for details.");
  }
});
