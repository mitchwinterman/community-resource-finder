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
let subcategoryOptions = {};   // { "children, youth & family services": [{ value, label }, ...], ... }

// -----------------------------
// SPECIAL CAPITALIZATION MAP
// -----------------------------
// Keys are LOWERCASED subcategory labels, values are display labels
const specialSubcategoryCaps = {
    "hiv": "HIV",
    "hiv services": "HIV Services",
    "hiv & std services": "HIV & STD Services",
    "ent": "ENT",
    "ssdi": "SSDI",
    "ssi": "SSI",
    "snap": "SNAP",
    "tanf": "TANF",
    "wic": "WIC"
};

function formatSubcategoryLabel(label) {
    if (!label) return "";
    const lower = String(label).trim().toLowerCase();
    if (specialSubcategoryCaps[lower]) {
        return specialSubcategoryCaps[lower];
    }
    // Fall back to whatever is in the source (usually already reasonably capitalized)
    return String(label).trim();
}

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

    const formattedSubcategories = parseCsvField(item.Subcategories)
        .map(formatSubcategoryLabel)
        .join(", ");

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
        <div class="details-field"><strong>Subcategories:</strong> ${formattedSubcategories || ""}</div>

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
    const selectedCategory = (categorySelect.value || "all").trim().toLowerCase();
    const selectedSub = (subcategorySelect.value || "all").trim().toLowerCase();

    const filtered = globalData.filter(item => {
        const itemCats = parseCsvField(item.Categories).map(c => c.toLowerCase());
        const itemSubs = parseCsvField(item.Subcategories).map(s => s.toLowerCase());

        // CATEGORY FILTER
        if (selectedCategory !== "all" && !itemCats.includes(selectedCategory)) {
            return false;
        }

        // SUBCATEGORY FILTER
        if (selectedSub !== "all" && !itemSubs.includes(selectedSub)) {
            return false;
        }

        // FULL TEXT SEARCH
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
    // Clear everything except the "All categories" option
    while (categorySelect.options.length > 1) {
        categorySelect.remove(1);
    }

    // Use categoryOptions built from categories.json
    const sorted = [...categoryOptions].sort((a, b) =>
        a.label.localeCompare(b.label)
    );

    sorted.forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat.value;      // normalized lowercase value
        opt.textContent = cat.label; // nicely capitalized label from categories.json
        categorySelect.appendChild(opt);
    });
}

function populateSubcategoryFilterForCategory(categoryValue) {
    resetSubcategoryFilter();

    const key = (categoryValue || "").toLowerCase();
    if (!key || key === "all") {
        return;
    }

    const subsForCategory = subcategoryOptions[key] || [];

    if (subsForCategory.length === 0) {
        // No subcategories defined: leave disabled
        return;
    }

    subsForCategory
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label))
        .forEach(sub => {
            const opt = document.createElement("option");
            opt.value = sub.value;       // normalized lowercase value
            opt.textContent = sub.label; // formatted label (with special caps)
            subcategorySelect.appendChild(opt);
        });

    subcategorySelect.disabled = false;
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
// INITIAL LOAD
// -----------------------------
async function init() {
    resultsDiv.innerHTML = `<div class="result-card">Loading…</div>`;

    const [data, cats] = await Promise.all([loadData(), loadCategories()]);
    globalData = Array.isArray(data) ? data : [];

    // Expecting categories.json structure:
    // {
    //   "categories": ["Children, Youth & Family Services", ...],
    //   "subcategories": {
    //       "Children, Youth & Family Services": ["Developmental Delay", "Hiv Services", ...],
    //       ...
    //   }
    // }
    const rawCategories = cats && Array.isArray(cats.categories) ? cats.categories : [];
    const rawSubcategories = cats && cats.subcategories ? cats.subcategories : {};

    // Build categoryOptions and subcategoryOptions with normalized values
    categoryOptions = [];
    subcategoryOptions = {};

    rawCategories.forEach(catLabel => {
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

// -----------------------------
// Start app
// -----------------------------
init();
