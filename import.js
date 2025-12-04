// import.js — one-time importer for data.json + categories.json into Firestore

import { db } from "./firebase.js";
import {
    collection,
    addDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Simple logging utility to the page
const logEl = document.getElementById("log");
function log(message) {
    const ts = new Date().toISOString();
    logEl.textContent += `[${ts}] ${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
}

// Disable/enable all import buttons while work is in progress
const btnResources = document.getElementById("import-resources-btn");
const btnCategories = document.getElementById("import-categories-btn");
const btnAll = document.getElementById("import-all-btn");

function setButtonsDisabled(disabled) {
    [btnResources, btnCategories, btnAll].forEach(btn => {
        if (!btn) return;
        btn.disabled = disabled;
    });
}

// Generic loader for local JSON files
async function loadJson(path) {
    const resp = await fetch(path);
    if (!resp.ok) {
        throw new Error(`Failed to fetch ${path}: ${resp.status} ${resp.statusText}`);
    }
    return await resp.json();
}

// ------------------------------
// IMPORT RESOURCES (data.json)
// ------------------------------
async function importResources() {
    log("Starting import of resources from data.json ...");

    const data = await loadJson("data.json"); // existing file used by app.js :contentReference[oaicite:3]{index=3}

    if (!Array.isArray(data)) {
        throw new Error("data.json is not an array. Cannot import.");
    }

    log(`Found ${data.length} resources in data.json.`);

    const resourcesCol = collection(db, "resources");

    let count = 0;
    for (const resource of data) {
        // Expect resource shape to match your current JSON:
        // { Organization, Description, Address, City, Zip, Phone, Website, Categories, Subcategories, Email, Hours, Eligibility, Cost, Notes, "Last Verified", Keywords, UpdatedBy } :contentReference[oaicite:4]{index=4}
        await addDoc(resourcesCol, resource);
        count++;
        if (count % 20 === 0) {
            log(`Imported ${count} resources...`);
        }
    }

    log(`Finished importing resources. Total imported: ${count}.`);
}

// ---------------------------------------------
// IMPORT CATEGORIES (categories.json → docs)
// ---------------------------------------------
async function importCategories() {
    log("Starting import of categories from categories.json ...");

    const rawCats = await loadJson("categories.json"); // used by app.js init() for filters :contentReference[oaicite:5]{index=5}

    // We mirror the structure detection logic from app.js:
    //  - Structure A: { categories: [...], subcategories: { "Category": ["Sub1", ...], ... } }
    //  - Structure B: { "Category Name": ["Sub1", "Sub2"], ... }
    let categoryLabels = [];
    let rawSubcategories = {};

    if (rawCats && Array.isArray(rawCats.categories)) {
        // Structure A
        categoryLabels = rawCats.categories;
        rawSubcategories = rawCats.subcategories || {};
    } else if (rawCats && typeof rawCats === "object") {
        // Structure B
        categoryLabels = Object.keys(rawCats);
        rawSubcategories = rawCats;
    } else {
        throw new Error("categories.json is in an unexpected format.");
    }

    log(`Detected ${categoryLabels.length} category labels.`);

    const categoriesCol = collection(db, "categories");
    let count = 0;

    for (const catLabel of categoryLabels) {
        if (!catLabel || typeof catLabel !== "string") continue;

        const labelTrimmed = catLabel.trim();
        const subsRaw = Array.isArray(rawSubcategories[catLabel])
            ? rawSubcategories[catLabel]
            : [];

        const subcategories = subsRaw
            .map(s => String(s || "").trim())
            .filter(s => s.length > 0);

        const docData = {
            name: labelTrimmed,
            subcategories
        };

        // admin.js expects documents of the shape { name, subcategories: [...] } :contentReference[oaicite:6]{index=6}
        await addDoc(categoriesCol, docData);
        count++;

        if (count % 10 === 0) {
            log(`Imported ${count} categories...`);
        }
    }

    log(`Finished importing categories. Total imported: ${count}.`);
}

// ------------------------------
// BUTTON WIRING
// ------------------------------
btnResources.addEventListener("click", async () => {
    try {
        setButtonsDisabled(true);
        await importResources();
        log("Resources import complete.");
    } catch (err) {
        console.error(err);
        log(`ERROR during resources import: ${err.message}`);
    } finally {
        setButtonsDisabled(false);
    }
});

btnCategories.addEventListener("click", async () => {
    try {
        setButtonsDisabled(true);
        await importCategories();
        log("Categories import complete.");
    } catch (err) {
        console.error(err);
        log(`ERROR during categories import: ${err.message}`);
    } finally {
        setButtonsDisabled(false);
    }
});

btnAll.addEventListener("click", async () => {
    try {
        setButtonsDisabled(true);
        log("Running full import: resources THEN categories...");
        await importResources();
        await importCategories();
        log("Full import complete.");
    } catch (err) {
        console.error(err);
        log(`ERROR during full import: ${err.message}`);
    } finally {
        setButtonsDisabled(false);
    }
});
