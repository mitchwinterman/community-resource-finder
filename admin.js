// ------------------------------------------------------
// admin.js - Admin dashboard (Firebase Auth + Firestore)
// ------------------------------------------------------

import { db, auth } from "./firebase.js";

import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getIdTokenResult,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  canonicalizeSubcategoryInput,
  formatNormalizationChange
} from "./taxonomy-rules.js";
import {
  normalizeWebsiteList,
  normalizePhoneEntries
} from "./contact-fields.js";

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

// ------------------------------------------------------
// STATE
// ------------------------------------------------------
let editingResourceId = null;
let editingCategoryId = null;
let editingOrganizationId = null;
let editingResourceData = null;
let categoryMeta = [];
let organizationMeta = [];
let resourceMeta = [];
let navInitialized = false;

const quillEditors = new Map();
const quillToolbarOptions = [
  ["bold", "italic", "underline"],
  [{ list: "ordered" }, { list: "bullet" }],
  ["link", "clean"]
];
const quillFormats = ["bold", "italic", "underline", "list", "link"];
const richTextAllowedTags = ["a", "br", "em", "li", "ol", "p", "strong", "u", "ul"];
const richTextAllowedAttrs = ["href"];

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
  return pieces.join(" • ");
}

function getOrganizationNameById(organizationId) {
  const targetId = normalizeString(organizationId);
  if (!targetId) return "";

  const match = organizationMeta.find(org => org.id === targetId);
  return match ? getOrganizationDisplayName(match) : "";
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

async function userHasAdminClaim(user) {
  if (!user) return false;

  try {
    const tokenResult = await getIdTokenResult(user, true);
    return tokenResult?.claims?.admin === true;
  } catch (err) {
    console.error("Error reading admin custom claim:", err);
    return false;
  }
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
    show(loginScreen);
    hide(adminScreen);
    loginError.textContent = "";
    return;
  }

  const isAdmin = await userHasAdminClaim(user);
  if (!isAdmin) {
    show(loginScreen);
    hide(adminScreen);
    loginError.textContent = `Signed in as ${user.email || "(no email)"} but this account does not have the required admin claim.`;
    await signOut(auth);
    return;
  }

  hide(loginScreen);
  show(adminScreen);

  initNav();

  await loadOrganizations();
  await loadCategories();
  await loadResources();
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

  if (panelName === "categories") {
    show(panelCategories);
    return;
  }

  if (panelName === "organizations") {
    show(panelOrganizations);
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
      text: statusParts.join(" • ")
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

  resourceForm.appendChild(buildFieldText("Title", "Title", data.Title || "", false));
  resourceForm.appendChild(buildFieldText("OrganizationName", "OrganizationName", data.OrganizationName || "", false));

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

  if (!confirm("Delete this organization?")) return;

  try {
    await deleteDoc(doc(db, "organizations", editingOrganizationId));
    hide(organizationEditor);
    await loadOrganizations();
    await loadResources();
  } catch (err) {
    console.error("Error deleting organization:", err);
    alert("Error deleting organization. See console for details.");
  }
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
