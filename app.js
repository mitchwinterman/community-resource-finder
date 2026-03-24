// app.js - frontend for Community Resource Finder (Firestore-backed)

import { db } from "./firebase.js";
import {
    normalizeWebsiteList,
    normalizePhoneEntries,
    getPhoneHref,
    getPhoneDisplayText,
    getWebsiteDisplayText
} from "./contact-fields.js";
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
            list.push(docSnap.data());
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
        const rawCats = {};
        snap.forEach(docSnap => {
            const data = docSnap.data();
            const name = normalizeString(data.name);
            if (!name) return;
            rawCats[name] = Array.isArray(data.subcategories) ? data.subcategories : [];
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
let categoryOptions = [];
let subcategoryOptions = {};
let selectedResourceId = null;

// -----------------------------
// HELPER FUNCTIONS
// -----------------------------
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

const allowedRichTextTags = new Set([
    "A",
    "B",
    "BR",
    "EM",
    "I",
    "LI",
    "OL",
    "P",
    "STRONG",
    "U",
    "UL"
]);

function normalizeString(value) {
    return String(value ?? "").trim();
}

function normalizeStringArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map(item => normalizeString(item)).filter(Boolean);
}

function formatSubcategoryLabel(label) {
    if (!label) return "";
    const lower = label.toLowerCase();
    return specialSubcategoryCaps[lower] || label;
}

function clearElement(el) {
    if (!el) return;
    el.replaceChildren();
}

function getPlainText(value) {
    const raw = String(value ?? "");
    if (!raw) return "";

    const template = document.createElement("template");
    template.innerHTML = raw;
    return normalizeString(template.content.textContent || "");
}

function formatArrayForDisplay(values, formatter = null) {
    const items = normalizeStringArray(values);
    return items.map(item => formatter ? formatter(item) : item).join(", ");
}

function getResourceWebsites(resource) {
    if (Array.isArray(resource?.Websites)) {
        return normalizeWebsiteList(resource.Websites);
    }
    return normalizeWebsiteList(resource?.Website);
}

function getResourcePhoneNumbers(resource) {
    if (Array.isArray(resource?.PhoneNumbers)) {
        return normalizePhoneEntries(resource.PhoneNumbers);
    }
    return normalizePhoneEntries(resource?.Phone);
}

function getSafeHref(rawValue, allowBareDomain = false) {
    const value = normalizeString(rawValue);
    if (!value) return "";

    const hasScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value);
    if (!hasScheme) {
        if (!allowBareDomain || value.startsWith("/") || value.startsWith(".") || /\s/.test(value)) {
            return "";
        }
    }

    const candidate = hasScheme ? value : `https://${value}`;

    try {
        const url = new URL(candidate);
        const protocol = url.protocol.toLowerCase();
        if (!["http:", "https:", "mailto:", "tel:"].includes(protocol)) {
            return "";
        }
        return url.href;
    } catch {
        return "";
    }
}

function sanitizeHtmlToFragment(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html ?? "");

    function sanitizeNode(node) {
        if (node.nodeType === Node.TEXT_NODE) {
            return document.createTextNode(node.textContent || "");
        }

        if (node.nodeType !== Node.ELEMENT_NODE) {
            return document.createDocumentFragment();
        }

        const tagName = node.tagName.toUpperCase();
        if (!allowedRichTextTags.has(tagName)) {
            const fragment = document.createDocumentFragment();
            Array.from(node.childNodes).forEach(child => {
                fragment.appendChild(sanitizeNode(child));
            });
            return fragment;
        }

        const clean = document.createElement(tagName.toLowerCase());

        if (tagName === "A") {
            const safeHref = getSafeHref(node.getAttribute("href"), true);
            if (!safeHref) {
                const fragment = document.createDocumentFragment();
                Array.from(node.childNodes).forEach(child => {
                    fragment.appendChild(sanitizeNode(child));
                });
                return fragment;
            }

            clean.setAttribute("href", safeHref);
            if (safeHref.startsWith("http://") || safeHref.startsWith("https://")) {
                clean.setAttribute("target", "_blank");
                clean.setAttribute("rel", "noopener noreferrer");
            }
        }

        Array.from(node.childNodes).forEach(child => {
            clean.appendChild(sanitizeNode(child));
        });

        return clean;
    }

    const fragment = document.createDocumentFragment();
    Array.from(template.content.childNodes).forEach(child => {
        fragment.appendChild(sanitizeNode(child));
    });
    return fragment;
}

function appendSanitizedRichText(container, html) {
    const richText = normalizeString(html);
    if (!richText) return false;

    container.appendChild(sanitizeHtmlToFragment(richText));
    return true;
}

function createTextBlock(tagName, className, text) {
    const el = document.createElement(tagName);
    if (className) el.className = className;
    el.textContent = text;
    return el;
}

function renderDetailsEmptyState() {
    clearElement(detailsDiv);

    const empty = createTextBlock("div", "details-empty", "Select a resource");
    empty.appendChild(document.createElement("br"));

    const small = document.createElement("small");
    small.textContent = "Use the search bar or filters above to find a resource, then click to view full details.";
    empty.appendChild(small);

    detailsDiv.appendChild(empty);
}

function renderStatusCard(container, message) {
    clearElement(container);
    container.appendChild(createTextBlock("div", "result-card", message));
}

function appendDetailField(label, value, options = {}) {
    const field = document.createElement("div");
    field.className = "details-field";

    const labelEl = document.createElement("strong");
    labelEl.textContent = `${label}:`;
    field.appendChild(labelEl);
    field.appendChild(document.createTextNode(" "));

    if (options.richText) {
        const richTextWrap = document.createElement("span");
        if (!appendSanitizedRichText(richTextWrap, value)) {
            richTextWrap.textContent = "";
        }
        field.appendChild(richTextWrap);
        detailsDiv.appendChild(field);
        return;
    }

    if (options.link) {
        const href = getSafeHref(value, true);
        if (href) {
            const link = document.createElement("a");
            link.href = href;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = normalizeString(value);
            field.appendChild(link);
        } else {
            field.appendChild(document.createTextNode(normalizeString(value)));
        }
        detailsDiv.appendChild(field);
        return;
    }

    field.appendChild(document.createTextNode(normalizeString(value)));
    detailsDiv.appendChild(field);
}

function appendDetailListField(label, values, options = {}) {
    const items = Array.isArray(values)
        ? values.filter(item => {
            if (options.displayFormatter) {
                return normalizeString(options.displayFormatter(item));
            }
            return normalizeString(item);
        })
        : [];
    if (!items.length) {
        appendDetailField(label, "");
        return;
    }

    const field = document.createElement("div");
    field.className = "details-field";

    const labelEl = document.createElement("strong");
    labelEl.textContent = `${label}:`;
    field.appendChild(labelEl);
    field.appendChild(document.createTextNode(" "));

    const list = document.createElement("ul");
    list.style.margin = "6px 0 0 18px";
    list.style.padding = "0";

    items.forEach(item => {
        const entry = document.createElement("li");
        const displayText = options.displayFormatter
            ? normalizeString(options.displayFormatter(item))
            : normalizeString(item);

        if (options.link) {
            const href = getSafeHref(String(item ?? ""), true);
            if (href) {
                const link = document.createElement("a");
                link.href = href;
                link.target = "_blank";
                link.rel = "noopener noreferrer";
                link.textContent = displayText;
                entry.appendChild(link);
            } else {
                entry.textContent = displayText;
            }
        } else if (options.tel) {
            const href = getPhoneHref(item);
            if (href) {
                const link = document.createElement("a");
                link.href = href;
                link.textContent = displayText;
                entry.appendChild(link);
            } else {
                entry.textContent = displayText;
            }
        } else {
            entry.textContent = displayText;
        }

        list.appendChild(entry);
    });

    field.appendChild(list);
    detailsDiv.appendChild(field);
}

function getResourceSelectionKey(resource) {
    return [
        normalizeString(resource.Organization),
        normalizeString(resource.Address),
        getResourcePhoneNumbers(resource).map(getPhoneDisplayText).join(" | "),
        getResourceWebsites(resource).join(" | ")
    ].join("|");
}

function sortByOrganizationInPlace(list) {
    list.sort((a, b) => {
        const nameA = normalizeString(a.Organization).toLowerCase();
        const nameB = normalizeString(b.Organization).toLowerCase();
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
    clearElement(resultsDiv);
    renderDetailsEmptyState();
    selectedResourceId = null;

    updateResultCount(resources.length);

    if (resources.length === 0) {
        renderStatusCard(resultsDiv, "No results found.");
        return;
    }

    resources.forEach(resource => {
        const card = document.createElement("div");
        card.className = "result-card";
        card.dataset.resourceKey = getResourceSelectionKey(resource);

        const title = document.createElement("div");
        title.className = "card-title";

        const strong = document.createElement("strong");
        strong.textContent = normalizeString(resource.Organization) || "No name";
        title.appendChild(strong);

        const description = createTextBlock(
            "div",
            "card-description",
            getPlainText(resource.Description)
        );

        card.appendChild(title);
        card.appendChild(description);
        card.onclick = () => showDetails(resource);
        resultsDiv.appendChild(card);
    });
}

function showDetails(resource) {
    const cards = document.querySelectorAll(".result-card");
    const resourceKey = getResourceSelectionKey(resource);

    cards.forEach(card => {
        card.style.background = "#f7f9ff";
        card.style.borderLeft = "none";

        if (card.dataset.resourceKey === resourceKey) {
            card.style.background = "#eef2ff";
            card.style.borderLeft = "4px solid #6a7cff";
        }
    });

    selectedResourceId = resourceKey;

    clearElement(detailsDiv);
    detailsDiv.appendChild(
        createTextBlock("div", "details-title", normalizeString(resource.Organization) || "No name")
    );

    const phones = getResourcePhoneNumbers(resource);
    const websites = getResourceWebsites(resource);

    appendDetailField("Description", resource.Description, { richText: true });
    appendDetailField("Address", resource.Address);
    appendDetailField("City", resource.City);
    appendDetailField("Zip", resource.Zip);
    appendDetailListField("Phone", phones, { tel: true, displayFormatter: getPhoneDisplayText });
    appendDetailField("Email", resource.Email);
    appendDetailListField("Website", websites, { link: true, displayFormatter: getWebsiteDisplayText });
    appendDetailField("Categories", formatArrayForDisplay(resource.Categories));
    appendDetailField("Subcategories", formatArrayForDisplay(resource.Subcategories, formatSubcategoryLabel));
    appendDetailField("Eligibility", resource.Eligibility);
    appendDetailField("Hours", resource.Hours);
    appendDetailField("Cost", resource.Cost);
    appendDetailField("Last Verified", resource["Last Verified"]);
    appendDetailField("Notes", resource.Notes, { richText: true });
}

function showError(message) {
    renderStatusCard(resultsDiv, message);
    renderDetailsEmptyState();
    updateResultCount(0);
}

// -----------------------------
// FILTER POPULATION
// -----------------------------
function populateCategoryFilter() {
    categorySelect.innerHTML = '<option value="all">All categories</option>';

    categoryOptions.forEach(option => {
        const opt = document.createElement("option");
        opt.value = option.value;
        opt.textContent = option.label;
        categorySelect.appendChild(opt);
    });
}

function populateSubcategoryFilterForCategory(categoryValue) {
    subcategorySelect.innerHTML = '<option value="all">All subcategories</option>';

    if (!categoryValue || categoryValue === "all") {
        subcategorySelect.disabled = true;
        return;
    }

    const subs = subcategoryOptions[categoryValue];
    if (subs && subs.length > 0) {
        subcategorySelect.disabled = false;
        subs.forEach(option => {
            const opt = document.createElement("option");
            opt.value = option.value;
            opt.textContent = option.label;
            subcategorySelect.appendChild(opt);
        });
    } else {
        subcategorySelect.disabled = true;
    }
}

function resetSubcategoryFilter() {
    subcategorySelect.value = "all";
    subcategorySelect.innerHTML = '<option value="all">All subcategories</option>';
    subcategorySelect.disabled = true;
}

function resetAll() {
    searchInput.value = "";
    categorySelect.value = "all";
    resetSubcategoryFilter();
    applyFilters();
}

// ------------------------------------
// MAIN FILTERING FUNCTION
// ------------------------------------
function applyFilters() {
    const searchTerm = normalizeString(searchInput.value).toLowerCase();
    const categoryFilter = categorySelect.value;
    const subcategoryFilter = subcategorySelect.value;

    const filteredData = globalData.filter(resource => {
        const categories = normalizeStringArray(resource.Categories);
        const subcategories = normalizeStringArray(resource.Subcategories);

        if (searchTerm) {
            const phones = getResourcePhoneNumbers(resource);
            const websites = getResourceWebsites(resource);
            const searchFields = [
                normalizeString(resource.Organization),
                getPlainText(resource.Description),
                categories.join(" "),
                subcategories.join(" "),
                normalizeString(resource.Keywords),
                phones.map(getPhoneDisplayText).join(" "),
                websites.map(item => getWebsiteDisplayText(item)).join(" ")
            ].join(" ").toLowerCase();

            if (!searchFields.includes(searchTerm)) {
                return false;
            }
        }

        if (categoryFilter !== "all") {
            if (!categories.some(category => category.toLowerCase() === categoryFilter)) {
                return false;
            }
        }

        if (subcategoryFilter !== "all") {
            if (!subcategories.some(subcategory => subcategory.toLowerCase() === subcategoryFilter)) {
                return false;
            }
        }

        return true;
    });

    sortByOrganizationInPlace(filteredData);
    renderResults(filteredData);
}

// -----------------------------
// INIT
// -----------------------------
async function init() {
    renderStatusCard(resultsDiv, "Loading...");
    renderDetailsEmptyState();
    updateResultCount(0);

    const [data, rawCats] = await Promise.all([loadData(), loadCategories()]);
    globalData = Array.isArray(data) ? data : [];

    const categoryLabels = rawCats ? Object.keys(rawCats) : [];
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

        const subs = Array.isArray(rawCats[catLabel]) ? rawCats[catLabel] : [];
        subcategoryOptions[valueLower] = subs.map(subLabel => {
            const raw = normalizeString(subLabel);
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
