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
// { id, name, subcategories[] }
let categoryMeta = [];

// ------------------------------------------------------
// SMALL HELPERS
// ------------------------------------------------------
function showElement(el) {
    el.classList.remove("hidden");
}
function hideElement(el) {
    el.classList.add("hidden");
}

// Parse comma-separated field -> array
function parseCommaList(str) {
    return String(str || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
}

// Unique + sorted
function uniqueSorted(arr) {
    return Array.from(new Set(arr)).sort((a, b) => a.localeCompare(b));
}

function getAllCategoryNames() {
    return uniqueSorted(
        categoryMeta
            .map(c => c.name)
            .filter(name => name && typeof name === "string")
    );
}

function getSubcategoriesForCategories(selectedCategoryNames) {
    const selected = new Set(selectedCategoryNames);
    const subs = new Set();

    categoryMeta.forEach(cat => {
        if (selected.has(cat.name)) {
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

// Login button
loginBtn.onclick = async () => {
    loginError.textContent = "";
    loginBtn.disabled = true;

    const email = emailInput.value.trim();
    const password = passInput.value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will do the rest
    } catch (err) {
        console.error("Login failed:", err);
        loginError.textContent = "Login failed. Please check your email and password.";
    } finally {
        loginBtn.disabled = false;
    }
};

// Logout
logoutBtn.onclick = () => {
    signOut(auth);
};

// Auth state watcher
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

        // Load data (categories first so resource editor has metadata)
        await loadCategories();
        await loadResources();
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

// canonical field order
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
        const resources = [];

        querySnap.forEach(docSnap => {
            const data = docSnap.data();
            resources.push({ id: docSnap.id, data });
        });

        // sort by Organization
        resources.sort((a, b) => {
            const aName = (a.data.Organization || "").toLowerCase();
            const bName = (b.data.Organization || "").toLowerCase();
            if (aName < bName) return -1;
            if (aName > bName) return 1;
            return 0;
        });

        resourceList.innerHTML = "";

        resources.forEach(({ id, data }) => {
            const row = document.createElement("div");
            row.className = "list-row resource-row";
            row.textContent = data.Organization || "(No Organization Name)";
            row.onclick = () => openResourceEditor(id, data);
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

function looksLikeISODate(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function buildResourceForm(initialData) {
    resourceForm.innerHTML = "";

    const data = initialData || {};
    const dataKeys = Object.keys(data);
    const extraKeys = dataKeys.filter(k => !RESOURCE_FIELDS.includes(k));
    const allKeys = [...RESOURCE_FIELDS, ...extraKeys];

    let categoriesSelect = null;
    let subcategoriesSelect = null;
    const initialCategories = data.Categories || "";
    const initialSubcategories = data.Subcategories || "";

    // sets for field type decisions
    const singleLineFields = new Set([
        "Organization",
        "Address",
        "City",
        "Zip",
        "Phone",
        "Email",
        "Website",
        "Hours",
        "Cost",
        "Keywords"
    ]);
    const textareaFields = new Set([
        "Description",
        "Eligibility",
        "Notes"
    ]);

    allKeys.forEach(key => {
        const value = data[key] ?? "";

        const wrapper = document.createElement("div");
        wrapper.className = "field-group";

        const label = document.createElement("label");
        label.className = "field-label";
        label.textContent = key;
        wrapper.appendChild(label);

        let fieldEl;

        if (key === "Categories") {
            // multi-select of existing categories
            fieldEl = document.createElement("select");
            fieldEl.multiple = true;
            fieldEl.className = "resource-field";
            fieldEl.dataset.field = key;

            const current = new Set(parseCommaList(initialCategories));
            getAllCategoryNames().forEach(name => {
                const opt = document.createElement("option");
                opt.value = name;
                opt.textContent = name;
                if (current.has(name)) opt.selected = true;
                fieldEl.appendChild(opt);
            });

            categoriesSelect = fieldEl;
        } else if (key === "Subcategories") {
            // multi-select; options depend on selected categories
            fieldEl = document.createElement("select");
            fieldEl.multiple = true;
            fieldEl.className = "resource-field";
            fieldEl.dataset.field = key;

            subcategoriesSelect = fieldEl;
        } else if (key === "Last Verified") {
            // date input
            const input = document.createElement("input");
            input.type = "date";
            input.className = "resource-field";
            input.dataset.field = key;
            if (looksLikeISODate(value)) {
                input.value = value.trim();
            }
            fieldEl = input;
        } else if (key === "Email") {
            const input = document.createElement("input");
            input.type = "email";
            input.className = "resource-field";
            input.dataset.field = key;
            input.value = value;
            fieldEl = input;
        } else if (key === "Phone") {
            const input = document.createElement("input");
            input.type = "tel";
            input.className = "resource-field";
            input.dataset.field = key;
            input.value = value;
            input.pattern = "[0-9()+\\-\\.\\s]{7,}";
            input.title = "Use digits and standard phone punctuation (min 7 characters).";
            fieldEl = input;
        } else if (key === "Website") {
            const input = document.createElement("input");
            input.type = "url";
            input.className = "resource-field";
            input.dataset.field = key;
            input.value = value;
            fieldEl = input;
        } else if (singleLineFields.has(key)) {
            const input = document.createElement("input");
            input.type = "text";
            input.className = "resource-field";
            input.dataset.field = key;
            input.value = value;
            fieldEl = input;
        } else if (textareaFields.has(key)) {
            const textarea = document.createElement("textarea");
            textarea.className = "resource-field";
            textarea.dataset.field = key;
            textarea.value = value;
            fieldEl = textarea;
        } else {
            // default: textarea
            const textarea = document.createElement("textarea");
            textarea.className = "resource-field";
            textarea.dataset.field = key;
            textarea.value = value;
            fieldEl = textarea;
        }

        wrapper.appendChild(fieldEl);
        resourceForm.appendChild(wrapper);
    });

    // wire categories ↔ subcategories
    if (categoriesSelect && subcategoriesSelect) {
        wireCategorySubcategorySelects(
            categoriesSelect,
            subcategoriesSelect,
            initialSubcategories
        );
    }
}

function wireCategorySubcategorySelects(catSelect, subSelect, initialSubString) {
    const initialSubs = new Set(parseCommaList(initialSubString));

    function updateSubOptions() {
        const selectedCategories = Array.from(catSelect.selectedOptions).map(o => o.value);
        const availableSubs = getSubcategoriesForCategories(selectedCategories);

        // preserve current manual selections
        const currentSelected = new Set(
            Array.from(subSelect.selectedOptions).map(o => o.value)
        );

        subSelect.innerHTML = "";

        availableSubs.forEach(name => {
            const opt = document.createElement("option");
            opt.value = name;
            opt.textContent = name;

            if (initialSubs.has(name) || currentSelected.has(name)) {
                opt.selected = true;
            }

            subSelect.appendChild(opt);
        });
    }

    // initial build
    updateSubOptions();
    // after first run, rely only on user selections
    initialSubs.clear();

    catSelect.addEventListener("change", updateSubOptions);
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
    const fields = Array.from(resourceForm.querySelectorAll(".resource-field"));

    // validate email/phone/date/url via HTML5 validity
    for (const el of fields) {
        if (!el.checkValidity()) {
            el.reportValidity();
            return;
        }
    }

    const obj = {};
    fields.forEach(el => {
        const field = el.dataset.field;
        let value;

        if (el.tagName === "SELECT" && el.multiple) {
            const selected = Array.from(el.selectedOptions)
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
            const subs = Array.isArray(data.subcategories) ? data.subcategories : [];

            categoryMeta.push({
                id: docSnap.id,
                name: rawName,
                subcategories: subs
            });

            const row = document.createElement("div");
            row.className = "list-row category-row";
            row.textContent = rawName || "(No Category Name)";
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
    const subs = Array.from(subList.querySelectorAll("input"))
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
