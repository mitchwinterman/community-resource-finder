// ------------------------------------------------------
// admin.js — Admin dashboard (Firestore + role-based)
// ------------------------------------------------------
import { db, auth } from "./firebase.js";
import {
    collection,
    doc,
    getDocs,
    getDoc,
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
// DOM ELEMENTS
// ------------------------------------------------------

// Login UI
const loginSection = document.getElementById("login-section");
const loginForm = document.getElementById("login-form");
const loginEmailInput = document.getElementById("login-email");
const loginPasswordInput = document.getElementById("login-password");
const loginError = document.getElementById("login-error");

const logoutBtn = document.getElementById("logout-btn");

// Admin content wrapper
const adminContent = document.getElementById("admin-content");
const adminEmailDisplay = document.getElementById("admin-email");

// Tabs
const tabButtons = document.querySelectorAll("[data-tab-target]");
const tabPanels = document.querySelectorAll("[data-tab-panel]");

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
const addSubBtn = document.getElementById("add-subcategory-btn");
const saveCategoryBtn = document.getElementById("save-category-btn");
const deleteCategoryBtn = document.getElementById("delete-category-btn");
const cancelCategoryBtn = document.getElementById("cancel-category-btn");
const addCategoryBtn = document.getElementById("add-category-btn");
let editingCategoryId = null;
let categoryMeta = []; // array of { id, name, subcategories: [] }

// Role-based UI
const rolesInfo = document.getElementById("roles-info");

// ------------------------------------------------------
// HELPER FUNCTIONS
// ------------------------------------------------------
function showElement(el) {
    if (!el) return;
    el.classList.remove("hidden");
}

function hideElement(el) {
    if (!el) return;
    el.classList.add("hidden");
}

function setLoading(container, isLoading) {
    if (!container) return;
    if (isLoading) {
        container.dataset.loading = "true";
        container.classList.add("loading");
    } else {
        delete container.dataset.loading;
        container.classList.remove("loading");
    }
}

function clearChildren(el) {
    if (!el) return;
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
}

function createEl(tag, options = {}) {
    const el = document.createElement(tag);
    if (options.className) el.className = options.className;
    if (options.text) el.textContent = options.text;
    if (options.html) el.innerHTML = options.html;
    if (options.attrs) {
        for (const [k, v] of Object.entries(options.attrs)) {
            el.setAttribute(k, v);
        }
    }
    return el;
}

// Simple text normalizer
function normalizeString(str) {
    return String(str || "").trim();
}

// Multi-value helper
function parseCsv(value) {
    if (!value) return [];
    return String(value)
        .split(",")
        .map(v => v.trim())
        .filter(Boolean);
}

// ------------------------------------------------------
// FIRESTORE HELPERS
// ------------------------------------------------------

// Check if user is admin by reading /roles/{uid} doc
async function fetchUserRoles(uid) {
    if (!uid) return null;
    try {
        const rolesDocRef = doc(db, "roles", uid);
        const snap = await getDoc(rolesDocRef);
        if (!snap.exists()) return null;
        return snap.data();
    } catch (err) {
        console.error("Error fetching roles:", err);
        return null;
    }
}

function userIsAdmin(rolesData) {
    if (!rolesData) return false;
    // Accept roles as string or array
    const roles = rolesData.roles;
    if (!roles) return false;
    if (typeof roles === "string") {
        return roles.toLowerCase() === "admin";
    }
    if (Array.isArray(roles)) {
        return roles.some(r => String(r || "").toLowerCase() === "admin");
    }
    return false;
}

// ------------------------------------------------------
// TAB SWITCHING
// ------------------------------------------------------
function initTabs() {
    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.dataset.tabTarget;
            if (!targetId) return;

            // Mark button active
            tabButtons.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            // Show corresponding panel
            tabPanels.forEach(panel => {
                if (panel.dataset.tabPanel === targetId) {
                    showElement(panel);
                } else {
                    hideElement(panel);
                }
            });

            // If we switched to Categories, reload them
            if (targetId === "categories-panel") {
                loadCategories().catch(err =>
                    console.error("Error (lazy) loading categories:", err)
                );
            }

            // If we switched to Resources, reload them
            if (targetId === "resources-panel") {
                loadResources().catch(err =>
                    console.error("Error (lazy) loading resources:", err)
                );
            }
        });
    });

    // Default tab: Resources
    const defaultBtn = document.querySelector('[data-tab-target="resources-panel"]');
    if (defaultBtn) defaultBtn.click();
}

// ------------------------------------------------------
// RESOURCE LIST + EDITOR
// ------------------------------------------------------

async function loadResources() {
    resourceList.innerHTML = "Loading…";
    setLoading(resourceList, true);

    try {
        const querySnap = await getDocs(collection(db, "resources"));
        const docsArr = [];
        querySnap.forEach(docSnap => {
            const data = docSnap.data();
            docsArr.push({
                id: docSnap.id,
                ...data
            });
        });

        // Sort by Title (or Name if Title missing)
        docsArr.sort((a, b) => {
            const titleA = normalizeString(a.Title || a.Name);
            const titleB = normalizeString(b.Title || b.Name);
            return titleA.localeCompare(titleB);
        });

        renderResourceList(docsArr);
    } catch (err) {
        console.error("Error loading resources:", err);
        resourceList.innerHTML = "Error loading resources.";
    } finally {
        setLoading(resourceList, false);
    }
}

function renderResourceList(resources) {
    clearChildren(resourceList);

    if (!resources.length) {
        resourceList.textContent = "No resources found.";
        return;
    }

    resources.forEach(resource => {
        const item = createEl("div", { className: "resource-item" });
        const title = normalizeString(resource.Title || resource.Name || "(Untitled)");
        const org = normalizeString(resource.OrganizationName || "");

        const heading = createEl("div", { className: "resource-title" });
        heading.textContent = title;

        const subtitle = createEl("div", { className: "resource-subtitle" });
        subtitle.textContent = org;

        item.appendChild(heading);
        if (org) item.appendChild(subtitle);

        item.addEventListener("click", () => openResourceEditor(resource.id, resource));
        resourceList.appendChild(item);
    });
}

function getCheckedValuesFromGroup(container) {
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
        .map(cb => cb.value.trim())
        .filter(Boolean);
}

function buildResourceForm(initialData) {
    resourceForm.innerHTML = "";

    const data = initialData || {};
    const dataKeys = Object.keys(data);
    const extraKeys = dataKeys.filter(k => !["Title", "OrganizationName", "Description"].includes(k));

    // Title
    resourceForm.appendChild(
        buildTextField("Title", "Title", data.Title || "", true)
    );

    // OrganizationName
    resourceForm.appendChild(
        buildTextField("OrganizationName", "Organization Name", data.OrganizationName || "", true)
    );

    // Description
    resourceForm.appendChild(
        buildTextArea("Description", "Description", data.Description || "")
    );

    // Known additional fields
    const knownFields = [
        "Website",
        "Phone",
        "Email",
        "Address",
        "Hours",
        "Eligibility",
        "Languages",
        "Notes"
    ];

    knownFields.forEach(field => {
        resourceForm.appendChild(
            buildTextField(field, field, data[field] || "", false)
        );
    });

    // Categories + Subcategories from categoryMeta
    resourceForm.appendChild(
        buildCategoryCheckboxGroup("Categories", "Categories", data.Categories)
    );

    resourceForm.appendChild(
        buildSubcategoryCheckboxGroup("Subcategories", "Subcategories", data.Subcategories, data.Categories)
    );

    // Any extra unknown keys
    extraKeys.forEach(key => {
        resourceForm.appendChild(
            buildTextField(key, key, data[key] || "", false)
        );
    });
}

function buildTextField(fieldName, label, value, required = false) {
    const wrapper = createEl("div", { className: "resource-field" });
    const lbl = createEl("label", { text: label });
    const input = createEl("input");

    input.type = "text";
    input.value = value || "";
    input.dataset.field = fieldName;
    if (required) input.required = true;

    wrapper.appendChild(lbl);
    wrapper.appendChild(input);

    // For consistent selector
    wrapper.dataset.field = fieldName;
    return wrapper;
}

function buildTextArea(fieldName, label, value) {
    const wrapper = createEl("div", { className: "resource-field" });
    const lbl = createEl("label", { text: label });
    const textarea = createEl("textarea");

    textarea.value = value || "";
    textarea.dataset.field = fieldName;

    wrapper.appendChild(lbl);
    wrapper.appendChild(textarea);
    wrapper.dataset.field = fieldName;
    return wrapper;
}

function buildCheckboxGroup(fieldName, label, allValues, selectedValues) {
    const wrapper = createEl("div", { className: "resource-field checkbox-group" });
    wrapper.dataset.field = fieldName;

    const lbl = createEl("div", { className: "checkbox-group-label", text: label });
    wrapper.appendChild(lbl);

    const list = createEl("div", { className: "checkbox-group-list" });
    const selectedSet = new Set((selectedValues || []).map(v => v.toLowerCase()));

    allValues.forEach(value => {
        const val = String(value || "").trim();
        if (!val) return;

        const item = createEl("label", { className: "checkbox-item" });
        const cb = createEl("input");
        cb.type = "checkbox";
        cb.value = val;

        if (selectedSet.has(val.toLowerCase())) {
            cb.checked = true;
        }

        const span = createEl("span", { text: val });
        item.appendChild(cb);
        item.appendChild(span);
        list.appendChild(item);
    });

    wrapper.appendChild(list);
    return wrapper;
}

function buildCategoryCheckboxGroup(fieldName, label, csvSelected) {
    const selected = parseCsv(csvSelected);
    const allCategoryNames = categoryMeta
        .map(c => c.name)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

    return buildCheckboxGroup(fieldName, label, allCategoryNames, selected);
}

function buildSubcategoryCheckboxGroup(fieldName, label, csvSelected, csvCategories) {
    const selected = parseCsv(csvSelected);
    const categories = parseCsv(csvCategories);

    const allSubNames = getAllSubcategoriesForCategoryList(categories);
    return buildCheckboxGroup(fieldName, label, allSubNames, selected);
}

// Build subcategory list from selected categories
function getAllSubcategoriesForCategoryList(categoryNames) {
    const selected = new Set(
        (categoryNames || [])
            .map(name => String(name || "").trim().toLowerCase())
            .filter(Boolean)
    );
    const subs = new Set();

    categoryMeta.forEach(cat => {
        if (selected.has(cat.name.toLowerCase())) {
            (cat.subcategories || []).forEach(sub => {
                const name = String(sub || "").trim();
                if (name) subs.add(name);
            });
        }
    });

    return Array.from(subs).sort((a, b) => a.localeCompare(b));
}

// ------------------------------------------------------
// LOGIN / LOGOUT + ADMIN ROLE ENFORCEMENT
// ------------------------------------------------------
loginForm.addEventListener("submit", async (evt) => {
    evt.preventDefault();
    loginError.textContent = "";

    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value;

    if (!email || !password) {
        loginError.textContent = "Please enter email and password.";
        return;
    }

    try {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        console.log("Logged in:", cred.user.uid);
    } catch (err) {
        console.error("Login error:", err);
        loginError.textContent = err.message || "Login failed.";
    }
});

logoutBtn.addEventListener("click", async () => {
    try {
        await signOut(auth);
    } catch (err) {
        console.error("Logout error:", err);
    }
});

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        // Not signed in
        showElement(loginSection);
        hideElement(adminContent);
        adminEmailDisplay.textContent = "";
        return;
    }

    // Signed in
    hideElement(loginSection);
    showElement(adminContent);
    adminEmailDisplay.textContent = user.email || "(no email)";

    // Enforce admin-only
    const roles = await fetchUserRoles(user.uid);
    const isAdmin = userIsAdmin(roles);

    if (!isAdmin) {
        // Not admin: show message and hide controls
        adminContent.innerHTML = `
            <div class="not-admin-message">
                <h2>Access restricted</h2>
                <p>You are signed in as <strong>${user.email || "(no email)"}</strong>, but
                this account does not have admin permissions.</p>
            </div>
        `;
        return;
    }

    // Show normal admin UI
    rolesInfo.textContent = `You are signed in as an admin.`;

    // Rebuild basic layout (ensure we didn't blow it away)
    // In this file we assume HTML is static, so just (re)init tabs and data:
    initTabs();
    await loadCategories();
    await loadResources();
});

// ------------------------------------------------------
// RESOURCE EDITOR EVENTS
// ------------------------------------------------------

async function openResourceEditor(docId, data) {
    editingResourceId = docId || null;

    if (editingResourceId) {
        editorTitle.textContent = "Edit Resource";
    } else {
        editorTitle.textContent = "Add New Resource";
    }

    buildResourceForm(data || {});
    showElement(resourceEditor);
}

addResourceBtn.onclick = () => {
    editingResourceId = null;
    editorTitle.textContent = "Add New Resource";
    buildResourceForm({});
    showElement(resourceEditor);
};

// UPDATED SAVE HANDLER
saveResourceBtn.onclick = async () => {
    const fields = Array.from(resourceForm.querySelectorAll(".resource-field"));

    // Validation pass
    for (const el of fields) {
        const fieldName = el.dataset.field;

        // Clear any previous custom validity where supported
        if (typeof el.setCustomValidity === "function") {
            el.setCustomValidity("");
        }

        // Phone validation (at least 7 digits if something was entered)
        if (fieldName === "Phone" && typeof el.value === "string") {
            const raw = el.value.trim();
            const digitsOnly = raw.replace(/\D/g, "");
            if (raw && digitsOnly.length < 7) {
                el.setCustomValidity?.("Please enter a valid phone number with at least 7 digits.");
            }
        }

        // Only run constraint validation on elements that support it
        if (typeof el.checkValidity === "function" && !el.checkValidity()) {
            if (typeof el.reportValidity === "function") {
                el.reportValidity();
            }
            return;
        }
    }

    // Build the object to save
    const obj = {};
    fields.forEach(el => {
        const field = el.dataset.field;
        if (!field) return;

        let value;

        if (el.classList.contains("checkbox-group")) {
            // Categories / Subcategories container divs
            const checked = getCheckedValuesFromGroup(el);
            value = checked.join(", ");
        } else if (el.tagName === "SELECT" && el.multiple) {
            const selected = Array.from(el.selectedOptions)
                .map(o => o.value.trim())
                .filter(Boolean);
            value = selected.join(", ");
        } else if ("value" in el) {
            value = el.value;
        } else {
            value = "";
        }

        obj[field] = value;
    });

    try {
        if (editingResourceId) {
            await updateDoc(doc(db, "resources", editingResourceId), obj);
        } else {
            await addDoc(collection(db, "resources"), obj);
        }
        hideElement(resourceEditor);
        await loadResources();
    } catch (err) {
        console.error("Error saving resource:", err);
        alert("Error saving resource. See console for details.");
    }
};

deleteResourceBtn.onclick = async () => {
    if (!editingResourceId) return;

    const confirmDelete = window.confirm("Delete this resource?");
    if (!confirmDelete) return;

    try {
        await deleteDoc(doc(db, "resources", editingResourceId));
        hideElement(resourceEditor);
        await loadResources();
    } catch (err) {
        console.error("Error deleting resource:", err);
        alert("Error deleting resource. See console for details.");
    }
};

cancelResourceBtn.onclick = () => {
    hideElement(resourceEditor);
};

// ------------------------------------------------------
// CATEGORY + SUBCATEGORY MANAGEMENT
// ------------------------------------------------------
async function loadCategories() {
    categoryList.innerHTML = "Loading…";
    categoryMeta = [];

    try {
        const querySnap = await getDocs(collection(db, "categories"));
        const docsArr = [];
        querySnap.forEach(docSnap => {
            const data = docSnap.data();
            docsArr.push({
                id: docSnap.id,
                name: data.name || "",
                subcategories: data.subcategories || []
            });
        });

        // Sort by name
        docsArr.sort((a, b) => a.name.localeCompare(b.name));
        categoryMeta = docsArr;
        renderCategoryList(docsArr);
    } catch (err) {
        console.error("Error loading categories:", err);
        categoryList.textContent = "Error loading categories.";
    }
}

function renderCategoryList(categories) {
    clearChildren(categoryList);

    if (!categories.length) {
        categoryList.textContent = "No categories defined.";
        return;
    }

    categories.forEach(cat => {
        const item = createEl("div", { className: "category-item" });

        const title = createEl("div", { className: "category-name", text: cat.name });
        item.appendChild(title);

        const subPreview = createEl("div", { className: "category-sub-preview" });
        const subs = (cat.subcategories || []).map(s => String(s || "").trim()).filter(Boolean);

        if (subs.length) {
            subPreview.textContent = subs.join(", ");
        } else {
            subPreview.textContent = "(No subcategories)";
        }
        item.appendChild(subPreview);

        item.addEventListener("click", () => openCategoryEditor(cat));
        categoryList.appendChild(item);
    });
}

function openCategoryEditor(cat) {
    editingCategoryId = cat ? cat.id : null;

    if (editingCategoryId) {
        categoryNameInput.value = cat.name || "";
        renderSubcategoryList(cat.subcategories || []);
    } else {
        categoryNameInput.value = "";
        renderSubcategoryList([]);
    }

    showElement(categoryEditor);
}

function renderSubcategoryList(subcategories) {
    clearChildren(subList);

    (subcategories || []).forEach((sub, index) => {
        const row = createEl("div", { className: "subcategory-row" });

        const input = createEl("input");
        input.type = "text";
        input.value = sub || "";
        input.dataset.index = index;

        const removeBtn = createEl("button", { className: "btn btn-sm btn-danger", text: "Remove" });
        removeBtn.addEventListener("click", () => {
            input.closest(".subcategory-row").remove();
        });

        row.appendChild(input);
        row.appendChild(removeBtn);
        subList.appendChild(row);
    });
}

addSubBtn.onclick = () => {
    const row = createEl("div", { className: "subcategory-row" });

    const input = createEl("input");
    input.type = "text";
    input.value = "";
    input.dataset.index = subList.childElementCount;

    const removeBtn = createEl("button", { className: "btn btn-sm btn-danger", text: "Remove" });
    removeBtn.addEventListener("click", () => {
        row.remove();
    });

    row.appendChild(input);
    row.appendChild(removeBtn);
    subList.appendChild(row);
};

addCategoryBtn.onclick = () => {
    openCategoryEditor(null);
};

saveCategoryBtn.onclick = async () => {
    const name = categoryNameInput.value.trim();

    if (!name) {
        alert("Category name is required.");
        return;
    }

    const subs = Array.from(subList.querySelectorAll("input"))
        .map(input => input.value.trim())
        .filter(Boolean);

    const payload = {
        name,
        subcategories: subs
    };

    try {
        if (editingCategoryId) {
            await updateDoc(doc(db, "categories", editingCategoryId), payload);
        } else {
            await addDoc(collection(db, "categories"), payload);
        }
        hideElement(categoryEditor);
        await loadCategories();
    } catch (err) {
        console.error("Error saving category:", err);
        alert("Error saving category. See console for details.");
    }
};

deleteCategoryBtn.onclick = async () => {
    if (!editingCategoryId) return;

    const confirmDelete = window.confirm("Delete this category?");
    if (!confirmDelete) return;

    try {
        await deleteDoc(doc(db, "categories", editingCategoryId));
        hideElement(categoryEditor);
        await loadCategories();
    } catch (err) {
        console.error("Error deleting category:", err);
        alert("Error deleting category. See console for details.");
    }
};

cancelCategoryBtn.onclick = () => {
    hideElement(categoryEditor);
};
