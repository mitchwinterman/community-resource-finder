// ------------------------------------------------------
// admin.js — full admin dashboard functionality
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
// DOM REFERENCES
// ------------------------------------------------------

// Screens
const loginScreen = document.getElementById("login-screen");
const adminScreen = document.getElementById("admin-screen");

// Login UI
const emailInput = document.getElementById("email");
const passInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loginError = document.getElementById("login-error");

// Panels
const resourcePanel = document.getElementById("panel-resources");
const categoryPanel = document.getElementById("panel-categories");
const navBtns = document.querySelectorAll(".nav-btn");

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
const addCategoryBtn = document.getElementById("add-category-btn");
const saveCategoryBtn = document.getElementById("save-category-btn");
const deleteCategoryBtn = document.getElementById("delete-category-btn");
const cancelCategoryBtn = document.getElementById("cancel-category-btn");
let editingCategoryId = null;

// Category metadata for resource editor
let categoryMeta = [];

// Small helpers
function showElement(el) {
    el.classList.remove("hidden");
}
function hideElement(el) {
    el.classList.add("hidden");
}

// ------------------------------------------------------
// LOGIN / LOGOUT + ADMIN ROLE ENFORCEMENT
// ------------------------------------------------------

// Handle login button click
loginBtn.onclick = async () => {
    loginError.textContent = "";
    loginBtn.disabled = true;

    const email = emailInput.value.trim();
    const password = passInput.value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle the rest
    } catch (err) {
        console.error("Login failed:", err);
        loginError.textContent = "Login failed. Please check your email and password.";
    } finally {
        loginBtn.disabled = false;
    }
};

// Handle logout
logoutBtn.onclick = () => {
    signOut(auth);
};

// Watch auth state and enforce admin role using Firestore "roles" collection.
onAuthStateChanged(auth, async user => {
    if (!user) {
        hideElement(adminScreen);
        showElement(loginScreen);
        return;
    }

    try {
        const roleDocRef = doc(db, "roles", user.uid);
        const roleSnap = await getDoc(roleDocRef);

        if (!roleSnap.exists()) {
            console.warn("No role document for user:", user.uid);
            loginError.textContent = "You do not have access to this admin panel.";
            await signOut(auth);
            return;
        }

        const data = roleSnap.data();
        const rawRoles = data.roles;

        const hasAdminRole = Array.isArray(rawRoles)
            ? rawRoles.includes("admin")
            : rawRoles === "admin";

        if (!hasAdminRole) {
            console.warn("User is authenticated but not an admin:", user.uid);
            loginError.textContent = "You do not have access to this admin panel.";
            await signOut(auth);
            return;
        }

        // Authenticated AND has admin role
        loginError.textContent = "";
        hideElement(loginScreen);
        showElement(adminScreen);

        // Load data for admins
        await loadResources();
        await loadCategories();
    } catch (err) {
        console.error("Error checking admin role:", err);
        loginError.textContent = "Error verifying access. Please try again or contact support.";
        await signOut(auth);
    }
});

// ------------------------------------------------------
// PANEL SWITCHING
// ------------------------------------------------------
navBtns.forEach(btn => {
    btn.onclick = () => {
        const target = btn.dataset.panel;

        hideElement(resourcePanel);
        hideElement(categoryPanel);

        if (target === "resources") {
            showElement(resourcePanel);
        } else if (target === "categories") {
            showElement(categoryPanel);
        }
    };
});

// ------------------------------------------------------
// RESOURCE MANAGEMENT
// ------------------------------------------------------

// Canonical field order for resource editor
const RESOURCE_FIELDS = [
    "Organization",
    "Description",
    "Address",
    "City",
    "Zip",
    "Phone",
    "Email",
    "Website",
    "Categories",
    "Subcategories",
    "Eligibility",
    "Hours",
    "Cost",
    "Last Verified",
    "Keywords",
    "Notes"
];

async function loadResources() {
    resourceList.innerHTML = "Loading…";

    try {
        const querySnap = await getDocs(collection(db, "resources"));
        resourceList.innerHTML = "";

        querySnap.forEach(docSnap => {
            const data = docSnap.data();
            const row = document.createElement("div");
            row.className = "list-row resource-row";
            row.textContent = data.Organization || "(No Organization Name)";
            row.onclick = () => openResourceEditor(docSnap.id, data);
            resourceList.appendChild(row);
        });

        if (!resourceList.children.length) {
            resourceList.textContent = "No resources found.";
        }
    } catch (err) {
        console.error("Error loading resources:", err);
        resourceList.textContent = "Error loading resources.";
    }
}

// Helpers for categories/subcategories for resource editor
function getAllCategoryNames() {
    return categoryMeta
        .map(c => c.name)
        .filter(name => name && typeof name === "string")
        .sort((a, b) => a.localeCompare(b));
}

function getAllSubcategoryNames() {
    const set = new Set();
    categoryMeta.forEach(cat => {
        (cat.subcategories || []).forEach(sub => {
            const name = String(sub || "").trim();
            if (name) set.add(name);
        });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function parseCommaString(value) {
    if (!value) return new Set();
    return new Set(
        String(value)
            .split(",")
            .map(v => v.trim())
            .filter(Boolean)
    );
}

function createMultiSelect(fieldName, currentValue, options) {
    const select = document.createElement("select");
    select.multiple = true;
    select.className = "resource-field";
    select.dataset.field = fieldName;

    const currentSet = parseCommaString(currentValue);

    options.forEach(label => {
        const option = document.createElement("option");
        option.value = label;
        option.textContent = label;
        if (currentSet.has(label)) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    return select;
}

// Best-effort ISO date detection (YYYY-MM-DD)
function looksLikeISODate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

// Build labeled resource form for existing or new data
function buildResourceForm(initialData) {
    resourceForm.innerHTML = "";

    const data = initialData || {};
    const dataKeys = Object.keys(data);

    const extraKeys = dataKeys.filter(k => !RESOURCE_FIELDS.includes(k));
    const allKeys = [...RESOURCE_FIELDS, ...extraKeys];

    allKeys.forEach(key => {
        const value = data[key] ?? "";

        const wrapper = document.createElement("div");
        wrapper.className = "field-group";

        const label = document.createElement("label");
        label.className = "field-label";
        label.textContent = key;
        wrapper.appendChild(label);

        // Special handling based on field
        if (key === "Categories") {
            const select = createMultiSelect("Categories", value, getAllCategoryNames());
            wrapper.appendChild(select);
        } else if (key === "Subcategories") {
            const select = createMultiSelect("Subcategories", value, getAllSubcategoryNames());
            wrapper.appendChild(select);
        } else if (key === "Last Verified") {
            if (!value || looksLikeISODate(value)) {
                const input = document.createElement("input");
                input.type = "date";
                input.className = "resource-field";
                input.dataset.field = key;
                if (looksLikeISODate(value)) {
                    input.value = value.trim();
                }
                wrapper.appendChild(input);
            } else {
                const textarea = document.createElement("textarea");
                textarea.className = "resource-field";
                textarea.dataset.field = key;
                textarea.value = value;
                wrapper.appendChild(textarea);
            }
        } else if (key === "Email") {
            const input = document.createElement("input");
            input.type = "email";
            input.className = "resource-field";
            input.dataset.field = key;
            input.value = value;
            wrapper.appendChild(input);
        } else if (key === "Phone") {
            const input = document.createElement("input");
            input.type = "tel";
            input.className = "resource-field";
            input.dataset.field = key;
            input.value = value;
            // loose pattern: digits and common punctuation, at least 7 chars
            input.pattern = "[0-9()+\\-\\.\\s]{7,}";
            input.title = "Use digits and standard phone punctuation (min 7 characters).";
            wrapper.appendChild(input);
        } else if (key === "Website") {
            const input = document.createElement("input");
            input.type = "url";
            input.className = "resource-field";
            input.dataset.field = key;
            input.value = value;
            wrapper.appendChild(input);
        } else {
            const textarea = document.createElement("textarea");
            textarea.className = "resource-field";
            textarea.dataset.field = key;
            textarea.value = value;
            wrapper.appendChild(textarea);
        }

        resourceForm.appendChild(wrapper);
    });
}

function openResourceEditor(id, data) {
    editingResourceId = id;
    editorTitle.textContent = "Edit Resource";
    showElement(resourceEditor);

    buildResourceForm(data);
}

addResourceBtn.onclick = () => {
    editingResourceId = null;
    editorTitle.textContent = "Add Resource";
    showElement(resourceEditor);
    buildResourceForm({});
};

saveResourceBtn.onclick = async () => {
    const inputs = resourceForm.querySelectorAll(".resource-field");

    // Basic HTML5 validity checks (email, url, tel pattern, date)
    for (const el of inputs) {
        if (typeof el.checkValidity === "function" && !el.checkValidity()) {
            alert(`Please correct the ${el.dataset.field} field.`);
            return;
        }
    }

    const obj = {};
    inputs.forEach(el => {
        const field = el.dataset.field;
        let value;

        if (el.tagName === "SELECT" && el.multiple) {
            const selected = [...el.selectedOptions]
                .map(o => o.value.trim())
                .filter(Boolean);
            value = selected.join(", ");
        } else {
            value = el.value;
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
        categoryList.innerHTML = "";

        querySnap.forEach(docSnap => {
            const data = docSnap.data();
            const rawName = (data.name || "").trim();
            const displayName = rawName || "(No Category Name)";
            const subs = Array.isArray(data.subcategories) ? data.subcategories : [];

            categoryMeta.push({
                id: docSnap.id,
                name: rawName,
                subcategories: subs
            });

            const row = document.createElement("div");
            row.className = "list-row category-row";
            row.textContent = displayName;
            row.onclick = () => openCategoryEditor(docSnap.id, { name: rawName, subcategories: subs });
            categoryList.appendChild(row);
        });

        if (!categoryList.children.length) {
            categoryList.textContent = "No categories found.";
        }
    } catch (err) {
        console.error("Error loading categories:", err);
        categoryList.textContent = "Error loading categories.";
    }
}

addCategoryBtn.onclick = () => {
    editingCategoryId = null;
    showElement(categoryEditor);
    categoryNameInput.value = "";
    subList.innerHTML = "";
};

function openCategoryEditor(id, data) {
    editingCategoryId = id;
    showElement(categoryEditor);

    categoryNameInput.value = data.name || "";
    subList.innerHTML = "";

    (data.subcategories || []).forEach(sub => addSubRow(sub));
}

addSubBtn.onclick = () => addSubRow("");

function addSubRow(value) {
    const row = document.createElement("div");
    row.className = "sub-row";

    const input = document.createElement("input");
    input.type = "text";
    input.value = value || "";
    input.className = "sub-input";

    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "X";
    del.className = "sub-delete-btn";
    del.onclick = () => row.remove();

    row.appendChild(input);
    row.appendChild(del);
    subList.appendChild(row);
}

saveCategoryBtn.onclick = async () => {
    const name = categoryNameInput.value.trim();
    const subs = [...subList.querySelectorAll("input")]
        .map(i => i.value.trim())
        .filter(v => v);

    if (!name) {
        alert("Category name is required.");
        return;
    }

    const obj = { name, subcategories: subs };

    try {
        if (editingCategoryId) {
            await updateDoc(doc(db, "categories", editingCategoryId), obj);
        } else {
            await addDoc(collection(db, "categories"), obj);
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
