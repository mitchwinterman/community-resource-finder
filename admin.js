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

// Small helper
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
// Expected document path: roles/{uid} with a field "roles" equal to "admin"
// or an array that includes "admin".
onAuthStateChanged(auth, async user => {
    if (!user) {
        // Not signed in: show login, hide admin
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

        // At this point, the user is authenticated AND has the admin role.
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

function openResourceEditor(id, data) {
    editingResourceId = id;
    showElement(resourceEditor);

    resourceForm.innerHTML = "";
    Object.keys(data).forEach(key => {
        const input = document.createElement("textarea");
        input.value = data[key] ?? "";
        input.dataset.field = key;
        input.placeholder = key;
        input.className = "resource-field";
        resourceForm.appendChild(input);
    });
}

addResourceBtn.onclick = () => {
    editingResourceId = null;
    showElement(resourceEditor);
    resourceForm.innerHTML = "";

    const fields = [
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

    fields.forEach(f => {
        const input = document.createElement("textarea");
        input.placeholder = f;
        input.dataset.field = f;
        input.className = "resource-field";
        resourceForm.appendChild(input);
    });
};

saveResourceBtn.onclick = async () => {
    const obj = {};
    resourceForm.querySelectorAll("textarea").forEach(t => {
        obj[t.dataset.field] = t.value;
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

    try {
        const querySnap = await getDocs(collection(db, "categories"));
        categoryList.innerHTML = "";

        querySnap.forEach(docSnap => {
            const data = docSnap.data();
            const row = document.createElement("div");
            row.className = "list-row category-row";
            row.textContent = data.name || "(No Category Name)";
            row.onclick = () => openCategoryEditor(docSnap.id, data);
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
