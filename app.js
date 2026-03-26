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
    getDocs,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

async function loadDataForFilters(filters = {}) {
    const category = normalizeString(filters.category).toLowerCase();
    const subcategory = normalizeString(filters.subcategory).toLowerCase();
    const subcategoryQueryValue = getStoredSubcategoryValue(category, subcategory);
    const categoryMatcher = createCategoryResourceMatcher(category);

    const constraints = [where("status", "==", "published")];
    if (subcategoryQueryValue) {
        constraints.push(where("Subcategories", "array-contains", subcategoryQueryValue));
    }

    try {
        const snap = await getDocs(query(collection(db, "resources"), ...constraints));
        const list = [];
        snap.forEach(docSnap => {
            list.push({
                id: docSnap.id,
                ...docSnap.data()
            });
        });

        if (!subcategoryQueryValue && category !== "all") {
            const fallbackSnap = await getDocs(query(
                collection(db, "resources"),
                where("status", "==", "published")
            ));
            const fallbackList = [];
            fallbackSnap.forEach(docSnap => {
                const data = {
                    id: docSnap.id,
                    ...docSnap.data()
                };
                if (categoryMatcher(data)) {
                    fallbackList.push(data);
                }
            });
            return fallbackList;
        }

        if (!list.length && subcategoryQueryValue) {
            const fallbackSnap = await getDocs(query(
                collection(db, "resources"),
                where("status", "==", "published")
            ));
            const fallbackList = [];
            fallbackSnap.forEach(docSnap => {
                const data = {
                    id: docSnap.id,
                    ...docSnap.data()
                };
                const subcategories = normalizeStringArray(data.Subcategories).map(normalizeTaxonomyMatchValue);
                const normalizedSubcategory = normalizeTaxonomyMatchValue(subcategory);

                if (subcategory !== "all") {
                    if (!subcategories.includes(normalizedSubcategory)) return;
                }

                fallbackList.push(data);
            });
            return fallbackList;
        }

        return list;
    } catch (err) {
        console.error("FILTERED DATA LOAD ERROR (Firestore resources):", err);
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
const brandHomeLink = document.querySelector(".brand-home-link");

const resultsDiv = document.getElementById("results");
const detailsDiv = document.getElementById("details");
const rightPanelContent = document.getElementById("rightPanelContent");
const detailsHeading = document.getElementById("details-heading");
const detailsViewToggle = document.getElementById("detailsViewToggle");
const mapViewToggle = document.getElementById("mapViewToggle");
const selectedScopeToggle = document.getElementById("selectedScopeToggle");
const resultsScopeToggle = document.getElementById("resultsScopeToggle");
const resultCountEl = document.getElementById("resultCount");

// -----------------------------
// GLOBAL STATE
// -----------------------------
let globalData = [];
let categoryOptions = [];
let subcategoryOptions = {};
let selectedResourceId = null;
let currentResultSet = [];
let activeRightPanel = "details";
let activeMapScope = "selected";
let activeFilters = {
    search: "",
    category: "all",
    subcategory: "all"
};
let latestLoadRequestId = 0;
const resourceQueryCache = new Map();

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

function normalizeFilterValue(value) {
    const normalized = normalizeString(value).toLowerCase();
    return normalized || "all";
}

function normalizeTaxonomyMatchValue(value) {
    return normalizeString(value)
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function isResourcePublished(resource) {
    const status = normalizeString(resource?.status).toLowerCase();
    return !status || status === "published";
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

function renderDetailsShell() {
    clearElement(rightPanelContent);
    updateRightPanelToggleUi();
}

function buildResourceQueryCacheKey(categoryFilter, subcategoryFilter) {
    const category = normalizeFilterValue(categoryFilter);
    const subcategory = normalizeFilterValue(subcategoryFilter);
    return `category:${category}|subcategory:${subcategory}`;
}

function createCategoryResourceMatcher(categoryValue) {
    const normalizedCategory = normalizeFilterValue(categoryValue);
    const categorySubcategoryValues = new Set(
        (subcategoryOptions[normalizedCategory] || [])
            .map(option => normalizeTaxonomyMatchValue(option.raw || option.value))
            .filter(Boolean)
    );

    return (resource) => {
        const categories = normalizeStringArray(resource?.Categories).map(normalizeTaxonomyMatchValue);
        if (categories.includes(normalizeTaxonomyMatchValue(normalizedCategory))) {
            return true;
        }

        if (!categorySubcategoryValues.size) {
            return false;
        }

        const subcategories = normalizeStringArray(resource?.Subcategories).map(normalizeTaxonomyMatchValue);
        return subcategories.some(item => categorySubcategoryValues.has(item));
    };
}

function getStoredCategoryValue(categoryValue) {
    const normalized = normalizeFilterValue(categoryValue);
    if (normalized === "all") return "";
    const match = categoryOptions.find(option => option.value === normalized);
    return normalizeString(match?.raw || "");
}

function getStoredSubcategoryValue(categoryValue, subcategoryValue) {
    const normalizedCategory = normalizeFilterValue(categoryValue);
    const normalizedSubcategory = normalizeFilterValue(subcategoryValue);
    if (normalizedCategory === "all" || normalizedSubcategory === "all") return "";
    const options = subcategoryOptions[normalizedCategory] || [];
    const match = options.find(option => option.value === normalizedSubcategory);
    return normalizeString(match?.raw || "");
}

function getUrlState() {
    const params = new URLSearchParams(window.location.search);
    const search = normalizeString(params.get("q"));
    const category = normalizeFilterValue(params.get("c"));
    const subcategory = normalizeFilterValue(params.get("s"));
    const selectedId = normalizeString(params.get("id"));
    const view = normalizeFilterValue(params.get("view")) === "map" ? "map" : "details";
    const scope = normalizeFilterValue(params.get("scope")) === "results" ? "results" : "selected";
    return {
        search,
        category,
        subcategory: category === "all" ? "all" : subcategory,
        selectedId,
        view,
        scope
    };
}

function updateUrlState() {
    const params = new URLSearchParams();
    if (activeFilters.search) params.set("q", activeFilters.search);
    if (activeFilters.category !== "all") params.set("c", activeFilters.category);
    if (activeFilters.subcategory !== "all" && activeFilters.category !== "all") {
        params.set("s", activeFilters.subcategory);
    }
    if (selectedResourceId) params.set("id", selectedResourceId);
    if (activeRightPanel === "map") params.set("view", "map");
    if (activeMapScope === "results") params.set("scope", "results");

    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState({
        ...activeFilters,
        selectedId: selectedResourceId,
        view: activeRightPanel,
        scope: activeMapScope
    }, "", nextUrl);
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

function updateRightPanelToggleUi() {
    const selectedScope = activeMapScope === "selected";
    const isDetails = activeRightPanel === "details";
    detailsViewToggle?.classList.toggle("active", selectedScope && isDetails);
    mapViewToggle?.classList.toggle("active", selectedScope && !isDetails);
    detailsViewToggle?.setAttribute("aria-selected", selectedScope && isDetails ? "true" : "false");
    mapViewToggle?.setAttribute("aria-selected", selectedScope && !isDetails ? "true" : "false");
    detailsViewToggle.disabled = !selectedScope;
    mapViewToggle.disabled = !selectedScope;
    selectedScopeToggle?.classList.toggle("active", selectedScope);
    resultsScopeToggle?.classList.toggle("active", !selectedScope);
    selectedScopeToggle?.setAttribute("aria-selected", selectedScope ? "true" : "false");
    resultsScopeToggle?.setAttribute("aria-selected", !selectedScope ? "true" : "false");
    if (detailsHeading) {
        if (!selectedScope) {
            detailsHeading.textContent = "All Results Map";
        } else {
            detailsHeading.textContent = isDetails ? "Resource Details" : "Resource Map";
        }
    }
}

function getMappableResources(resources) {
    return (Array.isArray(resources) ? resources : []).filter(resource => {
        if (resource?.IncludeInMap === false) return false;
        const latitude = Number.parseFloat(normalizeString(resource?.Latitude));
        const longitude = Number.parseFloat(normalizeString(resource?.Longitude));
        return Number.isFinite(latitude) && Number.isFinite(longitude);
    });
}

function renderMapPlaceholder() {
    renderDetailsShell();

    const panel = document.createElement("div");
    panel.className = "map-placeholder";

    const isResultsScope = activeMapScope === "results";
    const selectedResource = currentResultSet.find(resource => normalizeString(resource.id) === selectedResourceId);
    panel.appendChild(createTextBlock(
        "div",
        "map-placeholder-title",
        isResultsScope ? "All-results map will appear here." : "Selected-resource map will appear here."
    ));
    panel.appendChild(createTextBlock(
        "div",
        "map-placeholder-copy",
        isResultsScope
            ? "This panel is now reserved for the full filtered-results map. The next step will replace this placeholder with the actual Leaflet map and markers for every mappable result on the left."
            : "This panel is now ready for the selected resource map. The next step will replace this placeholder with the actual Leaflet map centered on the currently selected resource."
    ));

    const stats = document.createElement("div");
    stats.className = "map-placeholder-stats";
    const mappableResources = getMappableResources(currentResultSet);
    stats.appendChild(createTextBlock("div", "map-placeholder-stat", `${currentResultSet.length} current result${currentResultSet.length === 1 ? "" : "s"}`));
    stats.appendChild(createTextBlock("div", "map-placeholder-stat", `${mappableResources.length} currently mappable`));
    if (!isResultsScope && selectedResource) {
        const selectedMappable = getMappableResources([selectedResource]).length === 1 ? "selected resource has coordinates" : "selected resource not yet mappable";
        stats.appendChild(createTextBlock("div", "map-placeholder-stat", selectedMappable));
    }
    panel.appendChild(stats);
    panel.appendChild(createTextBlock(
        "div",
        "map-placeholder-note",
        isResultsScope
            ? "This mode will map all currently filtered and included results."
            : selectedResource
                ? `Selected resource: ${normalizeString(selectedResource.Organization) || "No name"}`
                : "Select a result on the left to keep the future list and map behavior aligned."
    ));

    rightPanelContent.appendChild(panel);
}

function refreshRightPanel(options = {}) {
    const { focusPanel = false, updateHistory = true } = options;
    const selectedResource = currentResultSet.find(resource => normalizeString(resource.id) === selectedResourceId);

    if (activeMapScope === "results" || activeRightPanel === "map") {
        renderMapPlaceholder();
        if (updateHistory) updateUrlState();
        if (focusPanel) detailsDiv?.focus();
        return;
    }

    if (selectedResource) {
        showDetails(selectedResource, {
            focusDetails: focusPanel,
            updateHistory
        });
        return;
    }

    renderDetailsEmptyState();
    if (updateHistory) updateUrlState();
}

function renderDetailsEmptyState() {
    renderDetailsShell();

    const empty = createTextBlock("div", "details-empty", "Select a resource");
    empty.appendChild(document.createElement("br"));

    const small = document.createElement("small");
    small.textContent = "Use the search bar or filters above to find a resource, then select it to view full details.";
    empty.appendChild(small);

    rightPanelContent.appendChild(empty);
}

function renderStatusCard(container, message) {
    clearElement(container);
    const status = createTextBlock("div", "result-card result-status-card", message);
    status.setAttribute("role", "status");
    container.appendChild(status);
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
        rightPanelContent.appendChild(field);
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
        rightPanelContent.appendChild(field);
        return;
    }

    field.appendChild(document.createTextNode(normalizeString(value)));
    rightPanelContent.appendChild(field);
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
    rightPanelContent.appendChild(field);
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
    currentResultSet = Array.isArray(resources) ? resources.slice() : [];

    updateResultCount(resources.length);

    if (resources.length === 0) {
        selectedResourceId = null;
        renderStatusCard(resultsDiv, "No results found.");
        refreshRightPanel({ updateHistory: true });
        return;
    }

    resources.forEach(resource => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "result-card";
        card.dataset.resourceId = normalizeString(resource.id);
        card.setAttribute("aria-pressed", normalizeString(resource.id) === selectedResourceId ? "true" : "false");

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
        card.addEventListener("click", () => showDetails(resource));
        resultsDiv.appendChild(card);
    });

    const selectedResource = resources.find(resource => normalizeString(resource.id) === selectedResourceId);
    if (selectedResource) {
        refreshRightPanel({ focusPanel: false, updateHistory: false });
    } else {
        selectedResourceId = null;
        refreshRightPanel({ focusPanel: false, updateHistory: true });
    }
}

function showDetails(resource, options = {}) {
    const { focusDetails = true, updateHistory = true } = options;
    const cards = document.querySelectorAll(".result-card");
    const resourceId = normalizeString(resource?.id);

    cards.forEach(card => {
        card.style.background = "#f7f9ff";
        card.style.borderLeft = "none";
        card.setAttribute("aria-pressed", "false");

        if (card.dataset.resourceId === resourceId) {
            card.style.background = "#eef2ff";
            card.style.borderLeft = "4px solid #6a7cff";
            card.setAttribute("aria-pressed", "true");
        }
    });

    selectedResourceId = resourceId;
    if (activeMapScope === "results" || activeRightPanel === "map") {
        renderMapPlaceholder();
        if (updateHistory) {
            updateUrlState();
        }
        if (focusDetails) {
            detailsDiv.focus();
        }
        return;
    }

    renderDetailsShell();
    rightPanelContent.appendChild(
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

    if (updateHistory) {
        updateUrlState();
    }
    if (focusDetails) {
        detailsDiv.focus();
    }
}

function showError(message) {
    currentResultSet = [];
    globalData = [];
    selectedResourceId = null;
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

function resetSubcategoryFilter(disabled = true) {
    subcategorySelect.value = "all";
    subcategorySelect.innerHTML = '<option value="all">All subcategories</option>';
    subcategorySelect.disabled = disabled;
}

function resetAll() {
    searchInput.value = "";
    categorySelect.value = "all";
    resetSubcategoryFilter(true);
    activeFilters = {
        search: "",
        category: "all",
        subcategory: "all"
    };
    selectedResourceId = null;
    void applyFilters();
}

// ------------------------------------
// MAIN FILTERING FUNCTION
// ------------------------------------
function filterResourcesForSearch(resources, searchTerm) {
    const normalizedSearch = normalizeString(searchTerm).toLowerCase();
    if (!normalizedSearch) {
        return resources.slice();
    }

    return resources.filter(resource => {
        const categories = normalizeStringArray(resource.Categories);
        const subcategories = normalizeStringArray(resource.Subcategories);
        const phones = getResourcePhoneNumbers(resource);
        const websites = getResourceWebsites(resource);
        const searchFields = [
            normalizeString(resource.Organization),
            getPlainText(resource.Description),
            categories.join(" "),
            subcategories.join(" "),
            normalizeString(resource.Keywords),
            phones.map(getPhoneDisplayText).join(" "),
            websites.map(item => getWebsiteDisplayText(item)).join(" "),
            normalizeString(resource.Address),
            normalizeString(resource.City),
            normalizeString(resource.Zip)
        ].join(" ").toLowerCase();

        return searchFields.includes(normalizedSearch);
    });
}

async function applyFilters(options = {}) {
    const { forceReload = false } = options;
    const nextSearch = normalizeString(searchInput.value);
    const nextCategory = normalizeFilterValue(categorySelect.value);
    const nextSubcategory = nextCategory === "all"
        ? "all"
        : normalizeFilterValue(subcategorySelect.value);

    activeFilters = {
        search: nextSearch,
        category: nextCategory,
        subcategory: nextSubcategory
    };

    const requestId = ++latestLoadRequestId;
    renderStatusCard(resultsDiv, "Loading...");
    updateResultCount(0);

    const cacheKey = buildResourceQueryCacheKey(nextCategory, nextSubcategory);
    let resources = !forceReload ? resourceQueryCache.get(cacheKey) : null;
    if (!resources) {
        resources = await loadDataForFilters({
            category: nextCategory,
            subcategory: nextSubcategory
        });
        resourceQueryCache.set(cacheKey, resources);
    }

    if (requestId !== latestLoadRequestId) {
        return;
    }

    globalData = Array.isArray(resources) ? resources.filter(isResourcePublished) : [];
    const filteredData = filterResourcesForSearch(globalData, nextSearch);
    sortByOrganizationInPlace(filteredData);
    renderResults(filteredData);
    updateUrlState();
}

// -----------------------------
// INIT
// -----------------------------
async function init() {
    renderStatusCard(resultsDiv, "Loading...");
    updateRightPanelToggleUi();
    renderDetailsEmptyState();
    updateResultCount(0);

    const rawCats = await loadCategories();
    const initialState = getUrlState();

    const categoryLabels = rawCats ? Object.keys(rawCats) : [];
    categoryOptions = [];
    subcategoryOptions = {};

    categoryLabels.forEach(catLabel => {
        if (!catLabel || typeof catLabel !== "string") return;
        const labelTrimmed = catLabel.trim();
        const valueLower = labelTrimmed.toLowerCase();

        categoryOptions.push({
            label: labelTrimmed,
            value: valueLower,
            raw: labelTrimmed
        });

        const subs = Array.isArray(rawCats[catLabel]) ? rawCats[catLabel] : [];
        subcategoryOptions[valueLower] = subs.map(subLabel => {
            const raw = normalizeString(subLabel);
            return {
                value: raw.toLowerCase(),
                label: formatSubcategoryLabel(raw),
                raw
            };
        });
    });

    populateCategoryFilter();
    categorySelect.value = initialState.category;
    populateSubcategoryFilterForCategory(initialState.category);
    subcategorySelect.value = initialState.category === "all" ? "all" : initialState.subcategory;
    searchInput.value = initialState.search;
    selectedResourceId = initialState.selectedId;
    activeRightPanel = initialState.view;
    activeMapScope = initialState.scope;
    activeFilters = {
        search: initialState.search,
        category: initialState.category,
        subcategory: initialState.category === "all" ? "all" : initialState.subcategory
    };

    await applyFilters();
}

// -----------------------------
// EVENT LISTENERS
// -----------------------------
let searchDebounceHandle = null;
searchInput.addEventListener("input", () => {
    window.clearTimeout(searchDebounceHandle);
    searchDebounceHandle = window.setTimeout(() => {
        void applyFilters();
    }, 150);
});

categorySelect.addEventListener("change", () => {
    populateSubcategoryFilterForCategory(categorySelect.value);
    if (categorySelect.value === "all") {
        resetSubcategoryFilter(true);
    }
    selectedResourceId = null;
    void applyFilters({ forceReload: true });
});

subcategorySelect.addEventListener("change", () => {
    selectedResourceId = null;
    void applyFilters({ forceReload: true });
});

resetButton.addEventListener("click", resetAll);

function handleHomeClick(event) {
    event?.preventDefault?.();
    resetAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
}

if (brandHomeLink) {
    brandHomeLink.addEventListener("click", handleHomeClick);
}

detailsViewToggle?.addEventListener("click", () => {
    if (activeRightPanel === "details") return;
    activeRightPanel = "details";
    refreshRightPanel({ focusPanel: true, updateHistory: true });
});

mapViewToggle?.addEventListener("click", () => {
    if (activeRightPanel === "map") return;
    activeRightPanel = "map";
    refreshRightPanel({ focusPanel: true, updateHistory: true });
});

selectedScopeToggle?.addEventListener("click", () => {
    if (activeMapScope === "selected") return;
    activeMapScope = "selected";
    refreshRightPanel({ focusPanel: true, updateHistory: true });
});

resultsScopeToggle?.addEventListener("click", () => {
    if (activeMapScope === "results") return;
    activeMapScope = "results";
    refreshRightPanel({ focusPanel: true, updateHistory: true });
});

window.addEventListener("popstate", () => {
    const nextState = getUrlState();
    searchInput.value = nextState.search;
    categorySelect.value = nextState.category;
    populateSubcategoryFilterForCategory(nextState.category);
    subcategorySelect.value = nextState.category === "all" ? "all" : nextState.subcategory;
    selectedResourceId = nextState.selectedId;
    activeRightPanel = nextState.view;
    activeMapScope = nextState.scope;
    activeFilters = {
        search: nextState.search,
        category: nextState.category,
        subcategory: nextState.category === "all" ? "all" : nextState.subcategory
    };
    void applyFilters();
});

// -----------------------------
// Start app
// -----------------------------
init();
