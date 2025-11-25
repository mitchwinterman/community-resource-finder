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
    deleteDoc,
    setDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// DOM
const loginScreen = document.getElementById("login-screen");
const adminScreen = document.getElementById("admin-screen");

const emailInput = document.getElementById("email");
const passInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loginError = document.getElementById("login-error");

// Panels
const resourcePanel = document.getElementById("panel-resources");
const categoryPanel = document.getElementById("panel-categories");

const navBtns = document.querySelectorAll(".nav-btn");

// Resources
const resourceList = document.getElementById("resource-list");
const resourceEditor = document.getElementById("resource-editor");
const resourceForm = document.getElementById("resource-form");
const addResourceBtn = document.getElementById("add-resource-btn");
const saveResourceBtn = document.getElementById("save-resource-btn");
const deleteResourceBtn = document.getElementById("delete-resource-btn");
const cancelResourceBtn = document.getElementById("cancel-resource-btn");

let editingResourceId = null;

// Categories
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

// ------------------------------------------------------
// LOGIN / LOGOUT
// ------------------------------------------------------
loginBtn.onclick = async () => {
    try {
        await signInWithEmailAndPassword(auth, emailInput.value, passInput.value);
        loginError.textContent = "";
    } catch (err) {
        loginError.textContent = "Login failed.";
    }
};

logoutBtn.onclick = () => signOut(auth);

onAuthStateChanged(auth, user => {
    if (user) {
        loginScreen.classList.add("hidden");
        adminScreen.classList.remove("hidden");
        loadResources();
        loadCategories();
    } else {
        adminScreen.classList.add("hidden");
        loginScreen.classList.remove("hidden");
    }
});

// ------------------------------------------------------
// PANEL SWITCHING
// ------------------------------------------------------
navBtns.forEach(btn => {
    btn.onclick = () => {
        const target = btn.dataset.panel;
        resourcePanel.classList.add("hidden");
        categoryPanel.classList.add("hidden");

        if (target === "resources") {
            resourcePanel.classList.remove("hidden");
        }
        if (target === "categories") {
            categoryPanel.classList.remove("hidden");
        }
    };
});

// ------------------------------------------------------
// RESOURCE MANAGEMENT
// ------------------------------------------------------
async function loadResources() {
    resourceList.innerHTML = "Loading…";
    const query = await getDocs(collection(db, "resources"));
    resourceList.innerHTML = "";

    query.forEach(docSnap => {
        const data = docSnap.data();
        const row = document.createElement("div");
        row.textContent = data.Organization;
        row.onclick = () => openResourceEditor(docSnap.id, data);
        resourceList.appendChild(row);
    });
}

function openResourceEditor(id, data) {
    editingResourceId = id;
    resourceEditor.classList.remove("hidden");

    resourceForm.innerHTML = "";
    Object.keys(data).forEach(key => {
        const input = document.createElement("textarea");
        input.value = data[key];
        input.dataset.field = key;
        input.placeholder = key;
        resourceForm.appendChild(input);
    });
}

addResourceBtn.onclick = () => {
    editingResourceId = null;
    resourceEditor.classList.remove("hidden");
    resourceForm.innerHTML = "";

    const fields = [
        "Organization", "Description", "Address", "City", "Zip",
        "Phone", "Email", "Website", "Categories", "Subcategories",
        "Eligibility", "Hours", "Cost", "Last Verified",
        "Keywords", "Notes"
    ];

    fields.forEach(f => {
        const input = document.createElement("textarea");
        input.placeholder = f;
        input.dataset.field = f;
        resourceForm.appendChild(input);
    });
};

saveResourceBtn.onclick = async () => {
    const obj = {};
    document.querySelectorAll("#resource-form textarea").forEach(t => {
        obj[t.dataset.field] = t.value;
    });

    if (editingResourceId) {
        await updateDoc(doc(db, "resources", editingResourceId), obj);
    } else {
        await addDoc(collection(db, "resources"), obj);
    }

    resourceEditor.classList.add("hidden");
    loadResources();
};

deleteResourceBtn.onclick = async () => {
    if (!editingResourceId) return;
    await deleteDoc(doc(db, "resources", editingResourceId));
    resourceEditor.classList.add("hidden");
    loadResources();
};

cancelResourceBtn.onclick = () => {
    resourceEditor.classList.add("hidden");
};

// ------------------------------------------------------
// CATEGORY + SUBCATEGORY MANAGEMENT
// ------------------------------------------------------
async function loadCategories() {
    categoryList.innerHTML = "Loading…";
    const query = await getDocs(collection(db, "categories"));
    categoryList.innerHTML = "";

    query.forEach(docSnap => {
        const data = docSnap.data();
        const row = document.createElement("div");
        row.textContent = data.name;
        row.onclick = () => openCategoryEditor(docSnap.id, data);
        categoryList.appendChild(row);
    });
}

addCategoryBtn.onclick = () => {
    editingCategoryId = null;
    categoryEditor.classList.remove("hidden");
    categoryNameInput.value = "";
    subList.innerHTML = "";
};

function openCategoryEditor(id, data) {
    editingCategoryId = id;
    categoryEditor.classList.remove("hidden");

    categoryNameInput.value = data.name;
    subList.innerHTML = "";

    (data.subcategories || []).forEach(sub => addSubRow(sub));
}

addSubBtn.onclick = () => addSubRow("");

function addSubRow(value) {
    const row = document.createElement("div");
    const input = document.createElement("input");
    input.value = value;

    const del = document.createElement("button");
    del.textContent = "X";
    del.onclick = () => row.remove();

    row.appendChild(input);
    row.appendChild(del);
    subList.appendChild(row);
}

saveCategoryBtn.onclick = async () => {
    const name = categoryNameInput.value.trim();
    const subs = [...subList.querySelectorAll("input")].map(i => i.value.trim()).filter(v => v);

    const obj = { name, subcategories: subs };

    if (editingCategoryId) {
        await updateDoc(doc(db, "categories", editingCategoryId), obj);
    } else {
        await addDoc(collection(db, "categories"), obj);
    }

    categoryEditor.classList.add("hidden");
    loadCategories();
};

deleteCategoryBtn.onclick = async () => {
    if (!editingCategoryId) return;
    await deleteDoc(doc(db, "categories", editingCategoryId));
    categoryEditor.classList.add("hidden");
    loadCategories();
};

cancelCategoryBtn.onclick = () => {
    categoryEditor.classList.add("hidden");
};
