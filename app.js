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

        <div class="details-field"><strong>Categories:</strong> ${item.Categories || ""}</div>
        <div class="details-field"><strong>Subcategories:</strong> ${item.Subcategories || ""}</div>

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
function normalizeToken(str) {
    return String(str)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

const ACRONYMS = new Set(["ent", "hiv", "std", "ssdi", "ssi", "wic", "snap", "lgbtq"]);

function formatLabel(label) {
    if (!label) return "";
    const s = String(label);

    // Split into words and separators (spaces, /, &, ,)
    return s.split(/(\s+|\/|&|,)/).map(part => {
        // Keep separators as-is
        if (/^\s+$/.test(part) || part === "/" || part === "&" || part === ",") {
            return part;
        }

        // Strip non-letters for acronym check
        const lettersOnly = part.replace(/[^a-z]/gi, "").toLowerCase();
        if (ACRONYMS.has(lettersOnly)) {
            // Uppercase only letters, keep any trailing punctuation
            const letters = part.replace(/[^a-z]/gi, "").toUpperCase();
            const rest = part.slice(letters.length);
            return letters + rest;
        }

        // Default: keep original casing from JSON
        return part;
    }).join("");
}

function buildHaystack(item) {
    const copy = { ...item };
    delete copy.UpdatedBy; // not searchable

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
    const selectedCategory = categorySelect.value;   // "all" or normalized category key
    const selectedSub = subcategorySelect.value;     // "all" or normalized subcategory key

    const filtered = globalData.filter(item => {
        const itemCats = parseCsvField(item.Categories).map(normalizeToken);
        const itemSubs = parseCsvField(item.Subcategories).map(normalizeToken);

        // Category filter
        if (selectedCategory !== "all" && !itemCats.includes(selectedCategory)) {
            return false;
        }

        // Subcategory filter
        if (selectedSub !== "all" && !itemSubs.includes(selectedSub)) {
            return false;
        }

        // Full text search
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

// Clears subcategory dropdown back to "All subcategories" and disables it
function resetSubcategoryFilter() {
    subcategorySelect.innerHTML = `<option value="all">All subcategories</option>`;
    subcategorySelect.disabled = true;
}

// Populates category dropdown using labels from categories.json,
// but uses normalized lowercase values internally for matching.
function populateCategoryFilter() {
    while (categorySelect.options.length > 1) {
        categorySelect.remove(1);
    }

    // categoryOptions array already sorted by label
    categoryOptions.forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat.value;       // normalized lowercase key
        opt.textContent = cat.label; // exact casing from JSON
        categorySelect.appendChild(opt);
    });
}

// Populates subcategory dropdown for the given normalized lowercase category key
function populateSubcategoryFilterForCategory(categoryLower) {
    resetSubcategoryFilter();

    if (!categoryLower || categoryLower === "all") return;

    const subs = subcategoryMap[categoryLower] || [];

    subs.forEach(sub => {
        const opt = document.createElement("option");
        opt.value = sub.value;       // normalized lowercase
        opt.textContent = sub.label; // formatted label (HIV, SSI, SSDI, ENT, etc.)
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
    // Clear search and filters
    searchInput.value = "";
    categorySelect.value = "all";
    resetSubcategoryFilter();

    // Restore default details panel message
    detailsDiv.innerHTML = `
        <div style="text-align:center; color:#666;">
            Select a resource<br>
            <small>Use the search bar or filters above to find a resource, then click to view full details.</small>
        </div>
    `;

    // Re-render full list
    applyFilters();
}

// -----------------------------
// GLOBAL STATE
// -----------------------------
let globalData = [];

// categoryOptions: [{ value: normalizedKey, label: "Health & Medical" }, ...]
let categoryOptions = [];

// subcategoryMap: { normalizedCategoryKey: [ { value:"ssdi", label:"SSDI" }, ... ] }
let subcategoryMap = {};

// -----------------------------
// INITIAL LOAD
// -----------------------------
async function init() {
    resultsDiv.innerHTML = `<div class="result-card">Loading…</div>`;

    const [data, cats] = await Promise.all([loadData(), loadCategories()]);
    globalData = Array.isArray(data) ? data : [];

    // Build categoryOptions and subcategoryMap from categories.json
    categoryOptions = [];
    subcategoryMap = {};

    Object.entries(cats || {}).forEach(([catLabel, subList]) => {
        const catKey = normalizeToken(catLabel);

        // Store category option
        categoryOptions.push({
            value: catKey,
            label: catLabel
        });

        // Store subcategories for this category
        const subsArray = Array.isArray(subList) ? subList : [];
        subcategoryMap[catKey] = subsArray
            .map(subLabel => ({
                value: normalizeToken(subLabel),
                label: formatLabel(subLabel)
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    });

    // Sort categories alphabetically by label
    categoryOptions.sort((a, b) => a.label.localeCompare(b.label));

    populateCategoryFilter();
    resetSubcategoryFilter();
    applyFilters();
}

// -----------------------------
// EVENT LISTENERS
// -----------------------------
searchInput.addEventListener("input", applyFilters);

categorySelect.addEventListener("change", () => {
    const catKey = categorySelect.value; // normalized key or "all"
    populateSubcategoryFilterForCategory(catKey);
    applyFilters();
});

subcategorySelect.addEventListener("change", applyFilters);

resetButton.addEventListener("click", resetAll);

// -----------------------------
// Start app
// -----------------------------
init();
