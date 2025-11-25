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
// GLOBAL STATE
// -----------------------------
let globalData = [];
let categoryOptions = [];      // [{ value: "children, youth & family services", label: "Children, Youth & Family Services" }, ...]
let subcategoryOptions = {};   // { "children, youth & family services": [{ value, label }, ...] }
let selectedResourceId = null;

// -----------------------------
// HELPER FUNCTIONS
// -----------------------------

// --- FIX: Capitalization Map ---
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
    
    // 1. Check if the entire lowercase label is in the special caps map
    if (specialSubcategoryCaps[lower]) {
        return specialSubcategoryCaps[lower];
    }

    // 2. Simple fallback: return original label
    return label;
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderResults(resources) {
    resultsDiv.innerHTML = '';
    
    // RESET DETAILS PANEL TO INSTRUCTIONS (No Auto-Select)
    detailsDiv.innerHTML = `
        <div style="text-align:center; color:#666;">
            Select a resource<br>
            <small>Use the search bar or filters above to find a resource, then click to view full details.</small>
        </div>
    `;
    
    selectedResourceId = null;

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
    // Highlight selected card logic
    const cards = document.querySelectorAll('.result-card');
    cards.forEach(card => {
        // Reset all styles
        card.style.background = "#f7f9ff";
        card.style.borderLeft = "none";
        
        // Highlight matched card
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

    // Parse subcategories for display
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
}

// -----------------------------
// FILTER POPULATION
// -----------------------------
function populateCategoryFilter() {
    // Clear everything except "All categories"
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

        // 2. CATEGORY FILTER (REGEX FIX)
        // Uses Regex to handle categories with commas inside them (e.g. "Employment, Education...")
        if (categoryFilter !== 'all') {
            const escapedCat = escapeRegExp(categoryFilter);
            // Regex matches: Start-of-string OR comma, then whitespace, then category, then whitespace, then comma OR end-of-string
            const regex = new RegExp(`(?:^|,)\\s*${escapedCat}\\s*(?:,|$)`, 'i');
            
            if (!regex.test(resource.Categories)) {
                return false;
            }
        }

        // 3. SUBCATEGORY FILTER (REGEX FIX)
        if (subcategoryFilter !== 'all') {
            const escapedSub = escapeRegExp(subcategoryFilter);
            const regex = new RegExp(`(?:^|,)\\s*${escapedSub}\\s*(?:,|$)`, 'i');
            
            if (!regex.test(resource.Subcategories)) {
                return false;
            }
        }

        return true;
    });

    renderResults(filteredData);
}

// -----------------------------
// INIT (FIXED STRUCTURE DETECTION)
// -----------------------------
async function init() {
    resultsDiv.innerHTML = '<div class="result-card">Loading…</div>';

    // Load Data
    const [data, rawCats] = await Promise.all([loadData(), loadCategories()]);
    globalData = Array.isArray(data) ? data : [];

    // Parse Categories - Robust Check for Structure
    let categoryLabels = [];
    let rawSubcategories = {};

    if (rawCats && Array.isArray(rawCats.categories)) {
        // Structure A: { categories: [...], subcategories: {...} }
        // (Old format support)
        categoryLabels = rawCats.categories;
        rawSubcategories = rawCats.subcategories || {};
    } else if (rawCats) {
        // Structure B: { "Category Name": ["Sub1", "Sub2"] }
        // (Current file format)
        categoryLabels = Object.keys(rawCats);
        rawSubcategories = rawCats;
    }

    // Build Options
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

        // Get subcategories
        const subs = Array.isArray(rawSubcategories[catLabel])
            ? rawSubcategories[catLabel]
            : [];

        // Build normalized subcategory list
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

// -----------------------------
// Start app
// -----------------------------
init();
