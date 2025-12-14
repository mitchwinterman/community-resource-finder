// ------------------------------------------------------
// admin.js — Admin dashboard (Firebase Auth + Firestore)
// SRM: full-file replacement
// ------------------------------------------------------

import { db, auth } from "./firebase.js";

import {
  collection,
  doc,
  getDocs,
  getDoc,
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
// DOM (matches your admin.html)
// ------------------------------------------------------
const loginScreen = document.getElementById("login-screen");
const adminScreen = document.getElementById("admin-screen");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("login-error");
const logoutBtn = document.getElementById("logoutBtn");

// Nav panels
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

/**
 * categoryMeta: [{ id, name, subcategories: string[] }]
 */
let categoryMeta = [];

// ------------------------------------------------------
// HELPERS
// ------------------------------------------------------
function show(el) {
  el?.classList.remove("hidden");
}
function hide(el) {
  el?.classList.add("hidden");
}
function clear(el) {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
}

function normalizeString(v) {
  return String(v ?? "").trim();
}

function parseCsv(v) {
  const s = normalizeString(v);
  if (!s) return [];
  return s
    .split(",")
    .map(x => x.trim())
    .filter(Boolean);
}

function toCsv(arr) {
  return (arr || []).map(x => normalizeString(x)).filter(Boolean).join(", ");
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

/**
 * Returns the first key in candidates that exists on obj.
 * If none exist, returns fallbackKey.
 */
function pickKey(obj, candidates, fallbackKey) {
  const o = obj || {};
  for (const k of candidates) {
    if (Object.prototype.hasOwnProperty.call(o, k)) return k;
  }
  return fallbackKey;
}

/**
 * Gets value from first existing key in candidates.
 */
function getValue(obj, candidates) {
  const o = obj || {};
  for (const k of candidates) {
    if (Object.prototype.hasOwnProperty.call(o, k)) return o[k];
  }
  return "";
}

function isAdminUser(user) {
  const email = normalizeString(user?.email).toLowerCase();
  return email === ADMIN_EMAIL.toLowerCase();
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
    // Signed in but not admin email
    show(loginScreen);
    hide(adminScreen);
    loginError.textContent = `Signed in as ${user.email || "(no email)"} — this account is not authorized.`;
    await signOut(auth);
    return;
  }

  hide(loginScreen);
  show(adminScreen);

  initNav();
  await loadCategories(); // needed before resources editor renders category UI
  await loadResources();
});

// ------------------------------------------------------
// NAV
// ------------------------------------------------------
function initNav() {
  // default to resources
  setActivePanel("resources");

  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const panel = btn.dataset.panel;
      setActivePanel(panel);
    });
  });
}

function setActivePanel(panelName) {
  // buttons
  navButtons.forEach(b => b.classList.remove("active"));
  const activeBtn = navButtons.find(b => b.dataset.panel === panelName);
  activeBtn?.classList.add("active");

  // panels
  if (panelName === "resources") {
    show(panelResources);
    hide(panelCategories);
  } else {
    hide(panelResources);
    show(panelCategories);
  }
}

// ------------------------------------------------------
// RESOURCES
// ------------------------------------------------------
async function loadResources() {
  resourceList.textContent = "Loading…";
  clear(resourceEditor);
  // Recreate editor structure (since clear removes it)
  // (We will just hide editor and rebuild form later)
  // Instead of clearing editor container, just hide it:
  hide(resourceEditor);

  try {
    const snap = await getDocs(collection(db, "resources"));
    const resources = [];
    snap.forEach(ds => resources.push({ id: ds.id, ...ds.data() }));

    // Sort by display name (org/name/title)
    resources.sort((a, b) => {
      const aName = getResourceDisplayName(a).toLowerCase();
      const bName = getResourceDisplayName(b).toLowerCase();
      return aName.localeCompare(bName);
    });

    renderResourceList(resources);
  } catch (err) {
    console.error("Error loading resources:", err);
    resourceList.textContent = "Error loading resources.";
  }
}

function getResourceDisplayName(resource) {
  // SRM: list should show "their name" only (your SS#1 requirement)
  // Prefer OrganizationName, then Name, then Title.
  const org = normalizeString(getValue(resource, ["OrganizationName", "organizationName", "OrgName", "orgName"]));
  const name = normalizeString(getValue(resource, ["Name", "name"]));
  const title = normalizeString(getValue(resource, ["Title", "title"]));

  return org || name || title || "(Unnamed)";
}

function renderResourceList(resources) {
  clear(resourceList);

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
  editingResourceId = docId || null;
  editorTitle.textContent = editingResourceId ? "Edit Resource" : "Add New Resource";
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

// -------------------------
// Resource Form Builder
// -------------------------
function buildResourceForm(data) {
  clear(resourceForm);

  // Key binding (schema tolerant)
  const keyDisplayName = pickKey(data, ["OrganizationName", "organizationName", "Name", "name", "Title", "title"], "OrganizationName");
  const keyTitle = pickKey(data, ["Title", "title"], "Title");
  const keyOrg = pickKey(data, ["OrganizationName", "organizationName"], "OrganizationName");

  const keyDescription = pickKey(data, ["Description", "description"], "Description");
  const keyWebsite = pickKey(data, ["Website", "website", "URL", "url"], "Website");
  const keyPhone = pickKey(data, ["Phone", "phone"], "Phone");
  const keyEmail = pickKey(data, ["Email", "email"], "Email");

  // Address grouping (you explicitly called out address vs zip)
  const keyAddress1 = pickKey(data, ["Address", "address", "Address1", "address1", "Street", "street"], "Address");
  const keyAddress2 = pickKey(data, ["Address2", "address2", "Suite", "suite"], "Address2");
  const keyCity = pickKey(data, ["City", "city"], "City");
  const keyState = pickKey(data, ["State", "state"], "State");
  const keyZip = pickKey(data, ["Zip", "ZIP", "zip", "PostalCode", "postalCode"], "Zip");

  const keyHours = pickKey(data, ["Hours", "hours"], "Hours");
  const keyEligibility = pickKey(data, ["Eligibility", "eligibility"], "Eligibility");
  const keyLanguages = pickKey(data, ["Languages", "languages"], "Languages");

  const keyKeywords = pickKey(data, ["Keywords", "keywords"], "Keywords");

  // Categories/Subcategories
  const keyCategories = pickKey(data, ["Categories", "categories"], "Categories");
  const keySubcategories = pickKey(data, ["Subcategories", "subcategories"], "Subcategories");

  const keyNotes = pickKey(data, ["Notes", "notes"], "Notes");

  // 1) NAME (single primary field — list uses this)
  resourceForm.appendChild(buildTextField(keyDisplayName, "Name", getValue(data, [keyDisplayName]), true));

  // 2) OPTIONAL: show separate Organization Name only if it’s a distinct key and differs conceptually
  // If your data already uses OrganizationName and we used it as Name, don't duplicate it.
  if (keyOrg !== keyDisplayName) {
    resourceForm.appendChild(buildTextField(keyOrg, "Organization Name", getValue(data, [keyOrg]), false));
  }

  // 3) OPTIONAL: Title (only if it exists historically in your docs OR you want it)
  // If Title exists in doc OR you explicitly want it, keep it available (not required)
  const titleExisting = Object.prototype.hasOwnProperty.call(data, keyTitle);
  if (titleExisting) {
    resourceForm.appendChild(buildTextField(keyTitle, "Title", getValue(data, [keyTitle]), false));
  }

  // 4) Description
  resourceForm.appendChild(buildTextArea(keyDescription, "Description", getValue(data, [keyDescription])));

  // 5) Categories + nested subcategories (your exact requirement)
  resourceForm.appendChild(
    buildNestedCategorySelector(
      keyCategories,
      keySubcategories,
      "Categories & Subcategories",
      parseCsv(getValue(data, [keyCategories])),
      parseCsv(getValue(data, [keySubcategories]))
    )
  );

  // 6) Keywords (not near the top)
  resourceForm.appendChild(buildTextField(keyKeywords, "Keywords", getValue(data, [keyKeywords]), false));

  // 7) Contact
  resourceForm.appendChild(buildTextField(keyWebsite, "Website", getValue(data, [keyWebsite]), false));
  resourceForm.appendChild(buildTextField(keyPhone, "Phone", getValue(data, [keyPhone]), false));
  resourceForm.appendChild(buildTextField(keyEmail, "Email", getValue(data, [keyEmail]), false));

  // 8) Address block (logical order; zip near address)
  resourceForm.appendChild(buildTextField(keyAddress1, "Address", getValue(data, [keyAddress1]), false));
  resourceForm.appendChild(buildTextField(keyAddress2, "Address Line 2", getValue(data, [keyAddress2]), false));
  resourceForm.appendChild(buildTextField(keyCity, "City", getValue(data, [keyCity]), false));
  resourceForm.appendChild(buildTextField(keyState, "State", getValue(data, [keyState]), false));
  resourceForm.appendChild(buildTextField(keyZip, "Zip Code", getValue(data, [keyZip]), false));

  // 9) Program details
  resourceForm.appendChild(buildTextField(keyHours, "Hours", getValue(data, [keyHours]), false));
  resourceForm.appendChild(buildTextField(keyEligibility, "Eligibility", getValue(data, [keyEligibility]), false));
  resourceForm.appendChild(buildTextField(keyLanguages, "Languages", getValue(data, [keyLanguages]), false));

  // 10) Notes (last, multiline)
  resourceForm.appendChild(buildTextArea(keyNotes, "Notes", getValue(data, [keyNotes]), { minHeight: 120 }));
}

function buildTextField(fieldKey, label, value, required = false) {
  const wrap = createEl("div", { className: "field-group", attrs: { "data-field": fieldKey } });
  const lbl = createEl("label", { className: "field-label", text: label });
  const input = createEl("input", { attrs: { type: "text" } });

  input.value = normalizeString(value);
  if (required) input.required = true;

  wrap.appendChild(lbl);
  wrap.appendChild(input);
  return wrap;
}

function buildTextArea(fieldKey, label, value, opts = {}) {
  const wrap = createEl("div", { className: "field-group", attrs: { "data-field": fieldKey } });
  const lbl = createEl("label", { className: "field-label", text: label });
  const ta = createEl("textarea");

  ta.value = normalizeString(value);
  if (opts.minHeight) ta.style.minHeight = `${opts.minHeight}px`;

  wrap.appendChild(lbl);
  wrap.appendChild(ta);
  return wrap;
}

/**
 * SRM requirement:
 * - Categories = checkboxes (only categories)
 * - When a category checked, show subcategories directly beneath that category
 * - Both are multi-select
 */
function buildNestedCategorySelector(catFieldKey, subFieldKey, label, selectedCategories, selectedSubcategories) {
  const wrapper = createEl("div", {
    className: "field-group",
    attrs: {
      "data-field": "__nested_categories__",
      "data-cat-field": catFieldKey,
      "data-sub-field": subFieldKey,
    }
  });

  const lbl = createEl("div", { className: "field-label", text: label });
  wrapper.appendChild(lbl);

  const selectedCatSet = new Set((selectedCategories || []).map(s => s.toLowerCase()));
  const selectedSubSet = new Set((selectedSubcategories || []).map(s => s.toLowerCase()));

  const container = createEl("div", { className: "cat-nested" });

  // stable order
  const cats = [...categoryMeta].sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  cats.forEach(cat => {
    const catName = normalizeString(cat.name);
    if (!catName) return;

    const block = createEl("div", { className: "cat-block" });

    // Category row
    const catRow = createEl("label", { className: "cat-row" });
    const catCb = createEl("input", { attrs: { type: "checkbox" } });
    catCb.value = catName;
    catCb.checked = selectedCatSet.has(catName.toLowerCase());

    const catText = createEl("span", { text: catName });

    catRow.appendChild(catCb);
    catRow.appendChild(catText);
    block.appendChild(catRow);

    // Subcategories container (only visible if category checked)
    const subsWrap = createEl("div", { className: "cat-subs" });

    const subs = (cat.subcategories || [])
      .map(s => normalizeString(s))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    if (subs.length) {
      const subList = createEl("div", { className: "cat-sub-list" });

      subs.forEach(sub => {
        const subRow = createEl("label", { className: "cat-sub-row" });
        const subCb = createEl("input", { attrs: { type: "checkbox" } });
        subCb.value = sub;

        // Only allow checked if parent category checked
        const shouldCheck = catCb.checked && selectedSubSet.has(sub.toLowerCase());
        subCb.checked = shouldCheck;
        subCb.disabled = !catCb.checked;

        const subText = createEl("span", { text: sub });
        subRow.appendChild(subCb);
        subRow.appendChild(subText);
        subList.appendChild(subRow);
      });

      subsWrap.appendChild(subList);
    } else {
      subsWrap.appendChild(createEl("div", { className: "cat-sub-empty", text: "(No subcategories)" }));
    }

    // toggle visibility + enable/disable subs
    function syncSubsUI() {
      if (catCb.checked) {
        subsWrap.style.display = "block";
        subsWrap.querySelectorAll('input[type="checkbox"]').forEach(cb => (cb.disabled = false));
      } else {
        subsWrap.style.display = "none";
        // uncheck & disable subs when category unchecked
        subsWrap.querySelectorAll('input[type="checkbox"]').forEach(cb => {
          cb.checked = false;
          cb.disabled = true;
        });
      }
    }

    catCb.addEventListener("change", syncSubsUI);

    block.appendChild(subsWrap);
    container.appendChild(block);

    // initial sync
    syncSubsUI();
  });

  wrapper.appendChild(container);
  return wrapper;
}

function collectResourceFormPayload() {
  const payload = {};

  const groups = Array.from(resourceForm.querySelectorAll(".field-group"));

  for (const g of groups) {
    const field = g.dataset.field;

    // special nested categories block
    if (field === "__nested_categories__") {
      const catField = g.dataset.catField;
      const subField = g.dataset.subField;

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

      payload[catField] = toCsv(selectedCats);
      payload[subField] = toCsv(selectedSubs);
      continue;
    }

    const input = g.querySelector("input, textarea, select");
    if (!input) continue;
    payload[field] = input.value ?? "";
  }

  return payload;
}

saveResourceBtn?.addEventListener("click", async () => {
  const payload = collectResourceFormPayload();

  // minimal validation: Name must exist (first field is required already)
  // if browser validity fails, stop
  const requiredInputs = Array.from(resourceForm.querySelectorAll("input[required]"));
  for (const ri of requiredInputs) {
    if (typeof ri.checkValidity === "function" && !ri.checkValidity()) {
      ri.reportValidity?.();
      return;
    }
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
// CATEGORIES (CRUD)
// ------------------------------------------------------
async function loadCategories() {
  categoryList.textContent = "Loading…";
  categoryMeta = [];

  try {
    const snap = await getDocs(collection(db, "categories"));
    const cats = [];
    snap.forEach(ds => {
      const d = ds.data() || {};
      cats.push({
        id: ds.id,
        name: normalizeString(d.name),
        subcategories: Array.isArray(d.subcategories) ? d.subcategories : [],
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
  clear(categoryList);

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
  clear(subcategoryList);

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
    await loadResources(); // keep nested selector in sync
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
