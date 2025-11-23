// -----------------------------
// Temporary data loader
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

// -----------------------------
// DOM ELEMENTS
// -----------------------------
const searchInput = document.getElementById("searchBox");
const categorySelect = document.getElementById("categorySelect");
const subcategorySelect = document.getElementById("subcategorySelect");
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
    detailsDiv.innerHTML = `
        <div class="details-title">${item.Organization || "No name"}</div>

        <div class="details-field"><strong>Description:</strong> ${item.Description || ""}</div>
        <div class="details-field"><strong>Address:</strong> ${item.Address || ""}</div>
        <div class="details-field"><strong>City:</strong> ${item.City || ""}</div>
        <div class="details-field"><strong>Zip:</strong> ${item.Zip || ""}</div>
        <div class="details-field"><strong>Phone:</strong> ${item.Phone || ""}</div>
        <div class="details-field"><strong>Email:</strong> ${item.Email || ""}</div>
        <div class="details-field"><strong>Website:</strong> ${
            item.Website
                ? `<a href="${item.Website.startsWith("http") ? item.Website : "https://" + item.Website}" target="_blank" rel="noopener noreferrer">${item.Website}</a>`
                : ""
        }</div>

        <div class="details-field"><strong>Categories:</strong> ${item.Categories || ""}</div>
        <div class="details-field"><strong>Subcategories:</strong> ${item.Subcategories || ""}</div>

        <div class="details-field"><strong>Eligibility:</strong> ${item.Eligibility || ""}</div>
        <div class="details-field"><strong>Hours:</strong> ${item.Hours || ""}</div>
        <div class="details-field"><strong>Keywords:</strong> ${item.Keywords || ""}</div>
        <div class="details-field"><strong>Notes:</strong> ${item.Notes || ""}</div>
    `;
}

// -----------------------------
// HELPER FUNCTIONS
// -----------------------------
function buildHaystack(item) {
    // concatenate all field values for full-text search
    return Object.values(item || {})
        .filter(v => v !== null && v !== undefined && String(v).trim() !== "")
        .join(" | ")
        .toLowerCase();
}

function addTokensToSet(csv, set) {
    if (!csv) return;
    String(csv)
        .split(",")
        .map(p => p.trim())
        .filter(p => p.length > 0)
        .forEach(p => set.add(p));
}

// -----------------------------
// FILTERING
// -----------------------------
function applyFilters(fullData) {
    if (!Array.isArray(fullData)) {
        renderList([]);
        return;
    }

    const keywordRaw = (searchInput.value || "").trim().toLowerCase();

    // guard against blank values on the selects
    const rawCat = (categorySelect.value || "").trim();
    const rawSub = (subcategorySelect.value || "").trim();

    const selectedCategory =
        rawCat === "" ? "all" : rawCat.toLowerCase();
    const selectedSubcategory =
        rawSub === "" ? "all" : rawSub.toLowerCase();

    const filtered = fullData.filter(item => {
        const catText = String(item.Categories || "").toLowerCase();
        const subText = String(item.Subcategories || "").toLowerCase();

        // CATEGORY FILTER
        if (selectedCategory !== "all" &&
            !catText.includes(selectedCategory)) {
            return false;
        }

        // SUBCATEGORY FILTER
        if (selectedSubcategory !== "all" &&
            !subText.includes(selectedSubcategory)) {
            return false;
        }

        // FULL-TEXT SEARCH
        if (keywordRaw) {
            const haystack = buildHaystack(item);
            if (!haystack.includes(keywordRaw)) {
                return false;
            }
        }

        return true;
    });

    renderList(filtered);
}

// -----------------------------
// INITIAL LOAD
// -----------------------------
let globalData = [];

async function init() {
    resultsDiv.innerHTML = `<div class="result-card">Loading…</div>`;

    globalData = await loadData();

    populateFilters(globalData);
    applyFilters(globalData);
}

// -----------------------------
// POPULATE FILTERS
// -----------------------------
function populateFilters(data) {
    const catSet = new Set();
    const subSet = new Set();

    data.forEach(item => {
        addTokensToSet(item.Categories, catSet);
        addTokensToSet(item.Subcategories, subSet);
    });

    // categories
    catSet.forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat;           // keep original text as value
        opt.textContent = cat;     // show as-is
        categorySelect.appendChild(opt);
    });

    // subcategories
    subSet.forEach(sub => {
        const opt = document.createElement("option");
        opt.value = sub;
        opt.textContent = sub;
        subcategorySelect.appendChild(opt);
    });
}

// -----------------------------
// EVENT LISTENERS
// -----------------------------
searchInput.addEventListener("input", () => applyFilters(globalData));
categorySelect.addEventListener("change", () => applyFilters(globalData));
subcategorySelect.addEventListener("change", () => applyFilters(globalData));

// -----------------------------
// Start app
// -----------------------------
init();
