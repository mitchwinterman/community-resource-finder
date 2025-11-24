// -----------------------------
// Data loaders
// -----------------------------
async function loadData() {
    try {
        const response = await fetch("data.json");
        if (!response.ok) throw new Error("Bad response");
        return await response.json();
    } catch (err) {
        console.error("DATA LOAD ERROR:", err);
        showError("Error loading resources.");
        return [];
    }
}

async function loadCategories() {
    try {
        const response = await fetch("categories.json");
        if (!response.ok) throw new Error("Bad response for categories");
        return await response.json();
    } catch (err) {
        console.error("CATEGORY LOAD ERROR:", err);
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

const resultsDiv = document.getElementById("results");
const detailsDiv = document.getElementById("details");

// -----------------------------
// ERROR HANDLER
// -----------------------------
function showError(message) {
    resultsDiv.innerHTML = `<div class="result-card">${message}</div>`;
}

// -----------------------------
// DISPLAY CAPITALIZATION FIXES
// -----------------------------

// Properly formats categories/subcategories for display
function prettyLabel(str) {
    if (!str) return "";

    return str
        .split(" ")
        .map(word => {
            const upper = word.toUpperCase();
            // Words that should remain fully uppercase (acronyms)
            const ACRONYMS = ["SSI", "SSDI", "ENT", "HIV", "SNAP", "TANF"];
            if (ACRONYMS.includes(upper)) return upper;

            // Otherwise capitalize only the first letter
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(" ");
}

// -----------------------------
// RENDERING FUNCTIONS
// -----------------------------
function renderList(data) {
    resultsDiv.innerHTML = "";

    if (!data || data.length === 0) {
        resultsDiv.innerHTML = `<div class="result-card">No results found.</div>`;
        return;
    }

    data.forEach(item => {
        const card = document.createElement("div");
        card.className = "result-card";
        card.innerHTML = `
            <div><strong>${item.Organization || "No name"}</strong></div>
            <div>${item.Description || ""}</div>
        `;
        card.onclick = () => renderDetails(item);
        resultsDiv.appendChild(card);
    });
}

function renderDetails(item) {
    const website = item.Website ? String(item.Website).trim() : "";
    const websiteHref = website
        ? (website.startsWith("http") ? website : "https://" + website)
        : "";

    detailsDiv.innerHTML = `
        <div class="details-title">${item.Organization || "No name"}</div>

        <div class="details-field"><strong>Description:</strong> ${item.Description || ""}</div>
        <div class="details-field"><strong>Address:</strong> ${item.Address || ""}</div>
        <div class="details-field"><strong>City:</strong> ${item.City || ""}</div>
        <div class="details-field"><strong>Zip:</strong> ${item.Zip || ""}</div>
        <div class="details-field"><strong>Phone:</strong> ${item.Phone || ""}</div>
        <div class="details-field"><strong>Email:</strong> ${item.Email || ""}</div>

        <div class="details-field"><strong>Website:</strong> ${
            websiteHref ? `<a href="${websiteHref}" target="_blank" rel="noopener noreferrer">${website}</a>` : ""
        }</div>

        <div class="details-field"><strong>Categories:</strong> ${
            prettyLabel(item.Categories)
        }</div>

        <div class="details-field"><strong>Subcategories:</strong> ${
            prettyLabel(item.Subcategories)
        }</div>

        <div class="details-field"><strong>Eligibility:</strong> ${item.Eligibility || ""}</div>
        <div class="details-field"><strong>Hours:</strong> ${item.Hours || ""}</div>
        <div class="details-field"><strong>Cost:</strong> ${item.Cost || ""}</div>
        <div class="details-field"><strong>Last Verified:</strong> ${item["Last Verified"] || ""}</div>
        <div class="details-field"><strong>Keywords:</strong> ${item.Keywords || ""}</div>
        <div class="details-field"><strong>Notes:</strong> ${item.Notes || ""}</div>
    `;
}

// -----------------------------
// HELPERS
// -----------------------------
function buildHaystack(item) {
    const copy = { ...item };
    delete copy.UpdatedBy;

    return Object.values(copy)
        .filter(v => v !== null && v !== undefined && String(v).trim() !== "")
        .join(" | ")
        .toLowerCase();
}

function parseCsvField(value) {
    if (!value) return [];
    return String(value)
        .split(",")
        .map(v => v.trim())
        .filter(v => v.length > 0);
}

// -----------------------------
// FILTERING
// -----------------------------
function applyFilters() {
    if (!Array.isArray(globalData)) {
        renderList([]);
        return;
    }

    const keyword = (searchInput.value || "").trim().toLowerCase();
    const selectedCategory = categorySelect.value;
    const selectedSub = subcategorySelect.value;

    const filtered = globalData.filter(item => {
        const itemCats = parseCsvField(item.Categories).map(c => c.toLowerCase());
        const itemSubs = parseCsvField(item.Subcategories).map(s => s.toLowerCase());

        if (selectedCategory !== "all" && !itemCats.includes(selectedCategory)) {
            return false;
        }

        if (selectedSub !== "all" && !itemSubs.includes(selectedSub)) {
            return false;
        }

        if (keyword && !buildHaystack(item).includes(keyword)) {
            return false;
        }

        return true;
    });

    renderList(filtered);
}

// -----------------------------
// FILTER POPULATION
// -----------------------------
function resetSubcategoryFilter() {
    subcategorySelect.innerHTML = `<option value="all">All subcategories</option>`;
    subcategorySelect.disabled = true;
}

function populateCategoryFilter() {
    while (categorySelect.options.length > 1) {
        categorySelect.remove(1);
    }

    const cats = Object.keys(categoryMap).sort();
    cats.forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat.toLowerCase();
        opt.textContent = prettyLabel(cat);
        categorySelect.appendChild(opt);
    });
}

function populateSubcategoryFilterForCategory(category) {
    resetSubcategoryFilter();

    const key = category.toLowerCase();
    const subs = categoryMap[key] || [];

    subs.forEach(sub => {
        const opt = document.createElement("option");
        opt.value = sub.toLowerCase();
        opt.textContent = prettyLabel(sub);
        subcategorySelect.appendChild(opt);
    });

    if (subs.length > 0) {
        subcategorySelect.disabled = false;
    }
}

// -----------------------------
// RESET BUTTON
// -----------------------------
function resetAll() {
    searchInput.value = "";
    categorySelect.value = "all";
    resetSubcategoryFilter();

    detailsDiv.innerHTML = `
        <div style="text-align:center; color:#666;">
            Select a resource<br>
            <small>Use the search bar or filters above to find a resource, then click to view full details.</small>
        </div>
    `;

    applyFilters();
}

// -----------------------------
// GLOBAL STATE
// -----------------------------
let globalData = [];
let categoryMap = {};

// -----------------------------
// INITIAL LOAD
// -----------------------------
async function init() {
    resultsDiv.innerHTML = `<div class="result-card">Loading…</div>`;

    const [data, cats] = await Promise.all([loadData(), loadCategories()]);
    globalData = Array.isArray(data) ? data : [];

    // Normalize keys only (NOT display)
    const normalized = {};
    for (const key in cats) {
        normalized[key.toLowerCase()] = cats[key];
    }
    categoryMap = normalized;

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

// -----------------------------
// Start app
// -----------------------------
init();
