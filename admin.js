// ------------------------------------------------------
// admin.js — Admin dashboard (Firestore + email-based admin)
// Fixes: resource schema compatibility + keywords + revamped category/subcategory UI
// ------------------------------------------------------

import { db, auth } from "./firebase.js";

import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ------------------------------------------------------
// CONFIG
// ------------------------------------------------------
const ADMIN_EMAIL = "mwinterman@washoecounty.gov";

// ------------------------------------------------------
// DOM (matches admin.html)
// ------------------------------------------------------

// Login screen
const loginScreen = document.getElementById("login-screen");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("login-error");

// Admin screen
const adminScreen = document.getElementById("admin-screen");
const logoutBtn = document.getElementById("logoutBtn");

// Nav + panels
const navBtns = document.querySelectorAll(".nav-btn");
const panelResources = document.getElementById("panel-resources");
const panelCategories = document.getElementById("panel-categories");

// Resources UI
const resourceList = document.getElementById("resource-list");
const resourceEditor = document.getElementById("resource-editor");
const resourceForm = document.getElementById("resource-form");
const addResourceBtn = document.getElementById("add-resource-btn");
const saveResourceBtn = document.getElementById("save-resource-btn");
const deleteResourceBtn = document.getElementById("delete-resource-btn");
const cancelResourceBtn = document.getElementById("cancel-resource-btn");
const editorTitle = document.getElementById("editor-title");
let editingResourceId = null;

// Categories UI
const categoryList = document.getElementById("category-list");
const categoryEditor = document.getElementById("category-editor");
const categoryNameInput = document.getElementById("category-name-input");
const subList = document.getElementById("subcategory-list");
const addSubBtn = document.getElementById("add-sub-btn");
const saveCategoryBtn = document.getElementById("save-category-btn");
const deleteCategoryBtn = document.getElementById("delete-category-btn");
const cancelCategoryBtn = document.getElementById("cancel-category-btn");
const addCategoryBtn = document.getElementById("add-category-btn");
let editingCategoryId = null;

// In-memory categories for resource editor
// [{ id, name, subcategories: string[] }]
let categoryMeta = [];

// ------------------------------------------------------
// Utilities
// ------------------------------------------------------
function show(el) {
  if (!el) return;
  el.classList.remove("hidden");
}
function hide(el) {
  if (!el) return;
  el.classList.add("hidden");
}
function clearChildren(el) {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
}
function normalizeString(str) {
  return String(str ?? "").trim();
}
function toLower(s) {
  return normalizeString(s).toLowerCase();
}
function setLoginError(msg) {
  if (!loginError) return;
  loginError.textContent = msg || "";
}
function createEl(tag, opts = {}) {
  const el = document.createElement(tag);
  if (opts.className) el.className = opts.className;
  if (opts.text != null) el.textContent = opts.text;
  if (opts.html != null) el.innerHTML = opts.html;
  if (opts.attrs) {
    Object.entries(opts.attrs).forEach(([k, v]) => el.setAttribute(k, v));
  }
  return el;
}

// Parse various formats into a string array
function normalizeToStringArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value.map(v => normalizeString(v)).filter(Boolean);
  }
  if (typeof value === "string") {
    // CSV-ish
    return value
      .split(",")
      .map(v => normalizeString(v))
      .filter(Boolean);
  }
  // Unknown object types — ignore safely
  return [];
}

// Convert selection back to original format (string vs array) when saving
function serializeByOriginalType(originalValue, arr) {
  if (Array.isArray(originalValue)) return arr;
  // default to string if original was string or missing
  return arr.join(", ");
}

// Pick first existing key from candidates (case-sensitive)
function pickExistingKey(obj, candidates, fallback) {
  for (const k of candidates) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return k;
  }
  return fallback;
}

// Read a value from obj using key candidates
function readByCandidates(obj, candidates, fallback = "") {
  for (const k of candidates) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) {
      const v = obj[k];
      if (v != null && normalizeString(v) !== "") return v;
    }
  }
  return fallback;
}

// ------------------------------------------------------
// Admin check (matches your Firestore rules)
// ------------------------------------------------------
function isAdminUser(user) {
  const email = String(user?.email || "").trim().toLowerCase();
  return email === ADMIN_EMAIL.toLowerCase();
}

// ------------------------------------------------------
// Panels / Nav
// ------------------------------------------------------
function showPanel(panelName) {
  hide(panelResources);
  hide(panelCategories);

  if (panelName === "resources") show(panelResources);
  if (panelName === "categories") show(panelCategories);

  if (panelName === "categories") {
    loadCategories().catch(err => console.error("Error loading categories:", err));
  }

  if (panelName === "resources") {
    // Need categories to render category/subcategory blocks
    loadCategories()
      .then(() => loadResources())
      .catch(err => console.error("Error loading resources/categories:", err));
  }
}

function initNav() {
  navBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const panel = btn.dataset.panel;
      showPanel(panel);
    });
  });

  showPanel("resources");
}

// ------------------------------------------------------
// AUTH
// ------------------------------------------------------
if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    setLoginError("");

    const email = String(emailInput?.value || "").trim();
    const password = String(passwordInput?.value || "");

    if (!email || !password) {
      setLoginError("Please enter email and password.");
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error("Login error:", err);
      setLoginError(err?.message || "Login failed.");
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout error:", err);
      alert("Logout failed. See console for details.");
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    show(loginScreen);
    hide(adminScreen);
    setLoginError("");
    return;
  }

  if (!isAdminUser(user)) {
    await signOut(auth);
    show(loginScreen);
    hide(adminScreen);
    setLoginError(`Access restricted. Please sign in with ${ADMIN_EMAIL}.`);
    return;
  }

  hide(loginScreen);
  show(adminScreen);
  setLoginError("");

  initNav();
});

// ------------------------------------------------------
// CATEGORIES (load + editor)
// ------------------------------------------------------
function normalizeCategoryDoc(docId, data) {
  const name =
    normalizeString(data?.name) ||
    normalizeString(data?.Name) ||
    normalizeString(data?.category) ||
    normalizeString(data?.Category) ||
    "";

  // subcategories may be array or csv string under different keys
  const subsRaw =
    data?.subcategories ??
    data?.Subcategories ??
    data?.subs ??
    data?.Subs ??
    data?.subCats ??
    data?.SubCats ??
    "";

  const subcategories = normalizeToStringArray(subsRaw);

  return { id: docId, name, subcategories };
}

async function loadCategories() {
  if (!categoryList) return;

  categoryList.textContent = "Loading…";
  categoryMeta = [];

  const querySnap = await getDocs(collection(db, "categories"));
  const docsArr = [];
  querySnap.forEach(docSnap => {
    docsArr.push(normalizeCategoryDoc(docSnap.id, docSnap.data()));
  });

  docsArr
    .filter(c => c.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  categoryMeta = docsArr;
  renderCategoryList(docsArr);
}

function renderCategoryList(categories) {
  clearChildren(categoryList);

  if (!categories.length) {
    categoryList.textContent = "No categories defined.";
    return;
  }

  categories.forEach(cat => {
    const row = document.createElement("div");
    row.className = "list-row";
    row.textContent = cat.name || "(Unnamed category)";
    row.addEventListener("click", () => openCategoryEditor(cat));
    categoryList.appendChild(row);
  });
}

function openCategoryEditor(cat) {
  editingCategoryId = cat ? cat.id : null;

  if (categoryNameInput) {
    categoryNameInput.value = cat?.name || "";
  }

  renderSubcategoryList(cat?.subcategories || []);
  show(categoryEditor);
}

function renderSubcategoryList(subcategories) {
  clearChildren(subList);

  (subcategories || []).forEach(sub => {
    const row = document.createElement("div");
    row.className = "sub-row";

    const input = document.createElement("input");
    input.className = "sub-input";
    input.type = "text";
    input.value = String(sub || "");

    const del = document.createElement("button");
    del.className = "sub-delete-btn";
    del.type = "button";
    del.textContent = "Remove";
    del.addEventListener("click", () => row.remove());

    row.appendChild(input);
    row.appendChild(del);
    subList.appendChild(row);
  });
}

if (addSubBtn) {
  addSubBtn.addEventListener("click", () => {
    const row = document.createElement("div");
    row.className = "sub-row";

    const input = document.createElement("input");
    input.className = "sub-input";
    input.type = "text";
    input.value = "";

    const del = document.createElement("button");
    del.className = "sub-delete-btn";
    del.type = "button";
    del.textContent = "Remove";
    del.addEventListener("click", () => row.remove());

    row.appendChild(input);
    row.appendChild(del);
    subList.appendChild(row);
  });
}

if (addCategoryBtn) {
  addCategoryBtn.addEventListener("click", () => openCategoryEditor(null));
}

if (cancelCategoryBtn) {
  cancelCategoryBtn.addEventListener("click", () => hide(categoryEditor));
}

if (saveCategoryBtn) {
  saveCategoryBtn.addEventListener("click", async () => {
    const name = String(categoryNameInput?.value || "").trim();
    if (!name) {
      alert("Category name is required.");
      return;
    }

    const subs = Array.from(subList?.querySelectorAll("input") || [])
      .map(i => String(i.value || "").trim())
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
    } catch (err) {
      console.error("Error saving category:", err);
      alert("Error saving category. See console for details.");
    }
  });
}

if (deleteCategoryBtn) {
  deleteCategoryBtn.addEventListener("click", async () => {
    if (!editingCategoryId) return;
    if (!window.confirm("Delete this category?")) return;

    try {
      await deleteDoc(doc(db, "categories", editingCategoryId));
      hide(categoryEditor);
      await loadCategories();
    } catch (err) {
      console.error("Error deleting category:", err);
      alert("Error deleting category. See console for details.");
    }
  });
}

// ------------------------------------------------------
// RESOURCES (list + editor)
// ------------------------------------------------------

// For display, accept many possible field names
function getResourceTitle(resource) {
  const v = readByCandidates(resource, ["Title", "title", "Name", "name"], "");
  return normalizeString(v) || "(Untitled)";
}
function getResourceOrg(resource) {
  const v = readByCandidates(resource, ["OrganizationName", "organizationName", "OrgName", "orgName", "Organization", "organization"], "");
  return normalizeString(v);
}

async function loadResources() {
  if (!resourceList) return;
  resourceList.textContent = "Loading…";

  const querySnap = await getDocs(collection(db, "resources"));
  const docsArr = [];
  querySnap.forEach(docSnap => {
    docsArr.push({ id: docSnap.id, ...docSnap.data() });
  });

  docsArr.sort((a, b) => getResourceTitle(a).localeCompare(getResourceTitle(b)));
  renderResourceList(docsArr);
}

function renderResourceList(resources) {
  clearChildren(resourceList);

  if (!resources.length) {
    resourceList.textContent = "No resources found.";
    return;
  }

  resources.forEach(resource => {
    const row = document.createElement("div");
    row.className = "list-row";

    const title = getResourceTitle(resource);
    const org = getResourceOrg(resource);

    row.textContent = org ? `${title} — ${org}` : title;
    row.addEventListener("click", () => openResourceEditor(resource.id, resource));
    resourceList.appendChild(row);
  });
}

function createFieldGroup(labelText, inputEl) {
  const wrapper = document.createElement("div");
  wrapper.className = "field-group";

  const lbl = document.createElement("label");
  lbl.className = "field-label";
  lbl.textContent = labelText;

  wrapper.appendChild(lbl);
  wrapper.appendChild(inputEl);
  return wrapper;
}

function buildTextInput(fieldKey, label, value) {
  const input = document.createElement("input");
  input.value = value || "";
  input.dataset.field = fieldKey;
  return createFieldGroup(label, input);
}

function buildTextArea(fieldKey, label, value) {
  const ta = document.createElement("textarea");
  ta.value = value || "";
  ta.dataset.field = fieldKey;
  return createFieldGroup(label, ta);
}

// ------------------------------------------------------
// NEW Category/Subcategory selector UI for Resource Editor
// - Categories: checkbox list
// - Subcategories appear under each selected category
// - Both support multi-select
// ------------------------------------------------------
function buildCategorySubcategorySelector({
  categoriesKey,
  subcategoriesKey,
  selectedCategories,
  selectedSubcategories,
  originalCategoriesValue,
  originalSubcategoriesValue
}) {
  const wrapper = document.createElement("div");
  wrapper.className = "field-group";

  const label = document.createElement("div");
  label.className = "field-label";
  label.textContent = "Categories & Subcategories";
  wrapper.appendChild(label);

  // store keys + original types for save()
  wrapper.dataset.categoriesKey = categoriesKey;
  wrapper.dataset.subcategoriesKey = subcategoriesKey;
  wrapper._originalCategoriesValue = originalCategoriesValue;
  wrapper._originalSubcategoriesValue = originalSubcategoriesValue;

  const selectedCatSet = new Set(selectedCategories.map(toLower));
  const selectedSubSet = new Set(selectedSubcategories.map(toLower));

  const container = document.createElement("div");
  container.className = "cat-selector";
  wrapper.appendChild(container);

  const catsSorted = [...categoryMeta]
    .filter(c => c && c.name)
    .sort((a, b) => a.name.localeCompare(b.name));

  catsSorted.forEach(cat => {
    const catBlock = document.createElement("div");
    catBlock.className = "cat-block";
    catBlock.dataset.catName = cat.name;

    // category checkbox
    const catRow = document.createElement("label");
    catRow.className = "cat-row";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "cat-cb";
    cb.value = cat.name;
    cb.checked = selectedCatSet.has(toLower(cat.name));

    const catName = document.createElement("span");
    catName.textContent = cat.name;

    catRow.appendChild(cb);
    catRow.appendChild(catName);
    catBlock.appendChild(catRow);

    // subcategories area (only shown when category checked)
    const subsWrap = document.createElement("div");
    subsWrap.className = "cat-subs";

    const subs = (cat.subcategories || []).map(s => normalizeString(s)).filter(Boolean);

    if (!subs.length) {
      const empty = document.createElement("div");
      empty.className = "cat-subs-empty";
      empty.textContent = "No subcategories";
      subsWrap.appendChild(empty);
    } else {
      subs.forEach(sub => {
        const subRow = document.createElement("label");
        subRow.className = "sub-row-cb";

        const subCb = document.createElement("input");
        subCb.type = "checkbox";
        subCb.className = "sub-cb";
        subCb.value = sub;
        subCb.checked = selectedSubSet.has(toLower(sub));

        const subName = document.createElement("span");
        subName.textContent = sub;

        subRow.appendChild(subCb);
        subRow.appendChild(subName);
        subsWrap.appendChild(subRow);
      });
    }

    catBlock.appendChild(subsWrap);
    container.appendChild(catBlock);

    // initial show/hide
    subsWrap.style.display = cb.checked ? "block" : "none";

    // toggle behavior:
    // - when unchecked, hide subs AND clear any selected subs in that block
    cb.addEventListener("change", () => {
      const checked = cb.checked;
      subsWrap.style.display = checked ? "block" : "none";

      if (!checked) {
        subsWrap.querySelectorAll('input[type="checkbox"]').forEach(x => {
          x.checked = false;
        });
      }
    });
  });

  return wrapper;
}

function collectCategorySubcategorySelector(selectorEl) {
  const categoriesKey = selectorEl.dataset.categoriesKey;
  const subcategoriesKey = selectorEl.dataset.subcategoriesKey;

  const selectedCategories = Array.from(selectorEl.querySelectorAll(".cat-cb:checked"))
    .map(cb => normalizeString(cb.value))
    .filter(Boolean);

  const selectedSubcategories = Array.from(selectorEl.querySelectorAll(".sub-cb:checked"))
    .map(cb => normalizeString(cb.value))
    .filter(Boolean);

  const originalCategoriesValue = selectorEl._originalCategoriesValue;
  const originalSubcategoriesValue = selectorEl._originalSubcategoriesValue;

  return {
    categoriesKey,
    subcategoriesKey,
    selectedCategories,
    selectedSubcategories,
    originalCategoriesValue,
    originalSubcategoriesValue
  };
}

// ------------------------------------------------------
// Resource Editor (schema-aware)
// ------------------------------------------------------
function buildResourceForm(initialData) {
  if (!resourceForm) return;
  resourceForm.innerHTML = "";

  const data = initialData || {};

  // Detect which keys this doc uses (so we don’t “lose” fields or write duplicates)
  const titleKey = pickExistingKey(data, ["Title", "title", "Name", "name"], "Title");
  const orgKey = pickExistingKey(
    data,
    ["OrganizationName", "organizationName", "OrgName", "orgName", "Organization", "organization"],
    "OrganizationName"
  );
  const descKey = pickExistingKey(data, ["Description", "description", "Desc", "desc"], "Description");
  const keywordsKey = pickExistingKey(data, ["Keywords", "keywords", "Tags", "tags"], "Keywords");
  const categoriesKey = pickExistingKey(data, ["Categories", "categories"], "Categories");
  const subcategoriesKey = pickExistingKey(data, ["Subcategories", "subcategories"], "Subcategories");

  // Core fields
  resourceForm.appendChild(buildTextInput(titleKey, "Title", data[titleKey] || ""));
  resourceForm.appendChild(buildTextInput(orgKey, "Organization Name", data[orgKey] || ""));
  resourceForm.appendChild(buildTextArea(descKey, "Description", data[descKey] || ""));

  // Keywords (restored)
  resourceForm.appendChild(buildTextInput(keywordsKey, "Keywords", data[keywordsKey] || ""));

  // Common optional fields (render them if present OR allow filling them in)
  const optionalFields = [
    { label: "Website", candidates: ["Website", "website", "URL", "url", "Link", "link"], fallback: "Website" },
    { label: "Phone", candidates: ["Phone", "phone", "PhoneNumber", "phoneNumber"], fallback: "Phone" },
    { label: "Email", candidates: ["Email", "email"], fallback: "Email" },
    { label: "Address", candidates: ["Address", "address", "Location", "location"], fallback: "Address" },
    { label: "Hours", candidates: ["Hours", "hours"], fallback: "Hours" },
    { label: "Eligibility", candidates: ["Eligibility", "eligibility"], fallback: "Eligibility" },
    { label: "Languages", candidates: ["Languages", "languages"], fallback: "Languages" },
    { label: "Notes", candidates: ["Notes", "notes"], fallback: "Notes" }
  ];

  optionalFields.forEach(f => {
    const key = pickExistingKey(data, f.candidates, f.fallback);
    resourceForm.appendChild(buildTextInput(key, f.label, data[key] || ""));
  });

  // Category/Subcategory selector (revamped)
  const selectedCategories = normalizeToStringArray(data[categoriesKey]);
  const selectedSubcategories = normalizeToStringArray(data[subcategoriesKey]);

  resourceForm.appendChild(
    buildCategorySubcategorySelector({
      categoriesKey,
      subcategoriesKey,
      selectedCategories,
      selectedSubcategories,
      originalCategoriesValue: data[categoriesKey],
      originalSubcategoriesValue: data[subcategoriesKey]
    })
  );

  // Render any extra keys (so you never “lose” fields)
  const alreadyRendered = new Set([
    titleKey, orgKey, descKey, keywordsKey,
    pickExistingKey(data, ["Website", "website", "URL", "url", "Link", "link"], "Website"),
    pickExistingKey(data, ["Phone", "phone", "PhoneNumber", "phoneNumber"], "Phone"),
    pickExistingKey(data, ["Email", "email"], "Email"),
    pickExistingKey(data, ["Address", "address", "Location", "location"], "Address"),
    pickExistingKey(data, ["Hours", "hours"], "Hours"),
    pickExistingKey(data, ["Eligibility", "eligibility"], "Eligibility"),
    pickExistingKey(data, ["Languages", "languages"], "Languages"),
    pickExistingKey(data, ["Notes", "notes"], "Notes"),
    categoriesKey,
    subcategoriesKey
  ]);

  Object.keys(data).forEach(k => {
    if (k === "id") return;
    if (alreadyRendered.has(k)) return;

    // If it’s an object/array, don’t render a broken input; keep safe.
    const v = data[k];
    if (typeof v === "object" && v != null) return;

    resourceForm.appendChild(buildTextInput(k, k, v || ""));
  });
}

async function openResourceEditor(docId, data) {
  editingResourceId = docId || null;

  if (editorTitle) {
    editorTitle.textContent = editingResourceId ? "Edit Resource" : "Add New Resource";
  }

  buildResourceForm(data || {});
  show(resourceEditor);
}

if (addResourceBtn) {
  addResourceBtn.addEventListener("click", () => {
    editingResourceId = null;
    if (editorTitle) editorTitle.textContent = "Add New Resource";
    buildResourceForm({});
    show(resourceEditor);
  });
}

if (cancelResourceBtn) {
  cancelResourceBtn.addEventListener("click", () => hide(resourceEditor));
}

if (saveResourceBtn) {
  saveResourceBtn.addEventListener("click", async () => {
    if (!resourceForm) return;

    const obj = {};

    // Regular inputs/textareas
    const inputs = resourceForm.querySelectorAll("input[data-field], textarea[data-field]");
    inputs.forEach(el => {
      const key = el.dataset.field;
      obj[key] = String(el.value ?? "");
    });

    // Category/Subcategory selector (revamped)
    const selectorEl = resourceForm.querySelector(".cat-selector")?.closest(".field-group");
    if (selectorEl) {
      const {
        categoriesKey,
        subcategoriesKey,
        selectedCategories,
        selectedSubcategories,
        originalCategoriesValue,
        originalSubcategoriesValue
      } = collectCategorySubcategorySelector(selectorEl);

      obj[categoriesKey] = serializeByOriginalType(originalCategoriesValue, selectedCategories);
      obj[subcategoriesKey] = serializeByOriginalType(originalSubcategoriesValue, selectedSubcategories);
    }

    try {
      if (editingResourceId) {
        await updateDoc(doc(db, "resources", editingResourceId), obj);
      } else {
        await addDoc(collection(db, "resources"), obj);
      }
      hide(resourceEditor);
      await loadResources();
    } catch (err) {
      console.error("Error saving resource:", err);
      alert("Error saving resource. See console for details.");
    }
  });
}

if (deleteResourceBtn) {
  deleteResourceBtn.addEventListener("click", async () => {
    if (!editingResourceId) return;
    if (!window.confirm("Delete this resource?")) return;

    try {
      await deleteDoc(doc(db, "resources", editingResourceId));
      hide(resourceEditor);
      await loadResources();
    } catch (err) {
      console.error("Error deleting resource:", err);
      alert("Error deleting resource. See console for details.");
    }
  });
}
