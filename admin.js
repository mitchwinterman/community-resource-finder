// ------------------------------------------------------
// admin.js — Admin dashboard (Firestore + email-based admin)
// Matches admin.html IDs and layout.
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

// In-memory category metadata for resource editor checkbox lists
let categoryMeta = []; // [{ id, name, subcategories: [] }]

// ------------------------------------------------------
// UI helpers
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
  return String(str || "").trim();
}
function parseCsv(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map(v => v.trim())
    .filter(Boolean);
}
function setLoginError(msg) {
  if (!loginError) return;
  loginError.textContent = msg || "";
}

// ------------------------------------------------------
// Admin check (matches your Firestore rules)
// ------------------------------------------------------
function isAdminUser(user) {
  const email = String(user?.email || "").trim().toLowerCase();
  return email === ADMIN_EMAIL.toLowerCase();
}

// ------------------------------------------------------
// Panel switching (matches admin.html data-panel)
// ------------------------------------------------------
function showPanel(panelName) {
  // Hide both panels first
  hide(panelResources);
  hide(panelCategories);

  if (panelName === "resources") show(panelResources);
  if (panelName === "categories") show(panelCategories);

  // Lazy load data for panel
  if (panelName === "categories") {
    loadCategories().catch(err => console.error("Error loading categories:", err));
  }
  if (panelName === "resources") {
    // Categories are used to render resource checkboxes; load them first
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

  // Default panel
  showPanel("resources");
}

// ------------------------------------------------------
// AUTH: Login / Logout / Guard
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
      // onAuthStateChanged will take it from here
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
    // Signed out
    show(loginScreen);
    hide(adminScreen);
    setLoginError("");
    return;
  }

  // Signed in — check admin email
  if (!isAdminUser(user)) {
    // Immediately sign out (keeps your admin surface clean)
    await signOut(auth);
    show(loginScreen);
    hide(adminScreen);
    setLoginError(`Access restricted. Please sign in with ${ADMIN_EMAIL}.`);
    return;
  }

  // Admin OK
  hide(loginScreen);
  show(adminScreen);
  setLoginError("");

  // Initialize UI + load default panel
  initNav();
});

// ------------------------------------------------------
// RESOURCES
// ------------------------------------------------------
async function loadResources() {
  if (!resourceList) return;
  resourceList.textContent = "Loading…";

  const querySnap = await getDocs(collection(db, "resources"));
  const docsArr = [];
  querySnap.forEach(docSnap => {
    docsArr.push({ id: docSnap.id, ...docSnap.data() });
  });

  docsArr.sort((a, b) => {
    const titleA = normalizeString(a.Title || a.Name);
    const titleB = normalizeString(b.Title || b.Name);
    return titleA.localeCompare(titleB);
  });

  renderResourceList(docsArr);
}

function renderResourceList(resources) {
  clearChildren(resourceList);

  if (!resources.length) {
    resourceList.textContent = "No resources found.";
    return;
  }

  resources.forEach(resource => {
    // Your CSS styles ".list-row", so use that.
    const row = document.createElement("div");
    row.className = "list-row";

    const title = normalizeString(resource.Title || resource.Name || "(Untitled)");
    const org = normalizeString(resource.OrganizationName || "");

    row.textContent = org ? `${title} — ${org}` : title;

    row.addEventListener("click", () => openResourceEditor(resource.id, resource));
    resourceList.appendChild(row);
  });
}

function getCheckedValuesFromGroup(container) {
  return Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
    .map(cb => cb.value.trim())
    .filter(Boolean);
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

function buildTextInput(fieldName, label, value) {
  const input = document.createElement("input");
  input.value = value || "";
  input.dataset.field = fieldName;
  return createFieldGroup(label, input);
}

function buildTextArea(fieldName, label, value) {
  const ta = document.createElement("textarea");
  ta.value = value || "";
  ta.dataset.field = fieldName;
  return createFieldGroup(label, ta);
}

function buildCheckboxGroup(fieldName, label, allValues, selectedValues) {
  const wrap = document.createElement("div");
  wrap.className = "field-group checkbox-group";
  wrap.dataset.field = fieldName;

  const groupLabel = document.createElement("div");
  groupLabel.className = "field-label";
  groupLabel.textContent = label;
  wrap.appendChild(groupLabel);

  const selectedSet = new Set((selectedValues || []).map(v => String(v).toLowerCase()));

  allValues.forEach(v => {
    const val = String(v || "").trim();
    if (!val) return;

    const pill = document.createElement("label");
    pill.className = "checkbox-pill";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = val;
    cb.checked = selectedSet.has(val.toLowerCase());

    const span = document.createElement("span");
    span.textContent = val;

    pill.appendChild(cb);
    pill.appendChild(span);
    wrap.appendChild(pill);
  });

  return wrap;
}

function getAllSubcategoriesForCategoryList(categoryNames) {
  const selected = new Set(
    (categoryNames || []).map(n => String(n || "").trim().toLowerCase()).filter(Boolean)
  );

  const subs = new Set();
  categoryMeta.forEach(cat => {
    if (selected.has(String(cat.name || "").toLowerCase())) {
      (cat.subcategories || []).forEach(sub => {
        const name = String(sub || "").trim();
        if (name) subs.add(name);
      });
    }
  });

  return Array.from(subs).sort((a, b) => a.localeCompare(b));
}

function buildResourceForm(initialData) {
  if (!resourceForm) return;
  resourceForm.innerHTML = "";

  const data = initialData || {};

  // Core fields
  resourceForm.appendChild(buildTextInput("Title", "Title", data.Title || ""));
  resourceForm.appendChild(buildTextInput("OrganizationName", "Organization Name", data.OrganizationName || ""));
  resourceForm.appendChild(buildTextArea("Description", "Description", data.Description || ""));

  // Known fields
  const knownFields = ["Website", "Phone", "Email", "Address", "Hours", "Eligibility", "Languages", "Notes"];
  knownFields.forEach(f => resourceForm.appendChild(buildTextInput(f, f, data[f] || "")));

  // Category checkboxes (stored as CSV string in doc)
  const allCategoryNames = categoryMeta.map(c => c.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
  resourceForm.appendChild(buildCheckboxGroup("Categories", "Categories", allCategoryNames, parseCsv(data.Categories)));

  // Subcategory checkboxes based on selected Categories
  const selectedCategories = parseCsv(data.Categories);
  const allSubs = getAllSubcategoriesForCategoryList(selectedCategories);
  resourceForm.appendChild(buildCheckboxGroup("Subcategories", "Subcategories", allSubs, parseCsv(data.Subcategories)));
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

    // Collect fields
    const obj = {};

    // Normal fields
    const inputs = resourceForm.querySelectorAll("input[data-field], textarea[data-field]");
    inputs.forEach(el => {
      const key = el.dataset.field;
      obj[key] = String(el.value || "");
    });

    // Checkbox groups
    const groups = resourceForm.querySelectorAll(".checkbox-group[data-field]");
    groups.forEach(group => {
      const key = group.dataset.field;
      const checked = getCheckedValuesFromGroup(group);
      obj[key] = checked.join(", ");
    });

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

// ------------------------------------------------------
// CATEGORIES
// ------------------------------------------------------
async function loadCategories() {
  if (!categoryList) return;

  categoryList.textContent = "Loading…";
  categoryMeta = [];

  const querySnap = await getDocs(collection(db, "categories"));
  const docsArr = [];
  querySnap.forEach(docSnap => {
    const data = docSnap.data();
    docsArr.push({
      id: docSnap.id,
      name: data.name || "",
      subcategories: Array.isArray(data.subcategories) ? data.subcategories : []
    });
  });

  docsArr.sort((a, b) => String(a.name).localeCompare(String(b.name)));
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
    row.textContent = cat.name;

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
