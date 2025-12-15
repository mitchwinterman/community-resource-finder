// ------------------------------------------------------
// admin.js — Admin dashboard (Firebase Auth + Firestore)
// SRM: full-file replacement
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
// CONFIG (matches your Firestore rules)
// ------------------------------------------------------
const ADMIN_EMAIL = "mwinterman@washoecounty.gov";

// ------------------------------------------------------
// DOM (must match admin.html)
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

/**
 * categoryMeta: [{ id, name, subcategories: string[] }]
 * /categories docs: { name: string, subcategories: string[] }
 */
let categoryMeta = [];

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
function createEl(tag, opts = {}) {
  const el = document.createElement(tag);
  if (opts.className) el.className = opts.className;
  if (opts.text != null) el.textContent = opts.text;
  if (opts.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) el.setAttribute(k, v);
  }
  return el;
}

function isAdminUser(user) {
  const email = normalizeString(user?.email).toLowerCase();
  return email === ADMIN_EMAIL.toLowerCase();
}

// Date helpers (SRM: store in Firestore as YYYY-MM-DD string)
function toDateInputValue(v) {
  const s = normalizeString(v);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return "";
}

/**
 * SRM-critical fix:
 * Categories/Subcategories are stored as STRING fields, but category names can contain commas.
 * So we CANNOT parse by split(",").
 *
 * Instead: match known option strings against the stored field value.
 * This is safe given your schema: options come from Firestore categories docs.
 */
function parseSelectionsByMatching(storedValue, options) {
  const raw = normalizeString(storedValue);
  if (!raw) return [];

  const hay = raw.toLowerCase();
  const opts = (options || [])
    .map(x => normalizeString(x))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length); // longest first

  const found = [];
  const used = new Set();

  for (const opt of opts) {
    const key = opt.toLowerCase();
    if (used.has(key)) continue;

    if (hay.includes(key)) {
      found.push(opt);
      used.add(key);
    }
  }

  return found;
}

function joinAsDisplayString(arr) {
  // Keep existing Firestore format: comma+space.
  // We do NOT change storage format because main site may rely on this.
  return (arr || []).map(x => normalizeString(x)).filter(Boolean).join(", ");
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
    loginError.textContent = `Signed in as ${user.email || "(no email)"} — not authorized.`;
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

  resourceList.textContent = "Loading…";

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
  const wrap = createEl("div", { className: "field-group", attrs: { "data-field": fieldKey, "data-type": "text" } });
  const lbl = createEl("label", { className: "field-label", text: label });
  const input = createEl("input", { attrs: { type: "text" } });

  input.value = normalizeString(value);
  if (required) input.required = true;

  wrap.appendChild(lbl);
  wrap.appendChild(input);
  return wrap;
}

function buildFieldDate(fieldKey, label, value = "") {
  const wrap = createEl("div", { className: "field-group", attrs: { "data-field": fieldKey, "data-type": "date" } });
  const lbl = createEl("label", { className: "field-label", text: label });
  const input = createEl("input", { attrs: { type: "date" } });

  input.value = toDateInputValue(value);

  wrap.appendChild(lbl);
  wrap.appendChild(input);
  return wrap;
}

function buildFieldRichText(fieldKey, label, htmlValue = "") {
  const wrap = createEl("div", { className: "field-group", attrs: { "data-field": fieldKey, "data-type": "richtext" } });
  const lbl = createEl("label", { className: "field-label", text: label });

  const toolbar = createEl("div", { className: "rte-toolbar" });
  const editor = createEl("div", { className: "rte-editor", attrs: { contenteditable: "true" } });

  editor.innerHTML = normalizeString(htmlValue) || "";

  function cmd(command) {
    editor.focus();
    document.execCommand(command, false, null);
  }

  const btnBold = createEl("button", { className: "rte-btn", text: "B", attrs: { type: "button", title: "Bold" } });
  btnBold.addEventListener("click", () => cmd("bold"));

  const btnItalic = createEl("button", { className: "rte-btn", text: "I", attrs: { type: "button", title: "Italic" } });
  btnItalic.addEventListener("click", () => cmd("italic"));

  const btnUnderline = createEl("button", { className: "rte-btn", text: "U", attrs: { type: "button", title: "Underline" } });
  btnUnderline.addEventListener("click", () => cmd("underline"));

  const btnBullets = createEl("button", { className: "rte-btn", text: "•", attrs: { type: "button", title: "Bulleted List" } });
  btnBullets.addEventListener("click", () => cmd("insertUnorderedList"));

  const btnNumbers = createEl("button", { className: "rte-btn", text: "1.", attrs: { type: "button", title: "Numbered List" } });
  btnNumbers.addEventListener("click", () => cmd("insertOrderedList"));

  toolbar.appendChild(btnBold);
  toolbar.appendChild(btnItalic);
  toolbar.appendChild(btnUnderline);
  toolbar.appendChild(btnBullets);
  toolbar.appendChild(btnNumbers);

  wrap.appendChild(lbl);
  wrap.appendChild(toolbar);
  wrap.appendChild(editor);
  return wrap;
}

/**
 * SRM requirement + refinement:
 * - Categories = checkboxes (ONLY categories)
 * - Subcategories appear directly under their category
 * - Multi-select for both
 * - NEW: expand/collapse subcategories WITHOUT selecting the category
 *
 * Storage in Firestore remains string fields:
 *   Categories: "A, B"
 *   Subcategories: "X, Y"
 *
 * Critical fix: we do NOT split by comma because category names include commas.
 */
function buildNestedCategorySelector(storedCategoriesStr, storedSubcategoriesStr) {
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

  const allCategoryNames = categoryMeta.map(c => c.name).filter(Boolean);
  const allSubNames = Array.from(
    new Set(categoryMeta.flatMap(c => (c.subcategories || []).map(s => normalizeString(s)).filter(Boolean)))
  );

  const selectedCats = parseSelectionsByMatching(storedCategoriesStr, allCategoryNames);
  const selectedSubs = parseSelectionsByMatching(storedSubcategoriesStr, allSubNames);

  const selectedCatSet = new Set(selectedCats.map(x => x.toLowerCase()));
  const selectedSubSet = new Set(selectedSubs.map(x => x.toLowerCase()));

  const cats = [...categoryMeta].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  cats.forEach(cat => {
    const catName = normalizeString(cat.name);
    if (!catName) return;

    const block = createEl("div", { className: "cat-block" });

    // Header = checkbox label + expand/collapse button (button is NOT inside label)
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

    // Subcategories wrapper
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

        // Keep checked if stored and category is selected
        subCb.checked = catCb.checked && selectedSubSet.has(sub.toLowerCase());
        // Disabled unless category is selected
        subCb.disabled = !catCb.checked;

        subRow.appendChild(subCb);
        subRow.appendChild(createEl("span", { text: sub }));
        subList.appendChild(subRow);
      });

      subsWrap.appendChild(subList);
    } else {
      subsWrap.appendChild(createEl("div", { className: "cat-sub-empty", text: "(No subcategories)" }));
    }

    // Expand/collapse state:
    // - independent of checkbox
    // - but if checkbox is checked, we force visible (so user can select subs)
    let expanded = false;

    function syncSubsUI() {
      const forceVisible = catCb.checked;
      const shouldShow = forceVisible || expanded;

      subsWrap.style.display = shouldShow ? "block" : "none";

      // Enable sub-checkboxes only when category checked
      subsWrap.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.disabled = !catCb.checked;
        if (!catCb.checked) cb.checked = false; // SRM: no subcategories without the parent category
      });

      // Toggle button label reflects expanded state (not the checkbox state)
      toggleBtn.textContent = expanded ? "Hide" : "Show";
      toggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
    }

    toggleBtn.addEventListener("click", () => {
      expanded = !expanded;
      syncSubsUI();
    });

    catCb.addEventListener("change", () => {
      // If user checks category, show the section (force visible)
      // If user unchecks, we do not automatically collapse; we keep expanded state.
      syncSubsUI();
    });

    block.appendChild(subsWrap);
    container.appendChild(block);

    // Initial render:
    // If category is already selected, show subs.
    expanded = false;
    syncSubsUI();
  });

  wrapper.appendChild(container);
  return wrapper;
}

// ------------------------------------------------------
// Build resource editor form (SRM schema + SRM order)
// ------------------------------------------------------
function buildResourceForm(data) {
  clearChildren(resourceForm);

  resourceForm.appendChild(buildFieldText("Organization", "Organization", data.Organization || "", true));
  resourceForm.appendChild(buildFieldRichText("Description", "Description", data.Description || ""));

  // IMPORTANT: pass raw stored strings, do NOT parse by comma
  resourceForm.appendChild(buildNestedCategorySelector(data.Categories || "", data.Subcategories || ""));

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

  resourceForm.appendChild(buildFieldRichText("Notes", "Notes", data.Notes || ""));

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

      payload["Categories"] = joinAsDisplayString(selectedCats);
      payload["Subcategories"] = joinAsDisplayString(selectedSubs);
      continue;
    }

    if (type === "richtext") {
      const editor = g.querySelector(".rte-editor");
      payload[field] = editor ? editor.innerHTML : "";
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
