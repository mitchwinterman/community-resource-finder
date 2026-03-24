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
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ------------------------------------------------------
// CONFIG
// ------------------------------------------------------
const ADMIN_EMAIL = "mwinterman@washoecounty.gov";

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

// ------------------------------------------------------
// STATE
// ------------------------------------------------------
let editingResourceId = null;
let editingCategoryId = null;
let categoryMeta = [];

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

function isAdminUser(user) {
  const email = normalizeString(user?.email).toLowerCase();
  return email === ADMIN_EMAIL.toLowerCase();
}

function toDateInputValue(v) {
  const s = normalizeString(v);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return "";
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
    return;
  }

  if (!isAdminUser(user)) {
    show(loginScreen);
    hide(adminScreen);
    loginError.textContent = `Signed in as ${user.email || "(no email)"} - not authorized.`;
    await signOut(auth);
    return;
  }

  hide(loginScreen);
  show(adminScreen);

  initNav();

  await loadCategories();
  await loadResources();
});

// ------------------------------------------------------
// NAV
// ------------------------------------------------------
function initNav() {
  navButtons.forEach(btn => {
    btn.addEventListener("click", () => setActivePanel(btn.dataset.panel));
  });

  setActivePanel("resources");
}

function setActivePanel(panelName) {
  navButtons.forEach(b => b.classList.remove("active"));
  const active = navButtons.find(b => b.dataset.panel === panelName);
  active?.classList.add("active");

  if (panelName === "categories") {
    hide(panelResources);
    show(panelCategories);
  } else {
    show(panelResources);
    hide(panelCategories);
  }
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
    const row = createEl("div", { className: "list-row", text: getResourceDisplayName(r) });
    row.addEventListener("click", () => openResourceEditor(r.id, r));
    resourceList.appendChild(row);
  });
}

function openResourceEditor(docId, data) {
  editingResourceId = docId;
  editorTitle.textContent = "Edit Resource";
  buildResourceForm(data || {});
  show(resourceEditor);
}

addResourceBtn?.addEventListener("click", () => {
  editingResourceId = null;
  editorTitle.textContent = "Add New Resource";
  buildResourceForm({});
  show(resourceEditor);
});

cancelResourceBtn?.addEventListener("click", () => {
  hide(resourceEditor);
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

  resourceForm.appendChild(buildFieldText("Organization", "Organization", data.Organization || "", true));
  resourceForm.appendChild(buildFieldRichText(
    "Description",
    "Description",
    data.Description || "",
    data.DescriptionDelta || null
  ));

  resourceForm.appendChild(buildNestedCategorySelector(data.Categories, data.Subcategories));

  resourceForm.appendChild(buildFieldText("Keywords", "Keywords", data.Keywords || "", false));
  resourceForm.appendChild(buildFieldText("Website", "Website", data.Website || "", false));
  resourceForm.appendChild(buildFieldText("Phone", "Phone", data.Phone || "", false));
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

    const input = g.querySelector("input, textarea");
    payload[field] = input ? input.value : "";
  }

  return payload;
}

saveResourceBtn?.addEventListener("click", async () => {
  const orgInput = resourceForm.querySelector('.field-group[data-field="Organization"] input');
  if (orgInput && typeof orgInput.checkValidity === "function" && !orgInput.checkValidity()) {
    orgInput.reportValidity?.();
    return;
  }

  const payload = collectResourcePayload();

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

  const subs = Array.from(subcategoryList.querySelectorAll("input"))
    .map(i => normalizeString(i.value))
    .filter(Boolean);

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
