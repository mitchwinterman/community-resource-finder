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
    resultsDiv.innerHTML = `<div class='result-card'>${message}</div>`;
}

// -----------------------------
// RENDERING FUNCTIONS
// -----------------------------
function renderList(data) {
    resultsDiv.innerHTML = "";

    if (data.length === 0) {
        resultsDiv.innerHTML = "<div class='result-card'>No results found.</div>";
        return;
    }

    data.forEach(item => {
        let card = document.createElement("div");
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
        <div class="details-field"><strong<Address:</strong> ${item.Address || ""}</div>
        <div class="details-field"><strong>City:</strong> ${item.City || ""}</div>
        <div class="details-field"><strong>Zip:</strong> ${item.Zip || ""}</div>
        <div class="details-field"><strong>Phone:</strong> ${item.Phone || ""}</div>
        <div class="details-field"><strong>Email:</strong> ${item.Email || ""}</div>
        <div class="details-field"><strong>Website:</strong> <a href="${item.Website}" target="_blank">${item.Website}</a></div>

        <div class="details-field"><strong>Categories:</strong> ${arrayToString(item.Categories)}</div>
        <div class="details-field"><strong>Subcategories:</strong> ${arrayToString(item.Subcategories)}</div>

        <div class="details-field"><strong>Eligibility:</strong> ${item.Eligibility || ""}</div>
        <div class="details-field"><strong>Hours:</strong> ${item.Hours || ""}</div>
        <div class="details-field"><strong>Keywords:</strong> ${arrayToString(item.Keywords)}</div>
        <div class="details-field"><strong>Notes:</strong> ${item.Notes || ""}</div>
    `;
}

// -----------------------------
// HELPERS
// -----------------------------
function normalize(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(v => String(v).trim().toLowerCase());
    return String(value)
        .split(",")
        .map(v => v.trim().toLowerCase());
}

function arrayToString(value) {
    if (!value) return "";
    if (Array.isArray(value)) return value.join(", ");
    return value;
}

function buildHaystack(item) {
    return [
        item.Organization,
        item.Description,
        item.Address,
        item.City,
        item.Zip,
        item.Phone,
        item.Email,
        item.Website,
        arrayToString(item.Categories),
        arrayToString(item.Subcategories),
        item.Eligibility,
        item.Hours,
        arrayToString(item.Keywords),
        item.Notes
    ]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();
}

// -----------------------------
// FILTERING (FULLY FIXED)
// -----------------------------
function applyFilters(fullData) {
    const keyword = searchInput.value.trim().toLowerCase();
    const selectedCategory = categorySelect.value.toLowerCase();
    const selectedSubcategory = subcategorySelect.value.toLowerCase();

    const filtered = fullData.filter(item => {

        const itemCats = normalize(item.Categories);
        const itemSubs = normalize(item.Subcategories);

        // CATEGORY FILTER
        if (selectedCategory !== "all" && !itemCats.includes(selectedCategory)) {
            return false;
        }

        // SUBCATEGORY FILTER
        if (selectedSubcategory !== "all" && !itemSubs.includes(selectedSubcategory)) {
            return false;
        }

        // FULL TEXT SEARCH
        if (keyword) {
            const haystack = buildHaystack(item);
            if (!haystack.includes(keyword)) return false;
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
    resultsDiv.innerHTML = "<div class='result-card'>Loading…</div>";

    globalData = await loadData();

    populateFilters(globalData);

    applyFilters(globalData);
}

// -----------------------------
// POPULATE FILTERS (ARRAY SAFE)
// -----------------------------
function populateFilters(data) {
    const cats = new Set();
    const subs = new Set();

    data.forEach(item => {
        normalize(item.Categories).forEach(c => cats.add(c));
        normalize(item.Subcategories).forEach(s => subs.add(s));
    });

    cats.forEach(c => {
        let opt = document.createElement("option");
        opt.value = c;
        opt.textContent = capitalize(c);
        categorySelect.appendChild(opt);
    });

    subs.forEach(s => {
        let opt = document.createElement("option");
        opt.value = s;
        opt.textContent = capitalize(s);
        subcategorySelect.appendChild(opt);
    });
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
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
