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

// --- FIX FOR ISSUE 2: Capitalization ---
// Expanded list to catch acronyms when they are part of a longer phrase.
const specialSubcategoryCaps = {
    "aba": "ABA",
    "foster care": "Foster Care",
    "hiv": "HIV",
    "hiv services": "HIV Services",
    "hiv testing": "HIV Testing", // ADDED
    "hud-vash": "HUD-VASH",
    "snap/food stamps": "SNAP/Food Stamps",
    "psyc": "PSYC",
    "psychosocial rehab (psr)": "Psychosocial Rehab (PSR)",
    "ssdi": "SSDI",
    "ssdi benefits": "SSDI Benefits", // ADDED
    "ssi": "SSI",
    "ssi eligibility": "SSI Eligibility", // ADDED
    "tanf": "TANF",
    "wic": "WIC",
    "lgbtq+": "LGBTQ+",
    "lgbtqia+": "LGBTQIA+"
};

function formatSubcategoryLabel(label) {
    const lower = label.toLowerCase();
    
    // 1. Check if the entire lowercase label is in the special caps map
    if (specialSubcategoryCaps[lower]) {
        return specialSubcategoryCaps[lower];
    }

    // 2. Fallback to title-casing logic (assuming standard Title Case function is present or similar)
    // NOTE: If you have a title-case function, it should be here. 
    // For simplicity and based on context, we assume a basic capitalization for non-special cases:
    if (label && typeof label === 'string') {
        return label.split(' ').map(word => {
            if (word.length > 0) {
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
            return '';
        }).join(' ');
    }

    return label;
}

function renderResults(resources) {
    resultsDiv.innerHTML = '';
    detailsDiv.innerHTML = '<small>Select a resource from the list to view its details.</small>';
    selectedResourceId = null;

    if (resources.length === 0) {
        resultsDiv.innerHTML = '<div class="no-results">No resources found matching the current filters.</div>';
        return;
    }

    resources.forEach(resource => {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.innerHTML = `
            <div class="card-title">${resource.Organization}</div>
            <div class="card-description">${resource.Description}</div>
        `;
        card.onclick = () => showDetails(resource);
        resultsDiv.appendChild(card);
    });

    // Automatically select the first resource if none is selected
    if (resources.length > 0) {
        showDetails(resources[0]);
    }
}

function showDetails(resource) {
    selectedResourceId = resource.Organization; // Using Organization as unique ID
    
    // Deselect previous card and select current
    document.querySelectorAll('.result-card').forEach(card => card.classList.remove('selected'));
    const currentCard = Array.from(resultsDiv.querySelectorAll('.result-card')).find(card => 
        card.querySelector('.card-title').textContent === resource.Organization
    );
    if (currentCard) {
        currentCard.classList.add('selected');
    }

    detailsDiv.innerHTML = `
        <h2 class="details-title">${resource.Organization}</h2>
        <p class="details-section">${resource.Description}</p>
        
        <div class="details-row">
            <div><strong>Categories:</strong> ${resource.Categories}</div>
            <div><strong>Subcategories:</strong> ${resource.Subcategories}</div>
        </div>

        <div class="details-row">
            <div><strong>Phone:</strong> ${resource.Phone || 'N/A'}</div>
            <div><strong>Email:</strong> ${resource.Email || 'N/A'}</div>
        </div>

        <div><strong>Address:</strong> ${resource.Address ? `${resource.Address}, ${resource.City}` : 'N/A'}</div>
        
        ${resource.Website ? `<div><a href="${resource.Website}" target="_blank" class="details-link">Visit Website</a></div>` : ''}
        
        <p class="details-section"><strong>Hours:</strong> ${resource.Hours || 'Varies'}</p>
        <p class="details-section"><strong>Eligibility:</strong> ${resource.Eligibility || 'None specified'}</p>
        <p class="details-section"><strong>Cost:</strong> ${resource.Cost || 'None specified'}</p>
        <p class="details-section"><strong>Notes:</strong> ${resource.Notes || 'None'}</p>
        <p class="details-small">Last Verified: ${resource['Last Verified'] || 'N/A'}</p>
    `;
}

function showError(message) {
    resultsDiv.innerHTML = `<div class="error">${message}</div>`;
}


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
    subcategorySelect.disabled = (categoryValue === 'all');
    
    if (categoryValue !== 'all' && subcategoryOptions[categoryValue]) {
        subcategoryOptions[categoryValue].forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.value;
            opt.textContent = option.label;
            subcategorySelect.appendChild(opt);
        });
    }
    // Set selection back to 'all' if the current selected sub is no longer available
    if (subcategorySelect.value !== 'all' && !subcategoryOptions[categoryValue].find(o => o.value === subcategorySelect.value)) {
        subcategorySelect.value = 'all';
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
    const searchTerm = searchInput.value.toLowerCase();
    const categoryFilter = categorySelect.value;
    const subcategoryFilter = subcategorySelect.value;
    
    let filteredData = globalData.filter(resource => {
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

        // 2. CATEGORY FILTER (FIX FOR ISSUE 1: Robust Category Match)
        if (categoryFilter !== 'all') {
            // Normalize the resource's category string into an array of lowercased, trimmed category names
            const resourceCategories = resource.Categories
                .split(',')
                .map(c => c.trim().toLowerCase());

            // Check if the selected category value is an exact match in the resource's array
            if (!resourceCategories.includes(categoryFilter)) {
                return false;
            }
        }

        // 3. SUBCATEGORY FILTER
        if (subcategoryFilter !== 'all') {
            // Normalize the resource's subcategory string into an array of lowercased, trimmed subcategory names
            const resourceSubcategories = resource.Subcategories
                .split(',')
                .map(s => s.trim().toLowerCase());

            // Check if the selected subcategory value is an exact match
            if (!resourceSubcategories.includes(subcategoryFilter)) {
                return false;
            }
        }

        return true;
    });

    renderResults(filteredData);
}

// -----------------------------
// INIT
// -----------------------------
async function init() {
    // Load Data
    globalData = await loadData();
    if (globalData.length === 0) return;

    // Load Categories & Subcategories
    const rawData = await loadCategories();
    const rawCategories = Array.isArray(rawData.categories) ? rawData.categories : [];
    const rawSubcategories = rawData.subcategories || rawData; // Support older/simpler JSON structure

    // Build categoryOptions and subcategoryOptions with normalized values
    categoryOptions = [];
    subcategoryOptions = {};

    // Get a unique list of category labels to iterate over, either from rawCategories (if simple array) 
    // or from the keys of rawSubcategories (if it's the full JSON object)
    const categoryLabels = rawCategories.length > 0 ? rawCategories : Object.keys(rawSubcategories);

    categoryLabels.forEach(catLabel => {
        if (!catLabel || typeof catLabel !== "string") return;
        const labelTrimmed = catLabel.trim();
        const valueLower = labelTrimmed.toLowerCase();

        categoryOptions.push({
            label: labelTrimmed,
            value: valueLower
        });

        // Get subcategories for the current category label
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
