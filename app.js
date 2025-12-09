// app.js — frontend for Community Resource Finder (Firestore-backed)

import { db } from "./firebase.js";
import {
    collection,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// -----------------------------
// Data loaders (Firestore)
// -----------------------------
async function loadData() {
    try {
        const snap = await getDocs(collection(db, "resources"));
        const list = [];
        snap.forEach(docSnap => {
            const data = docSnap.data();
            list.push(data);
        });
        return list;
    } catch (err) {
        console.error("DATA LOAD ERROR (Firestore resources):", err);
        showError("Error loading resources.");
        return [];
    }
}

async function loadCategories() {
    try {
        const snap = await getDocs(collection(db, "categories"));
        // Build structure like: { "Category Name": ["Sub1", "Sub2"], ... }
        const rawCats = {};
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const name = (data.name || "").trim();
            if (!name) return;
            const subs = Array.isArray(data.subcategories) ? data.subcategories : [];
            rawCats[name] = subs;
        });
        return rawCats;
    } catch (err) {
        console.error("CATEGORY LOAD ERROR (Firestore categories):", err);
        return {};
    }
}

// -----------------------------
// DOM ELEMENTS
// -----------------------------
const searchInput = document.getElementById("searchBox");
const categorySelect = document.getElementById("categorySelect");
const subcategorySelect = document.getElementById("subcategorySelect");
const resetButton = document.getElementById("resetButton");
const titleEl = document.getElementById("app-title");
const brandHomeEl = document.getElementById("brand-home");

const resultsDiv = document.getElementById("results");
const detailsDiv = document.getElementById("details");
const resultCountEl = document.getElementById("resultCount");

// -----------------------------
// GLOBAL STATE
// -----------------------------
let globalData = [];
let categoryOptions = [];      // [{ value, label }]
let subcategoryOptions = {};   // { categoryValueLower: [{ value, label }, ...] }
let selectedResourceId = null;

// -----------------------------
// HELPER FUNCTIONS
// -----------------------------

// Capitalization overrides for certain subcategories
const specialSubcategoryCaps = {
    "aba": "ABA",
    "foster care": "Foster Care",
    "hiv": "HIV",
    "hiv services": "HIV Services",
    "hiv testing": "HIV Testing",
    "hud-vash": "HUD-VASH",
    "snap/food stamps": "SNAP/Food Stamps",
    "psyc": "PSYC",
    "psychosocial rehab (psr)": "Psychosocial Rehab (PSR)",
    "ssdi": "SSDI",
    "ssdi benefits": "SSDI Benefits",
    "ssi": "SSI",
    "ssi eligibility": "SSI Eligibility",
    "tanf": "TANF",
    "wic": "WIC",
    "lgbtq+": "LGBTQ+",
    "lgbtqia+": "LGBTQIA+"
};

function formatSubcategoryLabel(label) {
    if (!label) return "";
    const lower = label.toLowerCase();
    if (specialSubcategoryCaps[lower]) {
        return specialSubcategoryCaps[lower];
    }
    return label;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sortByOrganizationInPlace(list) {
    list.sort((a, b) => {
        const nameA = (a.Organization || "").toLowerCase();
        const nameB = (b.Organization || "").toLowerCase();
        if (nameA < nameB) return -1;
        if (nameA > nameB) return 1;
        return 0;
    });
}

function updateResultCount(count) {
    if (!resultCountEl) return;
    resultCountEl.textContent = `${count} result${count === 1 ? "" : "s"}`;
}

function renderResults(resources) {
    resultsDiv.innerHTML = '';

    // Reset details panel to instructions (no auto-select)
    detailsDiv.innerHTML = `
        <div class="details-empty">
            Select a resource<br>
            <small>Use the search bar or filters above to find a resource, then click to view full details.</small>
        </div>
    `;

    selectedResourceId = null;

    updateResultCount(resources.length);

    if (resources.length === 0) {
        resultsDiv.innerHTML = '<div class="result-card">No results found.</div>';
        return;
    }

    resources.forEach(resource => {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `
            <div class="card-title"><strong>${resource.Organization}</strong></div>
            <div class="card-description">${resource.Description || ""}</div>
        `;
        card.onclick = () => showDetails(resource);
        resultsDiv.appendChild(card);
    });
}

function showDetails(resource) {
    // Highlight selected card
    const cards = document.querySelectorAll('.result-card');
    cards.forEach(card => {
        card.style.background = "#f7f9ff";
        card.style.borderLeft = "none";

        const title = card.querySelector('.card-title').innerText;
        if (title === resource.Organization) {
            card.style.background = "#eef2ff";
            card.style.borderLeft = "4px solid #6a7cff";
        }
    });

    const website = resource.Website ? String(resource.Website).trim() : "";
    const websiteHref = website
        ? (website.startsWith("http") ? website : "https://" + website)
        : "";

    const formattedSubcategories = String(resource.Subcategories || "")
        .split(",")
        .map(v => v.trim())
        .filter(v => v.length > 0)
        .map(formatSubcategoryLabel)
        .join(", ");

    detailsDiv.innerHTML = `
        <div class="details-title">${resource.Organization || "No name"}</div>
        <div class="details-field"><strong>Description:</strong> ${resource.Description || ""}</div>
        
        <div class="details-field"><strong>Address:</strong> ${resource.Address || ""}</div>
        <div class="details-field"><strong>City:</strong> ${resource.City || ""}</div>
        <div class="details-field"><strong>Zip:</strong> ${resource.Zip || ""}</div>
        <div class="details-field"><strong>Phone:</strong> ${resource.Phone || ""}</div>
        <div class="details-field"><strong>Email:</strong> ${resource.Email || ""}</div>

        <div class="details-field"><strong>Website:</strong> ${
            websiteHref ? `<a href="${websiteHref}" target="_blank" rel="noopener noreferrer">${website}</a>` : ""
        }</div>

        <div class="details-field"><strong>Categories:</strong> ${resource.Categories || ""}</div>
        <div class="details-field"><strong>Subcategories:</strong> ${formattedSubcategories || ""}</div>

        <div class="details-field"><strong>Eligibility:</strong> ${resource.Eligibility || ""}</div>
        <div class="details-field"><strong>Hours:</strong> ${resource.Hours || ""}</div>
        <div class="details-field"><strong>Cost:</strong> ${resource.Cost || ""}</div>
        <div class="details-field"><strong>Last Verified:</strong> ${resource["Last Verified"] || ""}</div>
        <div class="details-field"><strong>Notes:</strong> ${resource.Notes || ""}</div>
    `;
}

function showError(message) {
    resultsDiv.innerHTML = `<div class="result-card">${message}</div>`;
    updateResultCount(0);
}

// -----------------------------
// FILTER POPULATION
// -----------------------------
function populateCategoryFilter() {
    categorySelect.innerHTML = '<option value="all">All categories</option>';

    categoryOptions.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option.value;
        opt.textContent = option.label;
        categorySelect.appendChild(opt);
    });
}

function populateSubcategoryFilterForCategory(categoryValue) {
    subcategorySelect.innerHTML = '<option value="all">All subcategories</option>';

    if (!categoryValue || categoryValue === 'all') {
        subcategorySelect.disabled = true;
        return;
    }

    const subs = subcategoryOptions[categoryValue];
    if (subs && subs.length > 0) {
        subcategorySelect.disabled = false;
        subs.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.textContent = option.label;
            subcategorySelect.appendChild(opt);
        });
    } else {
        subcategorySelect.disabled = true;
    }
}

function resetSubcategoryFilter() {
    subcategorySelect.value = 'all';
    subcategorySelect.innerHTML = '<option value="all">All subcategories</option>';
    subcategorySelect.disabled = true;
}

function resetAll() {
    searchInput.value = '';
    categorySelect.value = 'all';
    resetSubcategoryFilter();
    applyFilters();
}

// ------------------------------------
// MAIN FILTERING FUNCTION
// ------------------------------------
function applyFilters() {
    const searchTerm = (searchInput.value || "").trim().toLowerCase();
    const categoryFilter = categorySelect.value;
    const subcategoryFilter = subcategorySelect.value;

    const filteredData = globalData.filter(resource => {
        // 1. SEARCH FILTER
        if (searchTerm) {
            const searchFields = [
                resource.Organization,
                resource.Description,
                resource.Categories,
                resource.Subcategories,
                resource.Keywords
            ].join(' ').toLowerCase();

            if (!searchFields.includes(searchTerm)) {
                return false;
            }
        }

        // 2. CATEGORY FILTER
        if (categoryFilter !== 'all') {
            const escapedCat = escapeRegExp(categoryFilter);
            const regex = new RegExp(`(?:^|,)\\s*${escapedCat}\\s*(?:,|$)`, 'i');

            if (!regex.test(resource.Categories || "")) {
                return false;
            }
        }

        // 3. SUBCATEGORY FILTER
        if (subcategoryFilter !== 'all') {
            const escapedSub = escapeRegExp(subcategoryFilter);
            const regex = new RegExp(`(?:^|,)\\s*${escapedSub}\\s*(?:,|$)`, 'i');

            if (!regex.test(resource.Subcategories || "")) {
                return false;
            }
        }

        return true;
    });

    // Sort results by Organization before rendering
    sortByOrganizationInPlace(filteredData);
    renderResults(filteredData);
}

// -----------------------------
// INIT
// -----------------------------
async function init() {
    resultsDiv.innerHTML = '<div class="result-card">Loading…</div>';
    updateResultCount(0);

    const [data, rawCats] = await Promise.all([loadData(), loadCategories()]);
    globalData = Array.isArray(data) ? data : [];

    // Parse categories from object: { "Category Name": [subs...] }
    let categoryLabels = [];
    let rawSubcategories = {};

    if (rawCats && Array.isArray(rawCats.categories)) {
        // Old structure (kept for safety)
        categoryLabels = rawCats.categories;
        rawSubcategories = rawCats.subcategories || {};
    } else if (rawCats) {
        categoryLabels = Object.keys(rawCats);
        rawSubcategories = rawCats;
    }

    categoryOptions = [];
    subcategoryOptions = {};

    categoryLabels.forEach(catLabel => {
        if (!catLabel || typeof catLabel !== "string") return;
        const labelTrimmed = catLabel.trim();
        const valueLower = labelTrimmed.toLowerCase();

        categoryOptions.push({
            label: labelTrimmed,
            value: valueLower
        });

        const subs = Array.isArray(rawSubcategories[catLabel])
            ? rawSubcategories[catLabel]
            : [];

        subcategoryOptions[valueLower] = subs.map(subLabel => {
            const raw = String(subLabel || "").trim();
            return {
                value: raw.toLowerCase(),
                label: formatSubcategoryLabel(raw)
            };
        });
    });

    populateCategoryFilter();
    resetSubcategoryFilter();
    applyFilters();
}

// -----------------------------
// EVENT LISTENERS
// -----------------------------
searchInput.addEventListener("input", applyFilters);

categorySelect.addEventListener("change", () => {
    populateSubcategoryFilterForCategory(categorySelect.value);
    applyFilters();
});

subcategorySelect.addEventListener("change", applyFilters);

resetButton.addEventListener("click", resetAll);

// Center brand block and title both act as "home/reset"
function handleHomeClick() {
    resetAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

if (brandHomeEl) {
    brandHomeEl.addEventListener("click", handleHomeClick);
}
if (titleEl) {
    titleEl.addEventListener("click", handleHomeClick);
}

// -----------------------------
// Start app
// -----------------------------
init();
