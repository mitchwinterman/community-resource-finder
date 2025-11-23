// -----------------------------
// Temporary data loader
// (This will be replaced with a live SharePoint or Airtable source once chosen.)
// -----------------------------

async function loadData() {
    try {
        const response = await fetch("data.json");  // placeholder
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
        <div class="details-field"><strong>Address:</strong> ${item.Address || ""}</div>
        <div class="details-field"><strong>City:</strong> ${item.City || ""}</div>
        <div class="details-field"><strong>Zip:</strong> ${item.Zip || ""}</div>
        <div class="details-field"><strong>Phone:</strong> ${item.Phone || ""}</div>
        <div class="details-field"><strong>Email:</strong> ${item.Email || ""}</div>
        <div class="details-field"><strong>Website:</strong> <a href="${item.Website}" target="_blank">${item.Website}</a></div>

        <div class="details-field"><strong>Categories:</strong> ${item.Categories || ""}</div>
        <div class="details-field"><strong>Subcategories:</strong> ${item.Subcategories || ""}</div>

        <div class="details-field"><strong>Eligibility:</strong> ${item.Eligibility || ""}</div>
        <div class="details-field"><strong>Hours:</strong> ${item.Hours || ""}</div>
        <div class="details-field"><strong>Keywords:</strong> ${item.Keywords || ""}</div>
        <div class="details-field"><strong>Notes:</strong> ${item.Notes || ""}</div>
    `;
}

// -----------------------------
// FILTERING (FULLY REWRITTEN)
// -----------------------------

function applyFilters(fullData) {
    const keyword = searchInput.value.trim().toLowerCase();
    const selectedCategory = categorySelect.value;
    const selectedSubcategory = subcategorySelect.value;

    const filtered = fullData.filter(item => {

        // CATEGORY FILTER
        if (selectedCategory !== "all") {
            if (!item.Categories || !item.Categories.toLowerCase().includes(selectedCategory.toLowerCase())) {
                return false;
            }
        }

        // SUBCATEGORY FILTER
        if (selectedSubcategory !== "all") {
            if (!item.Subcategories || !item.Subcategories.toLowerCase().includes(selectedSubcategory.toLowerCase())) {
                return false;
            }
        }

        // FULL TEXT SEARCH (ALL FIELDS)
        if (keyword) {
            const haystack = [
                item.Organization,
                item.Description,
                item.Address,
                item.City,
                item.Zip,
                item.Phone,
                item.Email,
                item.Website,
                item.Categories,
                item.Subcategories,
                item.Keywords,
                item.Eligibility,
                item.Hours,
                item.Notes
            ]
            .filter(Boolean)
            .join(" | ")
            .toLowerCase();

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
// POPULATE FILTERS
// -----------------------------

function populateFilters(data) {
    const cats = new Set();
    const subs = new Set();

    data.forEach(item => {
        if (item.Categories) item.Categories.split(",").forEach(c => cats.add(c.trim()));
        if (item.Subcategories) item.Subcategories.split(",").forEach(s => subs.add(s.trim()));
    });

    cats.forEach(c => {
        let opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        categorySelect.appendChild(opt);
    });

    subs.forEach(s => {
        let opt = document.createElement("option");
        opt.value = s;
        opt.textContent = s;
        subcategorySelect.appendChild(opt);
    });
}

// -----------------------------
// EVENT LISTENERS (FIXED BUGS)
// -----------------------------

searchInput.addEventListener("input", () => applyFilters(globalData));
categorySelect.addEventListener("change", () => applyFilters(globalData));
subcategorySelect.addEventListener("change", () => applyFilters(globalData));  // FIXED (was referencing "global")

// -----------------------------
// Start app
// -----------------------------

init();
