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
        <div class="details-field"><strong>Website:</strong> <a href="${item.Website}" target="_blank">${item.Website}</a></div>
        <div class="details-field"><strong>Categories:</strong> ${item.Categories || ""}</div>
        <div class="details-field"><strong>Subcategories:</strong> ${item.Subcategories || ""}</div>
    `;
}

// -----------------------------
// FILTERING
// -----------------------------

function applyFilters(fullData) {
    let text = searchInput.value.trim().toLowerCase();
    let cat = categorySelect.value;
    let sub = subcategorySelect.value;

    let filtered = fullData.filter(item => {
        let matchesText =
            !text ||
            (item.SearchBlock && item.SearchBlock.includes(text));

        let matchesCat =
            cat === "all" || (item.Categories && item.Categories.includes(cat));

        let matchesSub =
            sub === "all" || (item.Subcategories && item.Subcategories.includes(sub));

        return matchesText && matchesCat && matchesSub;
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

    // Populate category/subcategory options dynamically
    populateFilters(globalData);

    applyFilters(globalData);
}

function populateFilters(data) {
    let cats = new Set();
    let subs = new Set();

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
// EVENT LISTENERS
// -----------------------------

searchInput.addEventListener("input", () => applyFilters(globalData));
categorySelect.addEventListener("change", () => applyFilters(globalData));
subcategorySelect.addEventListener("change", () => applyFilters(globalData));

// -----------------------------
// Start app
// -----------------------------

init();
