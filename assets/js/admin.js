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
const panelReviewStatus = document.getElementById("panel-review-status");
const panelRequests = document.getElementById("panel-requests");
const panelMail = document.getElementById("panel-mail");
const panelAudit = document.getElementById("panel-audit");

// Resources UI
const resourceList = document.getElementById("resource-list");
const resourceEditor = document.getElementById("resource-editor");
const editorTitle = document.getElementById("editor-title");
const resourceForm = document.getElementById("resource-form");
const resourceSaveStatus = document.getElementById("resource-save-status");

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
const deleteMembershipUserBtn = document.getElementById("delete-membership-user-btn");
const cancelMembershipBtn = document.getElementById("cancel-membership-btn");

// Invites UI
const inviteList = document.getElementById("invite-list");
const inviteEditor = document.getElementById("invite-editor");
const inviteEditorTitle = document.getElementById("invite-editor-title");
const inviteSectionHelper = document.getElementById("invite-section-helper");
const inviteEmailInput = document.getElementById("invite-email-input");
const inviteRoleSelect = document.getElementById("invite-role-select");
const inviteCustomMessageInput = document.getElementById("invite-custom-message-input");
const inviteNotesInput = document.getElementById("invite-notes-input");
const inviteMetaFields = document.getElementById("invite-meta-fields");
const addInviteBtn = document.getElementById("add-invite-btn");
const saveInviteBtn = document.getElementById("save-invite-btn");
const retryInviteBtn = document.getElementById("retry-invite-btn");
const revokeInviteBtn = document.getElementById("revoke-invite-btn");
const deleteInviteBtn = document.getElementById("delete-invite-btn");
const cancelInviteBtn = document.getElementById("cancel-invite-btn");

// Review status UI
const reviewStatusList = document.getElementById("review-status-list");
const reviewStatusEditor = document.getElementById("review-status-editor");
const reviewStatusEditorTitle = document.getElementById("review-status-editor-title");
const reviewStatusSummary = document.getElementById("review-status-summary");
const refreshReviewStatusBtn = document.getElementById("refresh-review-status-btn");
const reviewFilterDueBtn = document.getElementById("review-filter-due");
const reviewFilterAttentionBtn = document.getElementById("review-filter-attention");
const reviewFilterCurrentBtn = document.getElementById("review-filter-current");
const reviewOrganizationFilter = document.getElementById("review-organization-filter");
const sendReviewReminderBtn = document.getElementById("send-review-reminder-btn");
const openReviewResourceBtn = document.getElementById("open-review-resource-btn");
const closeReviewStatusBtn = document.getElementById("close-review-status-btn");

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

// Mail queue UI
const mailList = document.getElementById("mail-list");
const mailEditor = document.getElementById("mail-editor");
const mailEditorTitle = document.getElementById("mail-editor-title");
const mailSummary = document.getElementById("mail-summary");
const mailHtmlPreview = document.getElementById("mail-html-preview");
const mailTextPreview = document.getElementById("mail-text-preview");
const mailFilterQueuedBtn = document.getElementById("mail-filter-queued");
const mailFilterSentBtn = document.getElementById("mail-filter-sent");
const mailFilterFailedBtn = document.getElementById("mail-filter-failed");
const mailSelectionCount = document.getElementById("mail-selection-count");
const bulkDeleteMailBtn = document.getElementById("bulk-delete-mail-btn");
const refreshMailBtn = document.getElementById("refresh-mail-btn");
const openMailRequestBtn = document.getElementById("open-mail-request-btn");
const openMailResourceBtn = document.getElementById("open-mail-resource-btn");
const retryMailBtn = document.getElementById("retry-mail-btn");
const deleteMailBtn = document.getElementById("delete-mail-btn");
const closeMailBtn = document.getElementById("close-mail-btn");

// Audit UI
const auditList = document.getElementById("audit-list");
const auditEditor = document.getElementById("audit-editor");
const auditEditorTitle = document.getElementById("audit-editor-title");
const auditSummary = document.getElementById("audit-summary");
const auditDetails = document.getElementById("audit-details");
const refreshAuditBtn = document.getElementById("refresh-audit-btn");
const auditFilterAllBtn = document.getElementById("audit-filter-all");
const auditFilterDirectoryBtn = document.getElementById("audit-filter-directory");
const auditFilterRequestsBtn = document.getElementById("audit-filter-requests");
const auditFilterMailBtn = document.getElementById("audit-filter-mail");
const auditFilterAccessBtn = document.getElementById("audit-filter-access");
const closeAuditBtn = document.getElementById("close-audit-btn");

// ------------------------------------------------------
// STATE
// ------------------------------------------------------
let editingResourceId = null;
let editingCategoryId = null;
let editingOrganizationId = null;
let editingMembershipId = null;
let editingInviteId = null;
let editingRequestId = null;
let editingResourceData = null;
let categoryMeta = [];
let organizationMeta = [];
let resourceMeta = [];
let membershipMeta = [];
let inviteMeta = [];
let requestMeta = [];
let mailMeta = [];
let auditMeta = [];
let navInitialized = false;
let activeRequestFilter = "pending";
let activeMailFilter = "queued";
let activeAuditFilter = "all";
let activePanelName = "resources";
let selectedRequestIds = new Set();
let selectedMailIds = new Set();
let requestEditMode = false;
let editingMailId = null;
let editingAuditId = null;
let editingReviewStatusId = null;
let mailAutoRefreshHandle = null;
let mailLoadInFlight = false;
let reviewAutoRefreshHandle = null;
let reviewConfirmationMeta = [];
let reviewStatusMeta = [];
let activeReviewFilter = "due";
let activeReviewOrganizationFilter = "";
let resourceSaveStatusTimer = null;

const quillEditors = new Map();
const quillToolbarOptions = [
  ["bold", "italic", "underline"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["link", "clean"]
];
const quillFormats = ["bold", "italic", "underline", "list", "link"];
const richTextAllowedTags = ["a", "br", "em", "li", "ol", "p", "strong", "u", "ul"];
const richTextAllowedAttrs = ["href"];
const REVIEW_REMINDER_DAYS = 90;
const REVIEW_ADMIN_ATTENTION_DAYS = 365;
const reviewRequestAccessMailto = "mailto:mwinterman@washoecounty.gov?subject=Community%20Resource%20Finder%20Editor%20Access%20Request";
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
  "Latitude",
  "Longitude",
  "IncludeInMap",
  "Hours",
  "Eligibility",
  "Cost",
  "Languages",
  "Last Verified",
  "Notes",
  "NotesDelta"
];
const requestReviewFieldConfig = [
  { field: "Organization", label: "Resource" },
  { field: "Description", label: "Short Description", type: "richtext" },
  { field: "Notes", label: "Detailed Description", type: "richtext" },
  { field: "Categories", label: "Categories", type: "string-array" },
  { field: "Subcategories", label: "Subcategories", type: "string-array" },
  { field: "Websites", label: "Websites", type: "website-array" },
  { field: "PhoneNumbers", label: "Phone Numbers", type: "phone-array" },
  { field: "Email", label: "Email", type: "email" },
  { field: "Address", label: "Address" },
  { field: "City", label: "City" },
  { field: "Zip", label: "Zip" },
  { field: "Latitude", label: "Latitude" },
  { field: "Longitude", label: "Longitude" },
  { field: "IncludeInMap", label: "Include in Map", type: "boolean" },
  { field: "Hours", label: "Hours" },
  { field: "Eligibility", label: "Eligibility" },
  { field: "Cost", label: "Cost" },
  { field: "Languages", label: "Languages" },
  { field: "Keywords", label: "Keywords" },
  { field: "Last Verified", label: "Last Verified" },
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

function clearResourceSaveStatus() {
  if (resourceSaveStatusTimer) {
    window.clearTimeout(resourceSaveStatusTimer);
    resourceSaveStatusTimer = null;
  }

  if (!resourceSaveStatus) return;
  resourceSaveStatus.textContent = "";
  resourceSaveStatus.classList.remove("visible");
}

function showResourceSaveStatus(message = "Resource saved") {
  if (!resourceSaveStatus) return;

  clearResourceSaveStatus();
  resourceSaveStatus.textContent = message;
  resourceSaveStatus.classList.add("visible");
  resourceSaveStatusTimer = window.setTimeout(() => {
    resourceSaveStatus.classList.remove("visible");
    resourceSaveStatus.textContent = "";
    resourceSaveStatusTimer = null;
  }, 10000);
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

function normalizeBaseUrl(value) {
  const normalized = normalizeString(value);
  if (!normalized) return "";

  try {
    const url = new URL(normalized);
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return "";
  }
}

const publicBaseUrl = (() => {
  const current = new URL(window.location.href);
  if (/github\.io$/i.test(current.hostname)) {
    return `${current.origin}${current.pathname.replace(/\/[^/]*$/, "")}`;
  }
  return normalizeBaseUrl(window.localStorage?.getItem("crfPublicBaseUrl"))
    || "https://mitchwinterman.github.io/community-resource-finder";
})();

function getPortalUrl() {
  return `${publicBaseUrl}/login.html`;
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

  const stringValue = normalizeString(value);
  if (!stringValue) return null;
  const parsed = new Date(stringValue);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getLatestDate(dates = []) {
  return dates.reduce((latest, current) => {
    if (!current) return latest;
    if (!latest || current.getTime() > latest.getTime()) return current;
    return latest;
  }, null);
}

function formatDateOnly(value) {
  const dateValue = value instanceof Date ? value : getValueDate(value);
  return dateValue ? dateValue.toLocaleDateString() : "";
}

function formatDaysAgo(dateValue) {
  if (!(dateValue instanceof Date)) return "";
  const diffMs = Date.now() - dateValue.getTime();
  if (diffMs < 0) return "0 days";
  return `${Math.floor(diffMs / (24 * 60 * 60 * 1000))} days`;
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
      : formatTimestampValue(latest.date)
  };
}

function getDaysSinceReview(resource) {
  const anchor = getResourceReviewAnchor(resource);
  if (!(anchor.date instanceof Date)) return Number.POSITIVE_INFINITY;
  return Math.floor((Date.now() - anchor.date.getTime()) / (24 * 60 * 60 * 1000));
}

function getReviewStatusBucket(resource) {
  const daysSince = getDaysSinceReview(resource);
  if (daysSince >= REVIEW_ADMIN_ATTENTION_DAYS) return "attention";
  if (daysSince >= REVIEW_REMINDER_DAYS) return "due";
  return "current";
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

function normalizeMailStatus(value) {
  const status = normalizeString(value).toLowerCase();
  if (["queued", "processing", "sent", "failed"].includes(status)) return status;
  return "queued";
}

function getMailStatusLabel(value) {
  const status = normalizeMailStatus(value);
  if (status === "processing") return "processing";
  if (status === "sent") return "sent";
  if (status === "failed") return "failed";
  return "queued";
}

function normalizeAuditArea(value) {
  const area = normalizeString(value).toLowerCase();
  if (["directory", "requests", "mail", "access"].includes(area)) return area;
  return "all";
}

function getAuditAreaLabel(value) {
  const area = normalizeAuditArea(value);
  if (area === "directory") return "directory";
  if (area === "requests") return "requests";
  if (area === "mail") return "mail";
  if (area === "access") return "access";
  return "other";
}

function escapeHtml(value) {
  return normalizeString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildRequestStatusMailPayload(requestDoc, nextStatus, reviewNotes) {
  const status = normalizeRequestStatus(nextStatus);
  const recipient = normalizeString(requestDoc?.submittedByEmail);
  if (!recipient || !["approved", "rejected"].includes(status)) {
    return null;
  }

  const resourceName = normalizeString(requestDoc?.resourceName) || "your resource update";
  const requestId = normalizeString(requestDoc?.id);
  const resourceId = normalizeString(requestDoc?.resourceId);
  const reviewedAt = new Date().toLocaleString();
  const orgPortalUrl = getPortalUrl();
  const intro = status === "approved"
    ? `Your Community Resource Finder update for "${resourceName}" has been approved.`
    : `Your Community Resource Finder update for "${resourceName}" has been rejected.`;
  const subject = `[CRF] Update ${status}: ${resourceName}`;
  const notesText = normalizeString(reviewNotes);

  const text = [
    intro,
    `Reviewed: ${reviewedAt}`,
    notesText ? "" : "",
    notesText ? `Library notes:\n${notesText}` : "",
    requestId ? `Request ID: ${requestId}` : "",
    resourceId ? `Resource ID: ${resourceId}` : "",
    "",
    `Organization portal: ${orgPortalUrl}`,
    "If you have questions, reply to this email or contact library staff."
  ].filter(Boolean).join("\n");

  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    `<p><strong>Reviewed:</strong> ${escapeHtml(reviewedAt)}</p>`,
    notesText
      ? `<p><strong>Library notes:</strong><br>${escapeHtml(notesText).replace(/\r?\n/g, "<br>")}</p>`
      : "",
    requestId || resourceId
      ? `<p>${
        [
          requestId ? `<strong>Request ID:</strong> ${escapeHtml(requestId)}` : "",
          resourceId ? `<strong>Resource ID:</strong> ${escapeHtml(resourceId)}` : ""
        ].filter(Boolean).join("<br>")
      }</p>`
      : "",
    `<p><a href="${escapeHtml(orgPortalUrl)}">Open the organization portal</a></p>`,
    "<p>If you have questions, reply to this email or contact library staff.</p>"
  ].filter(Boolean).join("");

  return {
    to: recipient,
    subject,
    text,
    html,
    type: "request_status",
    sourceCollection: "resource_change_requests",
    sourceId: normalizeString(requestDoc?.id),
    status: "queued"
  };
}

async function logAuditEvent({
  area = "all",
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
  try {
    const actor = getCurrentActorMetadata();
    await addDoc(collection(db, "audit_logs"), {
      area: normalizeAuditArea(area),
      action: normalizeString(action),
      entityType: normalizeString(entityType),
      entityId: normalizeString(entityId),
      entityLabel: normalizeString(entityLabel),
      organizationId: normalizeString(organizationId),
      relatedResourceId: normalizeString(relatedResourceId),
      relatedRequestId: normalizeString(relatedRequestId),
      relatedMailId: normalizeString(relatedMailId),
      actorType: "admin",
      actorUid: actor.uid,
      actorEmail: actor.email,
      source: "admin_ui",
      summary: normalizeString(summary),
      details: details && typeof details === "object" ? details : {},
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.error("Audit log write failed:", err);
  }
}

function getChangedFieldNames(beforeValue, afterValue, fields = []) {
  return fields.filter(field =>
    normalizeRequestComparableValue(beforeValue?.[field]) !== normalizeRequestComparableValue(afterValue?.[field])
  );
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

function normalizeInviteStatus(value) {
  const status = normalizeString(value).toLowerCase();
  if (["pending", "processing", "sent", "accepted", "failed", "revoked"].includes(status)) return status;
  return "pending";
}

function getInviteStatusLabel(value) {
  const status = normalizeInviteStatus(value);
  if (status === "processing") return "processing";
  if (status === "sent") return "sent";
  if (status === "accepted") return "accepted";
  if (status === "failed") return "failed";
  if (status === "revoked") return "revoked";
  return "pending";
}

function getInvitesForOrganization(organizationId) {
  const targetId = normalizeString(organizationId);
  if (!targetId) return [];
  return inviteMeta.filter(item => normalizeString(item.organizationId) === targetId);
}

function getInviteSummary(invite) {
  const status = getInviteStatusLabel(invite.status);
  const role = normalizeString(invite.role) || "org_editor";
  const sentAt = formatTimestampValue(invite.sentAt);
  return [role, status, sentAt].filter(Boolean).join(" | ");
}

function normalizeReviewConfirmationStatus(value) {
  const status = normalizeString(value).toLowerCase();
  if (["pending", "processing", "sent", "confirmed", "applied", "failed", "expired"].includes(status)) {
    return status;
  }
  return "pending";
}

function getReviewConfirmationsForResource(resourceId) {
  const targetId = normalizeString(resourceId);
  if (!targetId) return [];
  return reviewConfirmationMeta.filter(item =>
    normalizeString(item.resourceId) === targetId
    && normalizeString(item.type) === "quarterly_review"
  );
}

function getReviewConfirmationActivity(resourceId) {
  const confirmations = getReviewConfirmationsForResource(resourceId);
  const latestRequestAt = getLatestDate(requestMeta
    .filter(item => normalizeString(item.resourceId) === normalizeString(resourceId))
    .map(item => getLatestDate([
      getValueDate(item.createdAt),
      getValueDate(item.reviewedAt),
      getValueDate(item.updatedAt)
    ])));
  const latestByField = fieldName => getLatestDate(confirmations.map(item => getValueDate(item[fieldName])));
  const latestSent = latestByField("sentAt");
  const latestConfirmed = latestByField("confirmedAt");
  const latestApplied = latestByField("appliedAt");
  const latestAny = getLatestDate(confirmations.map(item =>
    getLatestDate([
      getValueDate(item.appliedAt),
      getValueDate(item.confirmedAt),
      getValueDate(item.sentAt),
      getValueDate(item.createdAt)
    ])
  ));
  const isStillOutstanding = (item, statusName) => {
    if (normalizeReviewConfirmationStatus(item.status) !== statusName) return false;
    if (!(latestRequestAt instanceof Date)) return true;

    const tokenTime = getLatestDate([
      getValueDate(item.confirmedAt),
      getValueDate(item.sentAt),
      getValueDate(item.createdAt)
    ]);

    return !(tokenTime instanceof Date) || tokenTime.getTime() > latestRequestAt.getTime();
  };

  return {
    confirmations,
    latestSent,
    latestConfirmed,
    latestApplied,
    latestAny,
    latestRequestAt,
    sentCount: confirmations.filter(item => isStillOutstanding(item, "sent")).length,
    confirmedCount: confirmations.filter(item => isStillOutstanding(item, "confirmed")).length,
    failedCount: confirmations.filter(item => normalizeReviewConfirmationStatus(item.status) === "failed").length,
    recipientEmails: Array.from(new Set(confirmations
      .map(item => normalizeString(item.recipientEmail).toLowerCase())
      .filter(Boolean)))
  };
}

function populateReviewOrganizationFilter() {
  if (!reviewOrganizationFilter) return;

  const previousValue = normalizeString(activeReviewOrganizationFilter);
  clearChildren(reviewOrganizationFilter);
  reviewOrganizationFilter.appendChild(createEl("option", {
    text: "All Organizations",
    attrs: { value: "" }
  }));

  organizationMeta
    .slice()
    .sort((a, b) => getOrganizationDisplayName(a).localeCompare(getOrganizationDisplayName(b)))
    .forEach(org => {
      reviewOrganizationFilter.appendChild(createEl("option", {
        text: getOrganizationDisplayName(org),
        attrs: { value: org.id }
      }));
    });

  reviewOrganizationFilter.value = organizationMeta.some(org => org.id === previousValue) ? previousValue : "";
  activeReviewOrganizationFilter = normalizeString(reviewOrganizationFilter.value);
}

function getReviewReminderRecipients(organizationId) {
  const org = organizationMeta.find(item => item.id === normalizeString(organizationId));
  const recipients = new Map();

  const primaryEmail = normalizeString(org?.primaryEmail).toLowerCase();
  if (primaryEmail) {
    recipients.set(primaryEmail, {
      email: primaryEmail,
      type: "organization_primary",
      uid: ""
    });
  }

  membershipMeta.forEach(member => {
    if (normalizeString(member.organizationId) !== normalizeString(organizationId)) return;
    if (normalizeString(member.status).toLowerCase() !== "active") return;

    const email = normalizeString(member.email).toLowerCase();
    if (!email) return;

    recipients.set(email, {
      email,
      type: "organization_editor",
      uid: normalizeString(member.uid || member.id)
    });
  });

  return Array.from(recipients.values());
}

function generateReviewToken() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now()}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

function buildQuarterlyReminderMailPayload({ recipientEmail, organizationName, entries }) {
  const loginUrl = getPortalUrl();
  const intro = `It is time to review your Community Resource Finder listing${entries.length === 1 ? "" : "s"} for ${organizationName || "your organization"}.`;
  const subject = `[CRF] Quarterly review requested for ${organizationName || "your organization"}`;

  const richTextToPlainText = (value) => {
    const cleanHtml = sanitizeRichTextHtml(value);
    if (!cleanHtml) return "";

    const template = document.createElement("template");
    template.innerHTML = cleanHtml;
    return normalizeString((template.content.textContent || "").replace(/\s+/g, " "));
  };

  const summarizeText = (value, maxLength = 280) => {
    const normalized = normalizeString(value);
    if (!normalized) return "";
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
  };

  const buildResourcePreviewRows = (resource) => {
    const source = resource && typeof resource === "object" ? resource : {};
    const websites = normalizeWebsiteList(Array.isArray(source.Websites) ? source.Websites : source.Website);
    const phones = normalizePhoneEntries(Array.isArray(source.PhoneNumbers) ? source.PhoneNumbers : source.Phone)
      .map(entry => getPhoneDisplayText(entry))
      .filter(Boolean);
    const lines = [
      ["Short description", summarizeText(richTextToPlainText(source.Description), 240)],
      ["Detailed description", summarizeText(richTextToPlainText(source.Notes), 320)],
      ["Categories", normalizeStringArray(source.Categories).join(", ")],
      ["Subcategories", normalizeStringArray(source.Subcategories).join(", ")],
      ["Phone", phones.join(" | ")],
      ["Website", websites.map(item => getWebsiteDisplayText(item)).filter(Boolean).join(" | ")],
      ["Email", normalizeString(source.Email)],
      ["Location", [normalizeString(source.Address), normalizeString(source.City), normalizeString(source.Zip)].filter(Boolean).join(", ")],
      ["Hours", normalizeString(source.Hours)],
      ["Eligibility", summarizeText(source.Eligibility, 220)],
      ["Cost", summarizeText(source.Cost, 180)],
      ["Languages", summarizeText(source.Languages, 180)]
    ];

    return lines.filter(([, value]) => normalizeString(value));
  };

  const textSections = entries.map(entry => [
    `${entry.resourceName}`,
    `Current review date: ${entry.reviewAnchorDate || "Not set"}`,
    ...buildResourcePreviewRows(entry.resource).map(([label, value]) => `${label}: ${value}`),
    `Yes, this looks correct: ${entry.confirmUrl}`,
    `No, I need to make changes: ${loginUrl}`
  ].join("\n"));

  const htmlSections = entries.map(entry => [
    `<div style="margin: 0 0 16px 0; padding: 14px; border: 1px solid #dbe4ff; border-radius: 10px; background: #f8fbff;">`,
    `<p style="margin: 0 0 6px 0;"><strong>${escapeHtml(entry.resourceName)}</strong></p>`,
    `<p style="margin: 0 0 10px 0;">Current review date: ${escapeHtml(entry.reviewAnchorDate || "Not set")}</p>`,
    ...buildResourcePreviewRows(entry.resource).map(([label, value]) =>
      `<p style="margin: 0 0 8px 0;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`
    ),
    `<p style="margin: 0 0 8px 0;"><a href="${escapeHtml(entry.confirmUrl)}">Yes, this looks correct</a></p>`,
    `<p style="margin: 0;"><a href="${escapeHtml(loginUrl)}">No, I need to make changes</a></p>`,
    `</div>`
  ].join("")).join("");

  const text = [
    intro,
    "",
    ...textSections.flatMap(section => [section, ""]),
    `If you do not already have editor access, request it here: ${reviewRequestAccessMailto}`,
    `Organization portal: ${loginUrl}`
  ].join("\n").trim();

  const html = [
    `<p>${escapeHtml(intro)}</p>`,
    htmlSections,
    `<p>If you do not already have editor access, <a href="${escapeHtml(reviewRequestAccessMailto)}">request it here</a>.</p>`,
    `<p>You can also sign in directly at <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a>.</p>`
  ].join("");

  return {
    to: recipientEmail,
    subject,
    text,
    html,
    type: "quarterly_review",
    sourceCollection: "resources"
  };
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

function refreshOrganizationInviteSection() {
  if (!inviteList || !inviteSectionHelper || !addInviteBtn) return;

  if (!editingOrganizationId) {
    hide(inviteEditor);
    editingInviteId = null;
    addInviteBtn.disabled = true;
    inviteSectionHelper.textContent = "Save this organization first, then create setup invites for editor accounts.";
    inviteList.textContent = "";
    return;
  }

  addInviteBtn.disabled = false;
  inviteSectionHelper.textContent = "Invites create or link an editor account, then email a one-time password setup link.";
  renderInviteList(getInvitesForOrganization(editingOrganizationId));
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
  const requestType = normalizeString(requestDoc.requestType) === "quarterly_confirmation"
    ? "Quarterly no-change confirmation"
    : "Resource edit request";
  const rows = [
    ["Resource", normalizeString(requestDoc.resourceName) || "(Unnamed resource)"],
    ["Organization", getOrganizationNameById(requestDoc.organizationId) || requestDoc.organizationId || "(Unknown organization)"],
    ["Request type", requestType],
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

function buildRequestDiffList(currentResource, proposedData, requestDoc = null) {
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
      text: normalizeString(requestDoc?.requestType) === "quarterly_confirmation"
        ? "The editor confirmed that the current live listing still looks correct and did not request content changes."
        : "The submitted request matches the current live values for all reviewable fields."
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
  requestEditForm.appendChild(buildFieldText("Organization", "Resource", data.Organization || "", true));
  requestEditForm.appendChild(buildFieldRichText(
    "Description",
    "Short Description",
    data.Description || "",
    data.DescriptionDelta || null
  ));
  requestEditForm.appendChild(buildFieldRichText(
    "Notes",
    "Detailed Description",
    data.Notes || "",
    data.NotesDelta || null
  ));
  requestEditForm.appendChild(buildNestedCategorySelector(data.Categories, data.Subcategories));
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
  requestEditForm.appendChild(buildFieldText("Latitude", "Latitude", data.Latitude ?? "", false));
  requestEditForm.appendChild(buildFieldText("Longitude", "Longitude", data.Longitude ?? "", false));
  requestEditForm.appendChild(buildFieldBooleanSelect("IncludeInMap", "Include in Map", data.IncludeInMap ?? true, "Include", "Don't Include"));
  requestEditForm.appendChild(buildGeocodeHelper(requestEditForm));
  requestEditForm.appendChild(buildFieldText("Hours", "Hours", data.Hours || "", false));
  requestEditForm.appendChild(buildFieldText("Eligibility", "Eligibility", data.Eligibility || "", false));
  requestEditForm.appendChild(buildFieldText("Cost", "Cost", data.Cost || "", false));
  requestEditForm.appendChild(buildFieldText("Languages", "Languages", data.Languages || "", false));
  requestEditForm.appendChild(buildFieldText("Keywords", "Keywords", data.Keywords || "", false));
  requestEditForm.appendChild(buildFieldDate("Last Verified", "Last Verified", data["Last Verified"] || ""));
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
  await loadInvites();
  await loadReviewRequests();
  await loadReviewStatus();
  await loadMailQueue();
  await loadAuditLogs();
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
  activePanelName = panelName;
  navButtons.forEach(b => b.classList.remove("active"));
  const active = navButtons.find(b => b.dataset.panel === panelName);
  active?.classList.add("active");

  hide(panelResources);
  hide(panelCategories);
  hide(panelOrganizations);
  hide(panelReviewStatus);
  hide(panelRequests);
  hide(panelMail);
  hide(panelAudit);

  if (panelName === "categories") {
    show(panelCategories);
    return;
  }

  if (panelName === "organizations") {
    show(panelOrganizations);
    return;
  }

  if (panelName === "review-status") {
    show(panelReviewStatus);
    void loadReviewStatus();
    return;
  }

  if (panelName === "requests") {
    show(panelRequests);
    return;
  }

  if (panelName === "mail") {
    show(panelMail);
    return;
  }

  if (panelName === "audit") {
    show(panelAudit);
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

async function loadResources(options = {}) {
  const {
    preserveEditorId = null,
    preserveScrollTop = null
  } = options;

  if (!preserveEditorId) {
    hide(resourceEditor);
    editingResourceId = null;
    editingResourceData = null;
  }

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

    if (preserveEditorId) {
      const refreshedResource = resources.find(item => item.id === preserveEditorId);
      if (refreshedResource) {
        openResourceEditor(refreshedResource.id, refreshedResource);
      } else {
        hide(resourceEditor);
        editingResourceId = null;
        editingResourceData = null;
      }
    }

    if (typeof preserveScrollTop === "number" && resourceList) {
      resourceList.scrollTop = preserveScrollTop;
    }
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
    const row = createEl("div", {
      className: `list-row list-row-stacked${r.id === editingResourceId ? " selected" : ""}`,
      attrs: { "data-resource-id": r.id }
    });
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
  clearResourceSaveStatus();
  editingResourceId = docId;
  editingResourceData = data ? { ...data } : {};
  editorTitle.textContent = "Edit Resource";
  buildResourceForm(data || {});
  show(resourceEditor);
}

addResourceBtn?.addEventListener("click", () => {
  clearResourceSaveStatus();
  editingResourceId = null;
  editingResourceData = {};
  editorTitle.textContent = "Add New Resource";
  buildResourceForm({});
  show(resourceEditor);
});

cancelResourceBtn?.addEventListener("click", () => {
  clearResourceSaveStatus();
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

function getFormFieldInput(formEl, fieldName) {
  return formEl?.querySelector(`.field-group[data-field="${fieldName}"] input`) || null;
}

function getFormFieldValue(formEl, fieldName) {
  return normalizeString(getFormFieldInput(formEl, fieldName)?.value);
}

function setFormFieldValue(formEl, fieldName, value) {
  const input = formEl?.querySelector(`.field-group[data-field="${fieldName}"] input, .field-group[data-field="${fieldName}"] select`) || null;
  if (input) {
    input.value = normalizeString(value);
  }
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

function buildGeocodeQueries(formEl) {
  const address = getFormFieldValue(formEl, "Address");
  const city = getFormFieldValue(formEl, "City");
  const zip = getFormFieldValue(formEl, "Zip");
  const simplifiedAddress = stripAddressUnitDetails(address);

  const variants = [
    [address, city, zip, "Nevada", "USA"],
    [simplifiedAddress, city, zip, "Nevada", "USA"],
    [address, city, "Nevada", "USA"],
    [simplifiedAddress, city, "Nevada", "USA"],
    [address, zip, "Nevada", "USA"],
    [simplifiedAddress, zip, "Nevada", "USA"]
  ];

  return Array.from(new Set(
    variants
      .map(parts => parts.filter(Boolean).join(", "))
      .map(query => normalizeString(query))
      .filter(Boolean)
  ));
}

function buildGeocodeHelper(formEl) {
  const wrap = createEl("div", { className: "field-group field-meta-group geocode-helper-group" });
  const label = createEl("label", { className: "field-label", text: "Map Coordinates" });
  const actions = createEl("div", { className: "geocode-helper-actions" });
  const button = createEl("button", {
    className: "field-list-add-btn",
    text: "Geocode Address",
    attrs: { type: "button" }
  });
  const status = createEl("div", {
    className: "field-meta-value geocode-helper-status",
    text: "Look up coordinates from the current address, city, and zip."
  });

  button.addEventListener("click", async () => {
    const queries = buildGeocodeQueries(formEl);
    if (!queries.length) {
      status.textContent = "Enter at least an address, city, or zip before geocoding.";
      return;
    }

    button.disabled = true;
    status.textContent = "Looking up coordinates...";

    try {
      let best = null;
      let matchedQuery = "";

      for (const queryText of queries) {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("format", "jsonv2");
        url.searchParams.set("limit", "1");
        url.searchParams.set("countrycodes", "us");
        url.searchParams.set("q", queryText);

        const response = await fetch(url.toString(), {
          headers: { Accept: "application/json" }
        });
        if (!response.ok) {
          throw new Error(`Geocoder returned ${response.status}.`);
        }

        const results = await response.json();
        best = Array.isArray(results) ? results[0] : null;
        if (best?.lat && best?.lon) {
          matchedQuery = queryText;
          break;
        }
      }

      if (!best?.lat || !best?.lon) {
        status.textContent = "No coordinates found for that address. Adjust the address and try again.";
        return;
      }

      const latitude = Number.parseFloat(best.lat);
      const longitude = Number.parseFloat(best.lon);
      setFormFieldValue(formEl, "Latitude", Number.isFinite(latitude) ? latitude.toFixed(6) : best.lat);
      setFormFieldValue(formEl, "Longitude", Number.isFinite(longitude) ? longitude.toFixed(6) : best.lon);
      status.textContent = `Coordinates found using "${matchedQuery}": ${best.display_name || `${best.lat}, ${best.lon}`}`;
    } catch (error) {
      console.error("Geocode lookup failed:", error);
      status.textContent = `Geocode lookup failed: ${normalizeString(error?.message || String(error))}`;
    } finally {
      button.disabled = false;
    }
  });

  actions.appendChild(button);
  wrap.appendChild(label);
  wrap.appendChild(actions);
  wrap.appendChild(status);
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

function buildFieldBooleanSelect(fieldKey, label, value = true, trueLabel = "Yes", falseLabel = "No") {
  return buildFieldSelect(
    fieldKey,
    label,
    normalizeMapIncludeValue(value, true) ? "true" : "false",
    [
      { value: "true", label: trueLabel },
      { value: "false", label: falseLabel }
    ],
    "Select an option"
  );
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

  const lbl = createEl("div", { className: "field-label", text: "Categories and Subcategories" });
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

  resourceForm.appendChild(buildFieldText("Organization", "Resource", data.Organization || "", true));
  resourceForm.appendChild(buildFieldSelect(
    "organizationId",
    "Owning Organization",
    data.organizationId || "",
    organizationOptions,
    organizationOptions.length ? "Select organization owner" : "No organizations available"
  ));
  resourceForm.appendChild(buildFieldRichText(
    "Description",
    "Short Description",
    data.Description || "",
    data.DescriptionDelta || null
  ));
  resourceForm.appendChild(buildFieldRichText(
    "Notes",
    "Detailed Description",
    data.Notes || "",
    data.NotesDelta || null
  ));

  resourceForm.appendChild(buildNestedCategorySelector(data.Categories, data.Subcategories));

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
  resourceForm.appendChild(buildFieldText("Latitude", "Latitude", data.Latitude ?? "", false));
  resourceForm.appendChild(buildFieldText("Longitude", "Longitude", data.Longitude ?? "", false));
  resourceForm.appendChild(buildFieldBooleanSelect("IncludeInMap", "Include in Map", data.IncludeInMap ?? true, "Include", "Don't Include"));
  resourceForm.appendChild(buildGeocodeHelper(resourceForm));
  resourceForm.appendChild(buildFieldText("Hours", "Hours", data.Hours || "", false));
  resourceForm.appendChild(buildFieldText("Eligibility", "Eligibility", data.Eligibility || "", false));
  resourceForm.appendChild(buildFieldText("Cost", "Cost", data.Cost || "", false));
  resourceForm.appendChild(buildFieldText("Languages", "Languages", data.Languages || "", false));
  resourceForm.appendChild(buildFieldText("Keywords", "Keywords", data.Keywords || "", false));
  resourceForm.appendChild(buildFieldDate("Last Verified", "Last Verified", data["Last Verified"] || ""));
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
  resourceForm.appendChild(buildFieldText("UpdatedBy", "Updated By", data.UpdatedBy || "", false));

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
    if (field === "IncludeInMap") {
      payload[field] = normalizeMapIncludeValue(input?.value, true);
      continue;
    }
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
    const preserveScrollTop = resourceList?.scrollTop ?? 0;
    let savedResourceId = editingResourceId;

    if (editingResourceId) {
      const previousData = editingResourceData ? { ...editingResourceData } : {};
      await updateDoc(doc(db, "resources", editingResourceId), payload);
      await logAuditEvent({
        area: "directory",
        action: "resource.updated",
        entityType: "resource",
        entityId: editingResourceId,
        entityLabel: normalizeString(payload.Organization) || normalizeString(previousData.Organization),
        organizationId: normalizeString(payload.organizationId),
        relatedResourceId: editingResourceId,
        summary: `Updated resource ${normalizeString(payload.Organization) || normalizeString(previousData.Organization) || editingResourceId}`,
        details: {
          changedFields: getChangedFieldNames(previousData, payload, Object.keys(payload))
        }
      });
    } else {
      const createdRef = await addDoc(collection(db, "resources"), payload);
      savedResourceId = createdRef.id;
      await logAuditEvent({
        area: "directory",
        action: "resource.created",
        entityType: "resource",
        entityId: createdRef.id,
        entityLabel: normalizeString(payload.Organization),
        organizationId: normalizeString(payload.organizationId),
        relatedResourceId: createdRef.id,
        summary: `Created resource ${normalizeString(payload.Organization) || createdRef.id}`,
        details: {
          status: normalizeString(payload.status),
          submissionState: normalizeString(payload.submissionState)
        }
      });
    }
    await loadResources({
      preserveEditorId: savedResourceId,
      preserveScrollTop
    });
    showResourceSaveStatus(isNew ? "Resource created" : "Resource saved");
    await loadReviewStatus({ preserveEditor: true });
    await loadAuditLogs();
  } catch (err) {
    console.error("Error saving resource:", err);
    alert("Error saving resource. See console for details.");
  }
});

deleteResourceBtn?.addEventListener("click", async () => {
  if (!editingResourceId) return;
  if (!confirm("Delete this resource?")) return;

  try {
    const previousData = editingResourceData ? { ...editingResourceData } : {};
    await deleteDoc(doc(db, "resources", editingResourceId));
    await logAuditEvent({
      area: "directory",
      action: "resource.deleted",
      entityType: "resource",
      entityId: editingResourceId,
      entityLabel: normalizeString(previousData.Organization),
      organizationId: normalizeString(previousData.organizationId),
      relatedResourceId: editingResourceId,
      summary: `Deleted resource ${normalizeString(previousData.Organization) || editingResourceId}`,
      details: {}
    });
    hide(resourceEditor);
    await loadResources();
    await loadReviewStatus({ preserveEditor: true });
    await loadAuditLogs();
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
    populateReviewOrganizationFilter();
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
  hide(inviteEditor);
  editingInviteId = null;
  inviteEmailInput.disabled = false;
  refreshOrganizationInviteSection();
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
  hide(inviteEditor);
  editingInviteId = null;
  inviteEmailInput.disabled = false;
  refreshOrganizationInviteSection();
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
      const previousOrg = organizationMeta.find(org => org.id === editingOrganizationId) || {};
      await updateDoc(doc(db, "organizations", editingOrganizationId), payload);
      await logAuditEvent({
        area: "access",
        action: "organization.updated",
        entityType: "organization",
        entityId: editingOrganizationId,
        entityLabel: normalizeString(payload.name) || normalizeString(previousOrg.name),
        organizationId: editingOrganizationId,
        summary: `Updated organization ${normalizeString(payload.name) || editingOrganizationId}`,
        details: {
          changedFields: getChangedFieldNames(previousOrg, payload, ["name", "status", "primaryEmail", "phone", "website", "notes"])
        }
      });
    } else {
      payload.createdAt = serverTimestamp();
      payload.createdBy = actor.uid;
      payload.createdByEmail = actor.email;
      const createdRef = await addDoc(collection(db, "organizations"), payload);
      await logAuditEvent({
        area: "access",
        action: "organization.created",
        entityType: "organization",
        entityId: createdRef.id,
        entityLabel: normalizeString(payload.name),
        organizationId: createdRef.id,
        summary: `Created organization ${normalizeString(payload.name) || createdRef.id}`,
        details: {
          status: normalizeString(payload.status),
          primaryEmail: normalizeString(payload.primaryEmail)
        }
      });
    }

    hide(organizationEditor);
    await loadOrganizations();
    await loadResources();
    await loadMemberships();
    await loadInvites();
    await loadReviewRequests();
    await loadAuditLogs();
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
  const attachedInvites = inviteMeta.filter(item => normalizeString(item.organizationId) === editingOrganizationId && normalizeInviteStatus(item.status) !== "revoked");
  if (attachedInvites.length > 0) {
    alert(`Cannot delete this organization while ${attachedInvites.length} invite record(s) still reference it.`);
    return;
  }

  if (!confirm("Delete this organization?")) return;

  try {
    const previousOrg = organizationMeta.find(org => org.id === editingOrganizationId) || {};
    await deleteDoc(doc(db, "organizations", editingOrganizationId));
    await logAuditEvent({
      area: "access",
      action: "organization.deleted",
      entityType: "organization",
      entityId: editingOrganizationId,
      entityLabel: normalizeString(previousOrg.name),
      organizationId: editingOrganizationId,
      summary: `Deleted organization ${normalizeString(previousOrg.name) || editingOrganizationId}`,
      details: {}
    });
    hide(organizationEditor);
    await loadOrganizations();
    await loadResources();
    await loadMemberships();
    await loadInvites();
    await loadReviewRequests();
    await loadAuditLogs();
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

async function loadInvites() {
  if (!inviteList) return;

  hide(inviteEditor);
  editingInviteId = null;
  inviteList.textContent = editingOrganizationId ? "Loading..." : "";
  inviteMeta = [];

  try {
    const snap = await getDocs(collection(db, "editor_invites"));
    const invites = [];

    snap.forEach(ds => {
      const data = ds.data() || {};
      invites.push({
        id: ds.id,
        email: normalizeString(data.email),
        organizationId: normalizeString(data.organizationId),
        role: normalizeString(data.role) || "org_editor",
        customMessage: normalizeString(data.customMessage),
        notes: normalizeString(data.notes),
        status: normalizeInviteStatus(data.status),
        firebaseUid: normalizeString(data.firebaseUid),
        setupLink: normalizeString(data.setupLink),
        error: normalizeString(data.error),
        sentAt: data.sentAt || null,
        acceptedAt: data.acceptedAt || null,
        createdAt: data.createdAt || null,
        updatedAt: data.updatedAt || null
      });
    });

    invites.sort((a, b) => {
      const aTime = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
      const bTime = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
      return bTime - aTime;
    });

    inviteMeta = invites;
    refreshOrganizationInviteSection();
  } catch (err) {
    console.error("Error loading invites:", err);
    inviteList.textContent = "Error loading invites.";
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

function renderInviteList(invites) {
  clearChildren(inviteList);

  if (!invites.length) {
    inviteList.textContent = "No invites yet.";
    return;
  }

  invites.forEach(invite => {
    const row = createEl("div", { className: "list-row list-row-stacked" });
    row.appendChild(createEl("div", {
      className: "list-row-title",
      text: normalizeString(invite.email) || "(Unnamed invite)"
    }));
    row.appendChild(createEl("div", {
      className: "list-row-meta",
      text: getInviteSummary(invite)
    }));
    row.appendChild(createEl("span", {
      className: `request-status-pill mail-status-pill ${normalizeInviteStatus(invite.status)}`,
      text: getInviteStatusLabel(invite.status)
    }));
    row.addEventListener("click", () => openInviteEditor(invite));
    inviteList.appendChild(row);
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
  if (deleteMembershipUserBtn) deleteMembershipUserBtn.disabled = !editingMembershipId;

  show(membershipEditor);
}

function renderInviteMeta(invite) {
  clearChildren(inviteMetaFields);

  if (!invite) return;

  inviteMetaFields.appendChild(buildReadOnlyMetaField("Status", getInviteStatusLabel(invite.status)));
  inviteMetaFields.appendChild(buildReadOnlyMetaField("Firebase UID", normalizeString(invite.firebaseUid) || "-"));
  inviteMetaFields.appendChild(buildReadOnlyMetaField("Sent", formatTimestampValue(invite.sentAt)));
  inviteMetaFields.appendChild(buildReadOnlyMetaField("Accepted", formatTimestampValue(invite.acceptedAt)));
  inviteMetaFields.appendChild(buildReadOnlyMetaField("Last Error", normalizeString(invite.error) || "-"));
}

function openInviteEditor(invite) {
  if (!editingOrganizationId) {
    alert("Save the organization first, then create editor invites.");
    return;
  }

  editingInviteId = invite?.id || null;
  inviteEditorTitle.textContent = editingInviteId ? "Edit Editor Invite" : "Create Editor Invite";
  inviteEmailInput.value = normalizeString(invite?.email);
  inviteRoleSelect.value = normalizeString(invite?.role) || "org_editor";
  inviteCustomMessageInput.value = normalizeString(invite?.customMessage);
  inviteNotesInput.value = normalizeString(invite?.notes);
  inviteEmailInput.disabled = Boolean(editingInviteId);

  const status = normalizeInviteStatus(invite?.status);
  retryInviteBtn.disabled = !editingInviteId || !["failed", "revoked"].includes(status);
  revokeInviteBtn.disabled = !editingInviteId || ["accepted", "revoked"].includes(status);
  deleteInviteBtn.disabled = !editingInviteId;

  renderInviteMeta(invite || null);
  show(inviteEditor);
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

function collectInvitePayload() {
  return {
    email: normalizeString(inviteEmailInput.value).toLowerCase(),
    organizationId: normalizeString(editingOrganizationId),
    role: normalizeString(inviteRoleSelect.value) || "org_editor",
    customMessage: normalizeString(inviteCustomMessageInput.value),
    notes: normalizeString(inviteNotesInput.value)
  };
}

async function queueAuthUserDeletion(membership) {
  const actor = getCurrentActorMetadata();
  const cleanupRef = await addDoc(collection(db, "auth_user_actions"), {
    action: "delete_user",
    status: "pending",
    uid: normalizeString(membership.uid || membership.id),
    email: normalizeString(membership.email).toLowerCase(),
    organizationId: normalizeString(membership.organizationId),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: actor.uid,
    createdByEmail: actor.email,
    error: ""
  });

  await logAuditEvent({
    area: "access",
    action: "membership.auth_delete_queued",
    entityType: "auth_user_action",
    entityId: cleanupRef.id,
    entityLabel: normalizeString(membership.email) || normalizeString(membership.uid) || cleanupRef.id,
    organizationId: normalizeString(membership.organizationId),
    summary: `Queued Firebase Auth deletion for ${normalizeString(membership.email) || normalizeString(membership.uid)}`,
    details: {
      uid: normalizeString(membership.uid || membership.id),
      email: normalizeString(membership.email)
    }
  });
}

addMembershipBtn?.addEventListener("click", () => {
  openMembershipEditor(null);
});

cancelMembershipBtn?.addEventListener("click", () => {
  hide(membershipEditor);
  editingMembershipId = null;
  membershipUidInput.disabled = false;
  if (deleteMembershipUserBtn) deleteMembershipUserBtn.disabled = true;
});

addInviteBtn?.addEventListener("click", () => {
  openInviteEditor(null);
});

cancelInviteBtn?.addEventListener("click", () => {
  hide(inviteEditor);
  editingInviteId = null;
  inviteEmailInput.disabled = false;
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
      const previousMembership = membershipMeta.find(item => item.id === editingMembershipId) || {};
      await updateDoc(doc(db, "organization_members", editingMembershipId), payload);
      await logAuditEvent({
        area: "access",
        action: "membership.updated",
        entityType: "membership",
        entityId: editingMembershipId,
        entityLabel: normalizeString(payload.email) || payload.uid,
        organizationId: normalizeString(payload.organizationId),
        summary: `Updated editor access for ${normalizeString(payload.email) || payload.uid}`,
        details: {
          changedFields: getChangedFieldNames(previousMembership, payload, ["email", "organizationId", "role", "status", "notes"])
        }
      });
    } else {
      payload.createdAt = serverTimestamp();
      payload.createdBy = actor.uid;
      payload.createdByEmail = actor.email;
      await setDoc(doc(db, "organization_members", payload.uid), payload);
      await logAuditEvent({
        area: "access",
        action: "membership.created",
        entityType: "membership",
        entityId: payload.uid,
        entityLabel: normalizeString(payload.email) || payload.uid,
        organizationId: normalizeString(payload.organizationId),
        summary: `Granted editor access to ${normalizeString(payload.email) || payload.uid}`,
        details: {
          role: normalizeString(payload.role),
          status: normalizeString(payload.status)
        }
      });
    }

    hide(membershipEditor);
    editingMembershipId = null;
    membershipUidInput.disabled = false;
    if (deleteMembershipUserBtn) deleteMembershipUserBtn.disabled = true;
    await loadMemberships();
    await loadAuditLogs();
  } catch (err) {
    console.error("Error saving membership:", err);
    alert("Error saving organization access. See console for details.");
  }
});

deleteMembershipBtn?.addEventListener("click", async () => {
  if (!editingMembershipId) return;
  if (!confirm("Delete this organization access record?")) return;

  try {
    const previousMembership = membershipMeta.find(item => item.id === editingMembershipId) || {};
    await deleteDoc(doc(db, "organization_members", editingMembershipId));
    await logAuditEvent({
      area: "access",
      action: "membership.deleted",
      entityType: "membership",
      entityId: editingMembershipId,
      entityLabel: normalizeString(previousMembership.email) || editingMembershipId,
      organizationId: normalizeString(previousMembership.organizationId),
      summary: `Deleted editor access for ${normalizeString(previousMembership.email) || editingMembershipId}`,
      details: {}
    });
    hide(membershipEditor);
    editingMembershipId = null;
    membershipUidInput.disabled = false;
    if (deleteMembershipUserBtn) deleteMembershipUserBtn.disabled = true;
    await loadMemberships();
    await loadAuditLogs();
  } catch (err) {
    console.error("Error deleting membership:", err);
    alert("Error deleting organization access. See console for details.");
  }
});

deleteMembershipUserBtn?.addEventListener("click", async () => {
  if (!editingMembershipId) return;

  const previousMembership = membershipMeta.find(item => item.id === editingMembershipId) || {};
  const targetLabel = normalizeString(previousMembership.email) || normalizeString(previousMembership.uid) || editingMembershipId;
  if (!confirm(`Delete this organization access record and permanently delete the Firebase user for ${targetLabel}?`)) return;

  try {
    try {
      await queueAuthUserDeletion(previousMembership);
    } catch (err) {
      console.error("Failed to queue Firebase Auth deletion action:", err);
      alert("Could not queue the Firebase user deletion action. This usually means the live Firestore rules do not yet allow admin access to auth_user_actions.");
      return;
    }

    try {
      await deleteDoc(doc(db, "organization_members", editingMembershipId));
    } catch (err) {
      console.error("Failed to delete organization membership record:", err);
      alert("The Firebase user deletion was queued, but deleting the organization membership record failed. See console for details.");
      return;
    }

    await logAuditEvent({
      area: "access",
      action: "membership.deleted",
      entityType: "membership",
      entityId: editingMembershipId,
      entityLabel: targetLabel,
      organizationId: normalizeString(previousMembership.organizationId),
      summary: `Deleted editor access for ${targetLabel}`,
      details: {
        deleteFirebaseUser: true
      }
    });
    hide(membershipEditor);
    editingMembershipId = null;
    membershipUidInput.disabled = false;
    if (deleteMembershipUserBtn) deleteMembershipUserBtn.disabled = true;
    await loadMemberships();
    await loadAuditLogs();
  } catch (err) {
    console.error("Error deleting editor and Firebase user:", err);
    alert("Error deleting editor and Firebase user. See console for details.");
  }
});

saveInviteBtn?.addEventListener("click", async () => {
  const payload = collectInvitePayload();
  if (!editingOrganizationId) {
    alert("Save the organization first, then create editor invites.");
    return;
  }
  if (!payload.email) {
    alert("Invite email is required.");
    return;
  }

  const duplicatePending = inviteMeta.find(invite =>
    invite.id !== editingInviteId &&
    normalizeString(invite.organizationId) === payload.organizationId &&
    normalizeString(invite.email).toLowerCase() === payload.email &&
    !["revoked"].includes(normalizeInviteStatus(invite.status))
  );

  if (duplicatePending) {
    alert("An active invite already exists for that email on this organization.");
    return;
  }

  const actor = getCurrentActorMetadata();
  const isNew = !editingInviteId;
  const basePayload = {
    ...payload,
    updatedAt: serverTimestamp(),
    updatedBy: actor.uid,
    updatedByEmail: actor.email
  };

  try {
    if (editingInviteId) {
      const existingInvite = inviteMeta.find(item => item.id === editingInviteId) || {};
      await updateDoc(doc(db, "editor_invites", editingInviteId), {
        ...basePayload,
        status: ["accepted", "sent", "processing"].includes(normalizeInviteStatus(existingInvite.status))
          ? normalizeInviteStatus(existingInvite.status)
          : "pending",
        error: ""
      });
      await logAuditEvent({
        area: "access",
        action: "invite.updated",
        entityType: "editor_invite",
        entityId: editingInviteId,
        entityLabel: payload.email,
        organizationId: payload.organizationId,
        summary: `Updated invite for ${payload.email}`,
        details: {
          changedFields: getChangedFieldNames(existingInvite, payload, ["role", "customMessage", "notes"])
        }
      });
    } else {
      const createdRef = await addDoc(collection(db, "editor_invites"), {
        ...basePayload,
        status: "pending",
        firebaseUid: "",
        setupLink: "",
        error: "",
        sentAt: null,
        acceptedAt: null,
        createdAt: serverTimestamp(),
        createdBy: actor.uid,
        createdByEmail: actor.email
      });
      await logAuditEvent({
        area: "access",
        action: "invite.created",
        entityType: "editor_invite",
        entityId: createdRef.id,
        entityLabel: payload.email,
        organizationId: payload.organizationId,
        summary: `Created invite for ${payload.email}`,
        details: {
          role: payload.role
        }
      });
    }

    hide(inviteEditor);
    editingInviteId = null;
    inviteEmailInput.disabled = false;
    await loadInvites();
    await loadAuditLogs();
  } catch (err) {
    console.error("Error saving invite:", err);
    alert("Error saving editor invite. See console for details.");
  }
});

retryInviteBtn?.addEventListener("click", async () => {
  if (!editingInviteId) return;
  const invite = inviteMeta.find(item => item.id === editingInviteId);
  if (!invite) return;

  try {
    await updateDoc(doc(db, "editor_invites", editingInviteId), {
      status: "pending",
      error: "",
      updatedAt: serverTimestamp()
    });
    await logAuditEvent({
      area: "access",
      action: "invite.requeued",
      entityType: "editor_invite",
      entityId: editingInviteId,
      entityLabel: normalizeString(invite.email),
      organizationId: normalizeString(invite.organizationId),
      summary: `Requeued invite for ${normalizeString(invite.email) || editingInviteId}`,
      details: {}
    });
    await loadInvites();
    await loadAuditLogs();
  } catch (err) {
    console.error("Error retrying invite:", err);
    alert("Error retrying invite. See console for details.");
  }
});

revokeInviteBtn?.addEventListener("click", async () => {
  if (!editingInviteId) return;
  const invite = inviteMeta.find(item => item.id === editingInviteId);
  if (!invite) return;
  if (!confirm("Revoke this invite?")) return;

  try {
    await updateDoc(doc(db, "editor_invites", editingInviteId), {
      status: "revoked",
      updatedAt: serverTimestamp()
    });
    await logAuditEvent({
      area: "access",
      action: "invite.revoked",
      entityType: "editor_invite",
      entityId: editingInviteId,
      entityLabel: normalizeString(invite.email),
      organizationId: normalizeString(invite.organizationId),
      summary: `Revoked invite for ${normalizeString(invite.email) || editingInviteId}`,
      details: {}
    });
    await loadInvites();
    await loadAuditLogs();
  } catch (err) {
    console.error("Error revoking invite:", err);
    alert("Error revoking invite. See console for details.");
  }
});

deleteInviteBtn?.addEventListener("click", async () => {
  if (!editingInviteId) return;
  const invite = inviteMeta.find(item => item.id === editingInviteId);
  if (!invite) return;
  if (!confirm("Delete this invite?")) return;

  try {
    await deleteDoc(doc(db, "editor_invites", editingInviteId));
    await logAuditEvent({
      area: "access",
      action: "invite.deleted",
      entityType: "editor_invite",
      entityId: editingInviteId,
      entityLabel: normalizeString(invite.email),
      organizationId: normalizeString(invite.organizationId),
      summary: `Deleted invite for ${normalizeString(invite.email) || editingInviteId}`,
      details: {}
    });
    hide(inviteEditor);
    editingInviteId = null;
    inviteEmailInput.disabled = false;
    await loadInvites();
    await loadAuditLogs();
  } catch (err) {
    console.error("Error deleting invite:", err);
    alert("Error deleting invite. See console for details.");
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

async function loadMailQueue(options = {}) {
  if (!mailList) return;
  if (mailLoadInFlight) return;

  const { preserveEditor = true } = options;
  const openMailId = editingMailId;
  const shouldRestoreEditor = preserveEditor && !!openMailId;

  mailLoadInFlight = true;

  if (!shouldRestoreEditor) {
    hide(mailEditor);
    editingMailId = null;
  }
  mailList.textContent = "Loading...";
  mailMeta = [];

  try {
    const snap = await getDocs(collection(db, "mail_queue"));
    const messages = [];

    snap.forEach(ds => {
      messages.push({
        id: ds.id,
        ...ds.data()
      });
    });

    messages.sort((a, b) => {
      const statusRank = value => {
        const status = normalizeMailStatus(value);
        if (status === "queued") return 0;
        if (status === "processing") return 1;
        if (status === "failed") return 2;
        return 3;
      };
      const rankDelta = statusRank(a.status) - statusRank(b.status);
      if (rankDelta !== 0) return rankDelta;

      const aTime = a.updatedAt?.seconds || a.createdAt?.seconds || 0;
      const bTime = b.updatedAt?.seconds || b.createdAt?.seconds || 0;
      return bTime - aTime;
    });

    mailMeta = messages;
    selectedMailIds = new Set(
      Array.from(selectedMailIds).filter(id => messages.some(mailDoc => mailDoc.id === id))
    );
    updateMailFilterUi();
    updateMailSelectionUi();
    renderMailList(getFilteredMail());

    if (shouldRestoreEditor) {
      const openMail = messages.find(item => item.id === openMailId);
      if (openMail) {
        openMailEditor(openMail);
      } else {
        hide(mailEditor);
        editingMailId = null;
      }
    }
  } catch (err) {
    console.error("Error loading mail queue:", err);
    mailList.textContent = "Error loading mail queue.";
  } finally {
    mailLoadInFlight = false;
  }
}

async function loadAuditLogs() {
  if (!auditList) return;

  hide(auditEditor);
  editingAuditId = null;
  auditList.textContent = "Loading...";
  auditMeta = [];

  try {
    const snap = await getDocs(collection(db, "audit_logs"));
    const events = [];
    snap.forEach(ds => {
      events.push({
        id: ds.id,
        ...ds.data()
      });
    });

    events.sort((a, b) => {
      const aTime = a.createdAt?.seconds || 0;
      const bTime = b.createdAt?.seconds || 0;
      return bTime - aTime;
    });

    auditMeta = events;
    updateAuditFilterUi();
    renderAuditList(getFilteredAuditLogs());
  } catch (err) {
    console.error("Error loading audit logs:", err);
    auditList.textContent = "Error loading audit logs.";
  }
}

function isResourcePublished(resource) {
  const status = normalizeString(resource?.status).toLowerCase();
  return !status || status === "published";
}

function buildReviewStatusMeta() {
  return resourceMeta
    .filter(resource => isResourcePublished(resource))
    .map(resource => {
      const anchor = getResourceReviewAnchor(resource);
      const daysSinceReview = getDaysSinceReview(resource);
      const bucket = getReviewStatusBucket(resource);
      const activity = getReviewConfirmationActivity(resource.id);

      return {
        id: resource.id,
        resource,
        resourceName: getResourceDisplayName(resource),
        organizationName: getOrganizationNameById(resource.organizationId) || "(Unknown organization)",
        anchor,
        daysSinceReview,
        bucket,
        latestReminderAt: activity.latestSent || activity.latestAny || null,
        latestConfirmedAt: activity.latestApplied || activity.latestConfirmed || null,
        recipientEmails: activity.recipientEmails,
        sentCount: activity.sentCount,
        confirmedCount: activity.confirmedCount,
        failedCount: activity.failedCount
      };
    })
    .sort((a, b) => {
      const bucketRank = value => {
        if (value === "attention") return 0;
        if (value === "due") return 1;
        return 2;
      };
      const rankDelta = bucketRank(a.bucket) - bucketRank(b.bucket);
      if (rankDelta !== 0) return rankDelta;
      if (a.daysSinceReview !== b.daysSinceReview) return b.daysSinceReview - a.daysSinceReview;
      return a.resourceName.localeCompare(b.resourceName);
    });
}

function getFilteredReviewStatus() {
  return reviewStatusMeta.filter(item => {
    if (activeReviewOrganizationFilter && normalizeString(item.resource.organizationId) !== activeReviewOrganizationFilter) {
      return false;
    }
    if (activeReviewFilter === "attention") return item.bucket === "attention";
    if (activeReviewFilter === "current") return item.bucket === "current";
    return item.bucket === "due" || item.bucket === "attention";
  });
}

function updateReviewFilterUi() {
  const scopedItems = reviewStatusMeta.filter(item =>
    !activeReviewOrganizationFilter || normalizeString(item.resource.organizationId) === activeReviewOrganizationFilter
  );
  const dueCount = scopedItems.filter(item => item.bucket === "due" || item.bucket === "attention").length;
  const attentionCount = scopedItems.filter(item => item.bucket === "attention").length;
  const currentCount = scopedItems.filter(item => item.bucket === "current").length;

  if (reviewFilterDueBtn) {
    reviewFilterDueBtn.textContent = `Due This Quarter (${dueCount})`;
    reviewFilterDueBtn.classList.toggle("active", activeReviewFilter === "due");
  }

  if (reviewFilterAttentionBtn) {
    reviewFilterAttentionBtn.textContent = `Admin Attention (${attentionCount})`;
    reviewFilterAttentionBtn.classList.toggle("active", activeReviewFilter === "attention");
  }

  if (reviewFilterCurrentBtn) {
    reviewFilterCurrentBtn.textContent = `Current (${currentCount})`;
    reviewFilterCurrentBtn.classList.toggle("active", activeReviewFilter === "current");
  }
}

async function loadReviewStatus(options = {}) {
  if (!reviewStatusList) return;

  const { preserveEditor = true } = options;
  const openId = editingReviewStatusId;
  const shouldRestoreEditor = preserveEditor && !!openId;

  if (!shouldRestoreEditor) {
    hide(reviewStatusEditor);
    editingReviewStatusId = null;
  }
  reviewStatusList.textContent = "Loading...";
  reviewConfirmationMeta = [];
  reviewStatusMeta = [];

  try {
    const snap = await getDocs(collection(db, "review_confirmations"));
    const confirmations = [];
    snap.forEach(ds => {
      confirmations.push({
        id: ds.id,
        ...ds.data()
      });
    });

    reviewConfirmationMeta = confirmations;
    reviewStatusMeta = buildReviewStatusMeta();
    updateReviewFilterUi();
    renderReviewStatusList(getFilteredReviewStatus());

    if (shouldRestoreEditor) {
      const openItem = reviewStatusMeta.find(item => item.id === openId);
      if (openItem) {
        openReviewStatusEditor(openItem);
      } else {
        hide(reviewStatusEditor);
        editingReviewStatusId = null;
      }
    }
  } catch (err) {
    console.error("Error loading review status:", err);
    reviewStatusList.textContent = "Error loading review status.";
  }
}

function setActiveReviewFilter(nextFilter) {
  activeReviewFilter = ["attention", "current"].includes(nextFilter) ? nextFilter : "due";
  const openItem = reviewStatusMeta.find(item => item.id === editingReviewStatusId);
  if (openItem && !getFilteredReviewStatus().some(item => item.id === openItem.id)) {
    hide(reviewStatusEditor);
    editingReviewStatusId = null;
  }
  updateReviewFilterUi();
  renderReviewStatusList(getFilteredReviewStatus());
}

function getReviewStatusSummaryText(item) {
  const anchorSource = normalizeString(item.anchor.source) || "No review date";
  const anchorValue = normalizeString(item.anchor.displayValue) || "Unknown";
  const days = Number.isFinite(item.daysSinceReview) ? `${item.daysSinceReview} days` : "Unknown";
  return `${item.organizationName} | ${anchorSource}: ${anchorValue} | ${days}`;
}

function renderReviewStatusList(items) {
  clearChildren(reviewStatusList);

  if (!items.length) {
    reviewStatusList.textContent = activeReviewFilter === "attention"
      ? "No resources currently need admin attention."
      : activeReviewFilter === "current"
        ? "No current published resources were found."
        : "No resources are currently due for quarterly review.";
    return;
  }

  items.forEach(item => {
    const badgeText = item.bucket === "attention"
      ? "needs attention"
      : item.bucket === "current"
        ? "current"
        : "due";
    const badgeClass = item.bucket === "attention"
      ? "rejected"
      : item.bucket === "current"
        ? "approved"
        : "pending";

    const row = createEl("div", { className: "list-row list-row-stacked" });
    row.appendChild(createEl("div", {
      className: "list-row-title",
      text: item.resourceName || "(Unnamed resource)"
    }));
    row.appendChild(createEl("div", {
      className: "list-row-meta",
      text: getReviewStatusSummaryText(item)
    }));
    row.appendChild(createEl("span", {
      className: `request-status-pill ${badgeClass}`,
      text: badgeText
    }));
    row.addEventListener("click", () => openReviewStatusEditor(item));
    reviewStatusList.appendChild(row);
  });
}

function buildReviewStatusMetaBlock(item) {
  const activity = getReviewConfirmationActivity(item.id);
  const block = createEl("div", { className: "request-block" });
  block.appendChild(createEl("h4", { text: "Review Summary" }));

  const metaList = createEl("div", { className: "request-meta-list" });
  const rows = [
    ["Resource", item.resourceName || "(Unnamed resource)"],
    ["Organization", item.organizationName],
    ["Current review source", normalizeString(item.anchor.source) || "(None)"],
    ["Current review value", normalizeString(item.anchor.displayValue) || "(Not set)"],
    ["Days since review", Number.isFinite(item.daysSinceReview) ? String(item.daysSinceReview) : "Unknown"],
    ["Last reminder sent", formatTimestampValue(item.latestReminderAt) || "(None)"],
    ["Last confirmation handled", formatTimestampValue(item.latestConfirmedAt) || "(None)"],
    ["Reminder recipients", activity.recipientEmails.length ? activity.recipientEmails.join(", ") : "(None yet)"],
    ["Outstanding sent confirmations", String(activity.sentCount)],
    ["Confirmed waiting to apply", String(activity.confirmedCount)],
    ["Failed reminder sends", String(activity.failedCount)]
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

function buildReviewStatusGuidanceBlock(item) {
  const block = createEl("div", { className: "request-block" });
  block.appendChild(createEl("h4", { text: item.bucket === "attention" ? "Admin Attention" : "Next Steps" }));

  const guidance = item.bucket === "attention"
    ? "This listing has gone at least one year without a fresh verification. Review the record, consider direct outreach, and decide whether it should remain published."
    : item.bucket === "current"
      ? "This listing is currently within its quarterly review window. You can still send a manual reminder now if you want to prompt the organization early."
      : "This listing is due for its quarterly review cycle. The scheduled mail worker will send reminder emails to the organization primary email and all active org editors.";

  block.appendChild(createEl("div", {
    className: "field-meta-value",
    text: guidance
  }));
  return block;
}

async function sendManualReviewReminder() {
  if (!editingReviewStatusId) return;
  const item = reviewStatusMeta.find(entry => entry.id === editingReviewStatusId);
  if (!item?.resource) return;

  const recipients = getReviewReminderRecipients(item.resource.organizationId);
  if (!recipients.length) {
    alert("This organization has no primary email or active editor email addresses to send reminders to.");
    return;
  }

  const organizationName = getOrganizationNameById(item.resource.organizationId) || item.organizationName;
  const actor = getCurrentActorMetadata();
  const reviewAnchorDate = normalizeString(item.resource["Last Verified"]) || formatDateOnly(item.anchor.date) || "";
  const expiresAt = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000);
  const createdMailIds = [];
  const createdTokens = [];

  try {
    for (const recipient of recipients) {
      const token = generateReviewToken();
      const confirmUrl = `${publicBaseUrl}/review.html?token=${encodeURIComponent(token)}`;

      await setDoc(doc(db, "review_confirmations", token), {
        type: "quarterly_review",
        status: "processing",
        organizationId: normalizeString(item.resource.organizationId),
        organizationName,
        resourceId: normalizeString(item.resource.id),
        resourceName: item.resourceName,
        recipientEmail: normalizeString(recipient.email),
        recipientType: normalizeString(recipient.type) || "organization_editor",
        recipientUid: normalizeString(recipient.uid),
        reviewAnchorSource: normalizeString(item.anchor.source),
        reviewAnchorDate,
        emailBatchId: generateReviewToken(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        sentAt: null,
        confirmedAt: null,
        appliedAt: null,
        expiresAt,
        error: ""
      });
      createdTokens.push(token);

      const mailPayload = buildQuarterlyReminderMailPayload({
        recipientEmail: normalizeString(recipient.email),
        organizationName,
        entries: [{
          resource: item.resource,
          resourceId: normalizeString(item.resource.id),
          resourceName: item.resourceName,
          reviewAnchorDate,
          confirmUrl
        }]
      });
      mailPayload.sourceId = normalizeString(item.resource.id);
      mailPayload.reviewTokenIds = [token];

      const mailRef = await addDoc(collection(db, "mail_queue"), {
        ...mailPayload,
        status: "queued",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      createdMailIds.push(mailRef.id);
    }

    await logAuditEvent({
      area: "mail",
      action: "review.reminder_queued_manual",
      entityType: "resource",
      entityId: normalizeString(item.resource.id),
      entityLabel: item.resourceName,
      organizationId: normalizeString(item.resource.organizationId),
      relatedResourceId: normalizeString(item.resource.id),
      summary: `Queued manual review reminder for ${item.resourceName}`,
      details: {
        recipientCount: recipients.length,
        recipients: recipients.map(recipient => normalizeString(recipient.email)),
        createdMailIds,
        createdReviewTokens: createdTokens
      }
    });

    await loadMailQueue({ preserveEditor: true });
    await loadReviewStatus({ preserveEditor: true });
    await loadAuditLogs();
    alert(`Queued ${recipients.length} review reminder email(s) for ${item.resourceName}.`);
  } catch (err) {
    console.error("Error queuing manual review reminder:", err);
    alert("Error queuing manual review reminder. See console for details.");
  }
}

function openReviewStatusEditor(item) {
  editingReviewStatusId = item?.id || null;
  reviewStatusEditorTitle.textContent = item?.bucket === "attention"
    ? "Review Status - Admin Attention"
    : item?.bucket === "current"
      ? "Review Status - Current"
      : "Review Status - Due This Quarter";

  clearChildren(reviewStatusSummary);
  reviewStatusSummary.appendChild(buildReviewStatusMetaBlock(item));
  reviewStatusSummary.appendChild(buildReviewStatusGuidanceBlock(item));
  if (sendReviewReminderBtn) {
    sendReviewReminderBtn.disabled = !getReviewReminderRecipients(item.resource.organizationId).length;
  }
  show(reviewStatusEditor);
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

function getFilteredMail() {
  return mailMeta.filter(mailDoc => {
    const status = normalizeMailStatus(mailDoc.status);
    if (activeMailFilter === "failed") return status === "failed";
    if (activeMailFilter === "sent") return status === "sent";
    return status === "queued" || status === "processing";
  });
}

function updateMailFilterUi() {
  const tabConfig = [
    { btn: mailFilterQueuedBtn, status: "queued", label: "Queued", matcher: mailDoc => ["queued", "processing"].includes(normalizeMailStatus(mailDoc.status)) },
    { btn: mailFilterSentBtn, status: "sent", label: "Sent", matcher: mailDoc => normalizeMailStatus(mailDoc.status) === "sent" },
    { btn: mailFilterFailedBtn, status: "failed", label: "Failed", matcher: mailDoc => normalizeMailStatus(mailDoc.status) === "failed" }
  ];

  tabConfig.forEach(({ btn, status, label, matcher }) => {
    if (!btn) return;
    const count = mailMeta.filter(matcher).length;
    btn.textContent = `${label} (${count})`;
    btn.classList.toggle("active", activeMailFilter === status);
  });
}

function setActiveMailFilter(nextFilter) {
  activeMailFilter = ["queued", "sent", "failed"].includes(nextFilter) ? nextFilter : "queued";
  if (!["sent", "failed"].includes(activeMailFilter)) {
    selectedMailIds.clear();
  } else {
    selectedMailIds = new Set(
      Array.from(selectedMailIds).filter(id => normalizeMailStatus(mailMeta.find(item => item.id === id)?.status) === activeMailFilter)
    );
  }
  const openMail = mailMeta.find(item => item.id === editingMailId);
  if (openMail) {
    const visible = getFilteredMail().some(item => item.id === openMail.id);
    if (!visible) {
      hide(mailEditor);
      editingMailId = null;
    }
  }
  updateMailFilterUi();
  updateMailSelectionUi();
  renderMailList(getFilteredMail());
}

function getFilteredAuditLogs() {
  if (activeAuditFilter === "all") return auditMeta;
  return auditMeta.filter(eventDoc => normalizeAuditArea(eventDoc.area) === activeAuditFilter);
}

function updateAuditFilterUi() {
  const tabConfig = [
    { btn: auditFilterAllBtn, area: "all", label: "All", matcher: () => true },
    { btn: auditFilterDirectoryBtn, area: "directory", label: "Directory", matcher: eventDoc => normalizeAuditArea(eventDoc.area) === "directory" },
    { btn: auditFilterRequestsBtn, area: "requests", label: "Requests", matcher: eventDoc => normalizeAuditArea(eventDoc.area) === "requests" },
    { btn: auditFilterMailBtn, area: "mail", label: "Mail", matcher: eventDoc => normalizeAuditArea(eventDoc.area) === "mail" },
    { btn: auditFilterAccessBtn, area: "access", label: "Access", matcher: eventDoc => normalizeAuditArea(eventDoc.area) === "access" }
  ];

  tabConfig.forEach(({ btn, area, label, matcher }) => {
    if (!btn) return;
    const count = auditMeta.filter(matcher).length;
    btn.textContent = `${label} (${count})`;
    btn.classList.toggle("active", activeAuditFilter === area);
  });
}

function setActiveAuditFilter(nextFilter) {
  activeAuditFilter = ["all", "directory", "requests", "mail", "access"].includes(nextFilter) ? nextFilter : "all";
  const openEvent = auditMeta.find(item => item.id === editingAuditId);
  if (openEvent && !getFilteredAuditLogs().some(item => item.id === openEvent.id)) {
    hide(auditEditor);
    editingAuditId = null;
  }
  updateAuditFilterUi();
  renderAuditList(getFilteredAuditLogs());
}

function updateMailSelectionUi() {
  if (!mailSelectionCount || !bulkDeleteMailBtn) return;

  const count = selectedMailIds.size;
  mailSelectionCount.textContent = `${count} selected`;
  bulkDeleteMailBtn.disabled = count === 0 || !["sent", "failed"].includes(activeMailFilter);
}

function getMailSummaryText(mailDoc) {
  const status = getMailStatusLabel(mailDoc.status);
  const recipient = normalizeString(mailDoc.to) || "(No recipient)";
  const type = normalizeString(mailDoc.type) || "message";
  const createdAt = formatTimestampValue(mailDoc.createdAt);
  return `${recipient} | ${type} | ${status} | ${createdAt}`;
}

function renderMailList(messages) {
  clearChildren(mailList);

  if (!messages.length) {
    mailList.textContent = `No ${activeMailFilter} mail items found.`;
    return;
  }

  messages.forEach(mailDoc => {
    const canSelect = ["sent", "failed"].includes(activeMailFilter);
    const row = createEl("div", {
      className: `list-row${canSelect ? " request-list-row" : " list-row-stacked"}${selectedMailIds.has(mailDoc.id) ? " selected" : ""}`
    });

    if (canSelect) {
      const checkWrap = createEl("label", { className: "request-row-check" });
      const checkbox = createEl("input", {
        attrs: { type: "checkbox", "aria-label": `Select mail for ${normalizeString(mailDoc.subject) || "message"}` }
      });
      checkbox.checked = selectedMailIds.has(mailDoc.id);
      checkbox.addEventListener("click", event => {
        event.stopPropagation();
      });
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) {
          selectedMailIds.add(mailDoc.id);
        } else {
          selectedMailIds.delete(mailDoc.id);
        }
        updateMailSelectionUi();
        renderMailList(getFilteredMail());
      });
      checkWrap.appendChild(checkbox);
      row.appendChild(checkWrap);
    }

    const content = createEl("div", { className: "request-row-content list-row-stacked" });
    content.appendChild(createEl("div", {
      className: "list-row-title",
      text: normalizeString(mailDoc.subject) || "(No subject)"
    }));
    content.appendChild(createEl("div", {
      className: "list-row-meta",
      text: getMailSummaryText(mailDoc)
    }));
    content.appendChild(createEl("span", {
      className: `request-status-pill mail-status-pill ${normalizeMailStatus(mailDoc.status)}`,
      text: getMailStatusLabel(mailDoc.status)
    }));
    row.appendChild(content);
    row.addEventListener("click", () => openMailEditor(mailDoc));
    mailList.appendChild(row);
  });
}

function getAuditSummaryText(eventDoc) {
  const area = getAuditAreaLabel(eventDoc.area);
  const actorEmail = normalizeString(eventDoc.actorEmail) || normalizeString(eventDoc.actorType) || "unknown";
  const when = formatTimestampValue(eventDoc.createdAt);
  return `${area} | ${actorEmail} | ${when}`;
}

function renderAuditList(events) {
  clearChildren(auditList);

  if (!events.length) {
    auditList.textContent = `No ${activeAuditFilter === "all" ? "" : activeAuditFilter + " "}audit events found.`.trim();
    return;
  }

  events.forEach(eventDoc => {
    const row = createEl("div", { className: "list-row list-row-stacked" });
    row.appendChild(createEl("div", {
      className: "list-row-title",
      text: normalizeString(eventDoc.summary) || normalizeString(eventDoc.action) || "(Audit event)"
    }));
    row.appendChild(createEl("div", {
      className: "list-row-meta",
      text: getAuditSummaryText(eventDoc)
    }));
    row.addEventListener("click", () => openAuditEditor(eventDoc));
    auditList.appendChild(row);
  });
}

function buildMailMetaBlock(mailDoc) {
  const block = createEl("div", { className: "request-block" });
  block.appendChild(createEl("h4", { text: "Mail Summary" }));

  const metaList = createEl("div", { className: "request-meta-list" });
  const rows = [
    ["Mail Queue ID", normalizeString(mailDoc.id) || "(None)"],
    ["To", normalizeString(mailDoc.to) || "(None)"],
    ["Subject", normalizeString(mailDoc.subject) || "(None)"],
    ["Status", getMailStatusLabel(mailDoc.status)],
    ["Type", normalizeString(mailDoc.type) || "(None)"],
    ["Created", formatTimestampValue(mailDoc.createdAt)],
    ["Updated", formatTimestampValue(mailDoc.updatedAt)],
    ["Sent", formatTimestampValue(mailDoc.sentAt)],
    ["Source", normalizeString(mailDoc.sourceCollection) && normalizeString(mailDoc.sourceId)
      ? `${normalizeString(mailDoc.sourceCollection)} / ${normalizeString(mailDoc.sourceId)}`
      : "(None)"],
    ["Transport Id", normalizeString(mailDoc.transportMessageId) || "(None)"],
    ["Error", normalizeString(mailDoc.error) || "(None)"]
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

function buildAuditMetaBlock(eventDoc) {
  const block = createEl("div", { className: "request-block" });
  block.appendChild(createEl("h4", { text: "Audit Summary" }));

  const metaList = createEl("div", { className: "request-meta-list" });
  const rows = [
    ["Audit ID", normalizeString(eventDoc.id) || "(None)"],
    ["Summary", normalizeString(eventDoc.summary) || "(None)"],
    ["Action", normalizeString(eventDoc.action) || "(None)"],
    ["Area", getAuditAreaLabel(eventDoc.area)],
    ["Entity", normalizeString(eventDoc.entityType) && normalizeString(eventDoc.entityId)
      ? `${normalizeString(eventDoc.entityType)} / ${normalizeString(eventDoc.entityId)}`
      : normalizeString(eventDoc.entityType) || "(None)"],
    ["Entity Label", normalizeString(eventDoc.entityLabel) || "(None)"],
    ["Actor", normalizeString(eventDoc.actorEmail) || normalizeString(eventDoc.actorType) || "(Unknown)"],
    ["Source", normalizeString(eventDoc.source) || "(None)"],
    ["Organization", getOrganizationNameById(eventDoc.organizationId) || normalizeString(eventDoc.organizationId) || "(None)"],
    ["Resource ID", normalizeString(eventDoc.relatedResourceId) || "(None)"],
    ["Request ID", normalizeString(eventDoc.relatedRequestId) || "(None)"],
    ["Mail Queue ID", normalizeString(eventDoc.relatedMailId) || "(None)"],
    ["Created", formatTimestampValue(eventDoc.createdAt)]
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

function openMailEditor(mailDoc) {
  editingMailId = mailDoc?.id || null;
  mailEditorTitle.textContent = "Mail Message";
  clearChildren(mailSummary);
  clearChildren(mailHtmlPreview);
  mailTextPreview.textContent = normalizeString(mailDoc?.text) || "(No plain-text body)";

  mailSummary.appendChild(buildMailMetaBlock(mailDoc));

  const htmlBody = normalizeString(mailDoc?.html);
  if (htmlBody) {
    appendSafeHtml(mailHtmlPreview, htmlBody);
  } else {
    mailHtmlPreview.appendChild(createEl("div", {
      className: "request-value empty",
      text: "(No HTML body)"
    }));
  }

  const status = normalizeMailStatus(mailDoc?.status);
  retryMailBtn.disabled = status === "processing";
  const requestDoc = getMailSourceRequest(mailDoc);
  const resourceDoc = getMailSourceResource(mailDoc);
  if (openMailRequestBtn) openMailRequestBtn.disabled = !requestDoc;
  if (openMailResourceBtn) openMailResourceBtn.disabled = !resourceDoc;

  show(mailEditor);
}

function openAuditEditor(eventDoc) {
  editingAuditId = eventDoc?.id || null;
  auditEditorTitle.textContent = "Audit Event";
  clearChildren(auditSummary);
  auditDetails.textContent = formatJsonBlock(eventDoc?.details || {});
  auditSummary.appendChild(buildAuditMetaBlock(eventDoc));
  show(auditEditor);
}

function getMailSourceRequest(mailDoc) {
  if (!mailDoc) return null;
  if (normalizeString(mailDoc.sourceCollection) === "resource_change_requests" && normalizeString(mailDoc.sourceId)) {
    return requestMeta.find(item => item.id === normalizeString(mailDoc.sourceId)) || null;
  }
  return null;
}

function getMailSourceResource(mailDoc) {
  const requestDoc = getMailSourceRequest(mailDoc);
  if (requestDoc?.resourceId) {
    return resourceMeta.find(item => item.id === normalizeString(requestDoc.resourceId)) || null;
  }
  if (normalizeString(mailDoc.sourceCollection) === "resources" && normalizeString(mailDoc.sourceId)) {
    return resourceMeta.find(item => item.id === normalizeString(mailDoc.sourceId)) || null;
  }
  return null;
}

async function markLinkedReviewTokensFailed(mailDoc, reason) {
  const tokenIds = Array.isArray(mailDoc?.reviewTokenIds)
    ? mailDoc.reviewTokenIds.map(token => normalizeString(token)).filter(Boolean)
    : [];
  if (!tokenIds.length) return;

  await Promise.all(tokenIds.map(tokenId =>
    updateDoc(doc(db, "review_confirmations", tokenId), {
      status: "failed",
      error: normalizeString(reason),
      updatedAt: serverTimestamp()
    })
  ));
}

async function retryMailItem() {
  if (!editingMailId) return;
  const mailDoc = mailMeta.find(item => item.id === editingMailId);
  if (!mailDoc) return;

  try {
    await updateDoc(doc(db, "mail_queue", mailDoc.id), {
      status: "queued",
      error: "",
      sentAt: null,
      processingStartedAt: null,
      transportMessageId: "",
      updatedAt: serverTimestamp()
    });
    await logAuditEvent({
      area: "mail",
      action: "mail.retry_queued",
      entityType: "mail_queue",
      entityId: mailDoc.id,
      entityLabel: normalizeString(mailDoc.subject),
      relatedMailId: mailDoc.id,
      relatedRequestId: normalizeString(mailDoc.sourceCollection) === "resource_change_requests" ? normalizeString(mailDoc.sourceId) : "",
      summary: `Requeued mail ${normalizeString(mailDoc.subject) || mailDoc.id}`,
      details: {
        to: normalizeString(mailDoc.to)
      }
    });
    await loadMailQueue();
    await loadAuditLogs();
  } catch (err) {
    console.error("Error retrying mail:", err);
    alert("Error retrying mail. See console for details.");
  }
}

async function deleteMailItem() {
  if (!editingMailId) return;
  const mailDoc = mailMeta.find(item => item.id === editingMailId);
  if (!mailDoc) return;
  if (!confirm("Delete this mail queue item?")) return;

  try {
    await markLinkedReviewTokensFailed(mailDoc, "Mail queue item deleted by admin.");
    await deleteDoc(doc(db, "mail_queue", mailDoc.id));
    await logAuditEvent({
      area: "mail",
      action: "mail.deleted",
      entityType: "mail_queue",
      entityId: mailDoc.id,
      entityLabel: normalizeString(mailDoc.subject),
      relatedMailId: mailDoc.id,
      relatedRequestId: normalizeString(mailDoc.sourceCollection) === "resource_change_requests" ? normalizeString(mailDoc.sourceId) : "",
      summary: `Deleted mail queue item ${normalizeString(mailDoc.subject) || mailDoc.id}`,
      details: {
        status: normalizeMailStatus(mailDoc.status),
        to: normalizeString(mailDoc.to)
      }
    });
    hide(mailEditor);
    editingMailId = null;
    await loadMailQueue();
    await loadAuditLogs();
  } catch (err) {
    console.error("Error deleting mail item:", err);
    alert("Error deleting mail item. See console for details.");
  }
}

async function deleteSelectedMailItems() {
  const selectedIds = Array.from(selectedMailIds);
  if (!selectedIds.length || !["sent", "failed"].includes(activeMailFilter)) return;

  const selectedMails = mailMeta.filter(item =>
    selectedIds.includes(item.id) && normalizeMailStatus(item.status) === activeMailFilter
  );
  if (!selectedMails.length) return;
  if (!confirm(`Delete ${selectedMails.length} ${activeMailFilter} mail item(s)?`)) return;

  try {
    await Promise.all(selectedMails.map(mailDoc =>
      markLinkedReviewTokensFailed(mailDoc, "Mail queue item deleted by admin.")
    ));
    await Promise.all(selectedMails.map(mailDoc => deleteDoc(doc(db, "mail_queue", mailDoc.id))));
    await Promise.all(selectedMails.map(mailDoc => logAuditEvent({
      area: "mail",
      action: "mail.deleted",
      entityType: "mail_queue",
      entityId: mailDoc.id,
      entityLabel: normalizeString(mailDoc.subject),
      relatedMailId: mailDoc.id,
      relatedRequestId: normalizeString(mailDoc.sourceCollection) === "resource_change_requests" ? normalizeString(mailDoc.sourceId) : "",
      summary: `Deleted ${activeMailFilter} mail item ${normalizeString(mailDoc.subject) || mailDoc.id}`,
      details: {
        status: normalizeMailStatus(mailDoc.status),
        to: normalizeString(mailDoc.to)
      }
    })));
    selectedMailIds.clear();
    if (editingMailId && selectedIds.includes(editingMailId)) {
      hide(mailEditor);
      editingMailId = null;
    }
    await loadMailQueue();
    await loadAuditLogs();
  } catch (err) {
    console.error("Error deleting selected mail items:", err);
    alert("Error deleting selected mail items. See console for details.");
  }
}

function openMailSourceRequest() {
  if (!editingMailId) return;
  const mailDoc = mailMeta.find(item => item.id === editingMailId);
  const requestDoc = getMailSourceRequest(mailDoc);
  if (!requestDoc) return;
  setActivePanel("requests");
  openRequestEditor(requestDoc);
}

function openMailSourceResource() {
  if (!editingMailId) return;
  const mailDoc = mailMeta.find(item => item.id === editingMailId);
  const resourceDoc = getMailSourceResource(mailDoc);
  if (!resourceDoc) return;
  setActivePanel("resources");
  openResourceEditor(resourceDoc.id, resourceDoc);
}

function initMailAutoRefresh() {
  if (mailAutoRefreshHandle) return;
  mailAutoRefreshHandle = window.setInterval(async () => {
    if (activePanelName !== "mail" || adminScreen?.classList.contains("hidden")) return;
    await loadMailQueue({ preserveEditor: true });
  }, 15000);
}

function initReviewAutoRefresh() {
  if (reviewAutoRefreshHandle) return;
  reviewAutoRefreshHandle = window.setInterval(async () => {
    if (activePanelName !== "review-status" || adminScreen?.classList.contains("hidden")) return;
    await loadReviewStatus({ preserveEditor: true });
  }, 30000);
}

function openRequestEditor(requestDoc) {
  editingRequestId = requestDoc?.id || null;
  requestEditorTitle.textContent = "Review Request";
  requestReviewNotes.value = normalizeString(requestDoc?.reviewNotes);
  clearChildren(requestSummary);
  setRequestEditMode(false);

  const currentResource = resourceMeta.find(resource => resource.id === requestDoc.resourceId);
  requestSummary.appendChild(buildRequestMetaBlock(requestDoc));
  requestSummary.appendChild(buildRequestDiffList(currentResource, requestDoc.proposedData, requestDoc));

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

    if (normalizeString(requestDoc.requestType) === "quarterly_confirmation") {
      const confirmationDate = getValueDate(requestDoc.reviewConfirmedAt) || new Date();
      resourcePayload["Last Verified"] = formatDateOnly(confirmationDate);
      resourcePayload.UpdatedBy = "Quarterly review confirmation";
    }

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

  const mailPayload = buildRequestStatusMailPayload(requestDoc, nextStatus, reviewNotes);
  if (mailPayload) {
    const mailRef = await addDoc(collection(db, "mail_queue"), {
      ...mailPayload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    await logAuditEvent({
      area: "mail",
      action: "mail.queued",
      entityType: "mail_queue",
      entityId: mailRef.id,
      entityLabel: normalizeString(mailPayload.subject),
      organizationId: normalizeString(requestDoc.organizationId),
      relatedMailId: mailRef.id,
      relatedRequestId: normalizeString(requestDoc.id),
      relatedResourceId: normalizeString(requestDoc.resourceId),
      summary: `Queued ${normalizeRequestStatus(nextStatus)} email for ${normalizeString(requestDoc.resourceName) || requestDoc.id}`,
      details: {
        to: normalizeString(mailPayload.to),
        type: normalizeString(mailPayload.type)
      }
    });
  }

  await logAuditEvent({
    area: "requests",
    action: `request.${normalizeRequestStatus(nextStatus)}`,
    entityType: "request",
    entityId: normalizeString(requestDoc.id),
    entityLabel: normalizeString(requestDoc.resourceName),
    organizationId: normalizeString(requestDoc.organizationId),
    relatedRequestId: normalizeString(requestDoc.id),
    relatedResourceId: normalizeString(requestDoc.resourceId),
    summary: `${normalizeRequestStatus(nextStatus) === "approved" ? "Approved" : "Rejected"} request for ${normalizeString(requestDoc.resourceName) || requestDoc.id}`,
    details: {
      reviewNotes: normalizeString(reviewNotes),
      editedBeforeApproval: Boolean(overrideProposedData && nextStatus === "approved")
    }
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
    await loadReviewStatus({ preserveEditor: true });
    await loadAuditLogs();
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
    await logAuditEvent({
      area: "requests",
      action: "request.deleted",
      entityType: "request",
      entityId: requestDoc.id,
      entityLabel: normalizeString(requestDoc.resourceName),
      organizationId: normalizeString(requestDoc.organizationId),
      relatedRequestId: requestDoc.id,
      relatedResourceId: normalizeString(requestDoc.resourceId),
      summary: `Deleted request for ${normalizeString(requestDoc.resourceName) || requestDoc.id}`,
      details: {}
    });
    selectedRequestIds.delete(requestDoc.id);
    hide(requestEditor);
    editingRequestId = null;
    setRequestEditMode(false);
    await loadReviewRequests();
    await loadAuditLogs();
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
      await Promise.all(selectedRequests.map(requestDoc => logAuditEvent({
        area: "requests",
        action: "request.deleted",
        entityType: "request",
        entityId: requestDoc.id,
        entityLabel: normalizeString(requestDoc.resourceName),
        organizationId: normalizeString(requestDoc.organizationId),
        relatedRequestId: requestDoc.id,
        relatedResourceId: normalizeString(requestDoc.resourceId),
        summary: `Deleted request for ${normalizeString(requestDoc.resourceName) || requestDoc.id}`,
        details: { bulkAction: true }
      })));
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
    await loadReviewStatus({ preserveEditor: true });
    await loadAuditLogs();
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

mailFilterQueuedBtn?.addEventListener("click", () => {
  setActiveMailFilter("queued");
});

mailFilterSentBtn?.addEventListener("click", () => {
  setActiveMailFilter("sent");
});

mailFilterFailedBtn?.addEventListener("click", () => {
  setActiveMailFilter("failed");
});

refreshMailBtn?.addEventListener("click", async () => {
  await loadMailQueue();
});

bulkDeleteMailBtn?.addEventListener("click", async () => {
  await deleteSelectedMailItems();
});

openMailRequestBtn?.addEventListener("click", () => {
  openMailSourceRequest();
});

openMailResourceBtn?.addEventListener("click", () => {
  openMailSourceResource();
});

retryMailBtn?.addEventListener("click", async () => {
  await retryMailItem();
});

deleteMailBtn?.addEventListener("click", async () => {
  await deleteMailItem();
});

closeMailBtn?.addEventListener("click", () => {
  hide(mailEditor);
  editingMailId = null;
});

initMailAutoRefresh();
initReviewAutoRefresh();

refreshReviewStatusBtn?.addEventListener("click", async () => {
  await loadReviewStatus();
});

reviewFilterDueBtn?.addEventListener("click", () => {
  setActiveReviewFilter("due");
});

reviewFilterAttentionBtn?.addEventListener("click", () => {
  setActiveReviewFilter("attention");
});

reviewFilterCurrentBtn?.addEventListener("click", () => {
  setActiveReviewFilter("current");
});

reviewOrganizationFilter?.addEventListener("change", async () => {
  activeReviewOrganizationFilter = normalizeString(reviewOrganizationFilter.value);
  updateReviewFilterUi();
  renderReviewStatusList(getFilteredReviewStatus());

  const openItem = reviewStatusMeta.find(item => item.id === editingReviewStatusId);
  if (openItem && (!getFilteredReviewStatus().some(item => item.id === openItem.id))) {
    hide(reviewStatusEditor);
    editingReviewStatusId = null;
  }
});

sendReviewReminderBtn?.addEventListener("click", async () => {
  await sendManualReviewReminder();
});

openReviewResourceBtn?.addEventListener("click", () => {
  if (!editingReviewStatusId) return;
  const item = reviewStatusMeta.find(entry => entry.id === editingReviewStatusId);
  if (!item?.resource) return;
  setActivePanel("resources");
  openResourceEditor(item.resource.id, item.resource);
});

closeReviewStatusBtn?.addEventListener("click", () => {
  hide(reviewStatusEditor);
  editingReviewStatusId = null;
});

refreshAuditBtn?.addEventListener("click", async () => {
  await loadAuditLogs();
});

auditFilterAllBtn?.addEventListener("click", () => {
  setActiveAuditFilter("all");
});

auditFilterDirectoryBtn?.addEventListener("click", () => {
  setActiveAuditFilter("directory");
});

auditFilterRequestsBtn?.addEventListener("click", () => {
  setActiveAuditFilter("requests");
});

auditFilterMailBtn?.addEventListener("click", () => {
  setActiveAuditFilter("mail");
});

auditFilterAccessBtn?.addEventListener("click", () => {
  setActiveAuditFilter("access");
});

closeAuditBtn?.addEventListener("click", () => {
  hide(auditEditor);
  editingAuditId = null;
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
      const previousCategory = categoryMeta.find(cat => cat.id === editingCategoryId) || {};
      await updateDoc(doc(db, "categories", editingCategoryId), payload);
      await logAuditEvent({
        area: "directory",
        action: "category.updated",
        entityType: "category",
        entityId: editingCategoryId,
        entityLabel: normalizeString(payload.name) || normalizeString(previousCategory.name),
        summary: `Updated category ${normalizeString(payload.name) || editingCategoryId}`,
        details: {
          changedFields: getChangedFieldNames(previousCategory, payload, ["name", "subcategories"])
        }
      });
    } else {
      const createdRef = await addDoc(collection(db, "categories"), payload);
      await logAuditEvent({
        area: "directory",
        action: "category.created",
        entityType: "category",
        entityId: createdRef.id,
        entityLabel: normalizeString(payload.name),
        summary: `Created category ${normalizeString(payload.name) || createdRef.id}`,
        details: {
          subcategoryCount: Array.isArray(payload.subcategories) ? payload.subcategories.length : 0
        }
      });
    }
    hide(categoryEditor);
    await loadCategories();
    await loadResources();
    await loadAuditLogs();
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
    const previousCategory = categoryMeta.find(cat => cat.id === editingCategoryId) || {};
    await deleteDoc(doc(db, "categories", editingCategoryId));
    await logAuditEvent({
      area: "directory",
      action: "category.deleted",
      entityType: "category",
      entityId: editingCategoryId,
      entityLabel: normalizeString(previousCategory.name),
      summary: `Deleted category ${normalizeString(previousCategory.name) || editingCategoryId}`,
      details: {}
    });
    hide(categoryEditor);
    await loadCategories();
    await loadResources();
    await loadAuditLogs();
  } catch (err) {
    console.error("Error deleting category:", err);
    alert("Error deleting category. See console for details.");
  }
});
