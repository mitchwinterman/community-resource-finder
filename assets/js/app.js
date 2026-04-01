// app.js - frontend for Community Resource Finder (Firestore-backed)

import { db } from "./firebase.js";
import {
    getResourceTitle,
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
let leafletMap = null;
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
    "DIV",
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
    return String(value ?? "")
        .replace(/[\u00A0\u202F]/g, " ")
        .trim();
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

function getEmailHref(value) {
    const email = normalizeString(value);
    if (!email || /\s/.test(email) || !email.includes("@")) {
        return "";
    }
    return `mailto:${email}`;
}

function formatResourceAddress(resource) {
    const street = normalizeString(resource?.Address);
    const city = normalizeString(resource?.City);
    const zip = normalizeString(resource?.Zip);
    const locality = [city, zip].filter(Boolean).join(" ");
    return [street, locality].filter(Boolean).join("\n");
}

function getResourceMapHref(resource) {
    const address = formatResourceAddress(resource);
    if (!address) return "";
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.replace(/\n+/g, ", "))}`;
}

function parseYyyyMmDd(value) {
    const normalized = normalizeString(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        return null;
    }

    const parsed = new Date(`${normalized}T12:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDisplayDate(value) {
    const parsed = parseYyyyMmDd(value);
    if (!parsed) {
        return normalizeString(value);
    }

    return parsed.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric"
    });
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
            return document.createTextNode((node.textContent || "").replace(/[\u00A0\u202F]/g, " "));
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

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
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
            detailsHeading.textContent = isDetails ? "Resource Details" : "Selected Resource Map";
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

function destroyLeafletMap() {
    if (leafletMap) {
        leafletMap.remove();
        leafletMap = null;
    }
}

function getLeafletLibrary() {
    return window.L || null;
}

function createMapInfoMessage(titleText, bodyText) {
    const wrap = document.createElement("div");
    wrap.className = "map-empty-state";
    wrap.appendChild(createTextBlock("div", "map-empty-title", titleText));
    wrap.appendChild(createTextBlock("div", "map-empty-copy", bodyText));
    return wrap;
}

function createMarkerPopupHtml(resource) {
    const name = escapeHtml(getResourceTitle(resource) || "No name");
    const address = escapeHtml([
        normalizeString(resource?.Address),
        normalizeString(resource?.City),
        normalizeString(resource?.Zip)
    ].filter(Boolean).join(", "));
    return `
        <div class="map-popup">
            <strong>${name}</strong>
            ${address ? `<div>${address}</div>` : ""}
        </div>
    `;
}

function updateSelectedResultCardState(resourceId) {
    const cards = document.querySelectorAll(".result-card");
    cards.forEach(card => {
        card.style.background = "#f7f9ff";
        card.style.borderLeft = "none";
        card.setAttribute("aria-pressed", "false");

        if (card.dataset.resourceId === normalizeString(resourceId)) {
            card.style.background = "#eef2ff";
            card.style.borderLeft = "4px solid #6a7cff";
            card.setAttribute("aria-pressed", "true");
        }
    });
}

function scrollResultCardIntoView(resourceId) {
    const card = resultsDiv?.querySelector(`.result-card[data-resource-id="${normalizeString(resourceId)}"]`);
    card?.scrollIntoView({
        block: "nearest",
        behavior: "smooth"
    });
}

function renderMapView() {
    renderDetailsShell();
    destroyLeafletMap();

    const L = getLeafletLibrary();
    if (!L) {
        rightPanelContent.appendChild(createMapInfoMessage(
            "Map library unavailable",
            "Leaflet did not load, so the map cannot be shown right now."
        ));
        return;
    }

    const isResultsScope = activeMapScope === "results";
    const selectedResource = currentResultSet.find(resource => normalizeString(resource.id) === selectedResourceId);
    const mappableResources = getMappableResources(currentResultSet);

    const panel = document.createElement("div");
    panel.className = "map-view-panel";

    if (isResultsScope && !mappableResources.length) {
        rightPanelContent.appendChild(panel);
        panel.appendChild(createMapInfoMessage(
            "No mappable results",
            "None of the currently filtered results have coordinates and are included in the map."
        ));
        return;
    }

    if (!isResultsScope && !selectedResource) {
        rightPanelContent.appendChild(panel);
        panel.appendChild(createMapInfoMessage(
            "Select a resource first",
            "Choose a result on the left to view a map for that resource."
        ));
        return;
    }

    if (!isResultsScope && !getMappableResources([selectedResource]).length) {
        rightPanelContent.appendChild(panel);
        panel.appendChild(createMapInfoMessage(
            "This resource is not mappable yet",
            "The selected resource either has no coordinates yet or has been marked as not included in the map."
        ));
        return;
    }

    const mapCanvas = document.createElement("div");
    mapCanvas.className = "leaflet-map-canvas";
    panel.appendChild(mapCanvas);
    rightPanelContent.appendChild(panel);

    const defaultMapCenter = [39.5296, -119.8138];

    leafletMap = L.map(mapCanvas, {
        zoomControl: true,
        scrollWheelZoom: true
    }).setView(defaultMapCenter, 10);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(leafletMap);

    const bounds = [];

    if (isResultsScope) {
        const markers = [];

        const applyMarkerSelectionState = () => {
            markers.forEach(({ id, marker }) => {
                const isSelected = normalizeString(id) === selectedResourceId;
                marker.setStyle({
                    radius: isSelected ? 9 : 7,
                    color: isSelected ? "#0f172a" : "#2563eb",
                    weight: 2,
                    fillColor: isSelected ? "#0ea5e9" : "#60a5fa",
                    fillOpacity: 0.9
                });
            });
        };

        mappableResources.forEach(resource => {
            const lat = Number.parseFloat(normalizeString(resource.Latitude));
            const lon = Number.parseFloat(normalizeString(resource.Longitude));
            const isSelected = normalizeString(resource.id) === selectedResourceId;
            const marker = L.circleMarker([lat, lon], {
                radius: isSelected ? 9 : 7,
                color: isSelected ? "#0f172a" : "#2563eb",
                weight: 2,
                fillColor: isSelected ? "#0ea5e9" : "#60a5fa",
                fillOpacity: 0.9
            }).addTo(leafletMap);

            marker.bindPopup(createMarkerPopupHtml(resource));
            markers.push({
                id: resource.id,
                marker
            });
            marker.on("click", () => {
                selectedResourceId = normalizeString(resource.id);
                activeMapScope = "selected";
                activeRightPanel = "map";
                scrollResultCardIntoView(selectedResourceId);
                refreshRightPanel({
                    focusPanel: false,
                    updateHistory: true
                });
            });

            bounds.push([lat, lon]);
        });

        applyMarkerSelectionState();
    } else if (selectedResource) {
        const lat = Number.parseFloat(normalizeString(selectedResource.Latitude));
        const lon = Number.parseFloat(normalizeString(selectedResource.Longitude));
        const marker = L.marker([lat, lon]).addTo(leafletMap);
        marker.bindPopup(createMarkerPopupHtml(selectedResource)).openPopup();
        bounds.push([lat, lon]);
    }

    window.setTimeout(() => {
        if (!leafletMap) return;
        leafletMap.invalidateSize();

        if (bounds.length === 1) {
            leafletMap.setView(bounds[0], 13);
            return;
        }

        if (bounds.length > 1) {
            leafletMap.fitBounds(bounds, {
                padding: [32, 32]
            });
            return;
        }

        leafletMap.setView(defaultMapCenter, 10);
    }, 50);

}

function refreshRightPanel(options = {}) {
    const { focusPanel = false, updateHistory = true } = options;
    const selectedResource = currentResultSet.find(resource => normalizeString(resource.id) === selectedResourceId);

    if (activeMapScope === "results" || activeRightPanel === "map") {
        renderMapView();
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
    destroyLeafletMap();

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

async function copyTextToClipboard(value) {
    const text = normalizeString(value);
    if (!text) return false;

    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // Fall through to the textarea fallback below.
        }
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();

    let copied = false;
    try {
        copied = document.execCommand("copy");
    } catch {
        copied = false;
    }

    textarea.remove();
    return copied;
}

function createDetailsSection(title, options = {}) {
    const section = document.createElement("section");
    section.className = `details-section${options.card ? " details-card" : ""}`;

    if (title) {
        const heading = document.createElement(options.headingTag || "h3");
        heading.className = options.card ? "details-card-title" : "details-section-title";
        heading.textContent = title;
        section.appendChild(heading);
    }

    const body = document.createElement("div");
    body.className = options.card ? "details-card-body" : "details-section-body";
    section.appendChild(body);

    return { section, body };
}

function createDetailsPriorityCard(title) {
    return createDetailsSection(title, { card: true, headingTag: "h3" });
}

function appendDetailFieldTo(container, label, value, options = {}) {
    if (!container) return false;

    const {
        richText = false,
        link = false,
        email = false,
        preserveLineBreaks = false,
        valueClassName = ""
    } = options;

    const normalizedValue = richText ? getPlainText(value) : normalizeString(value);
    if (!normalizedValue) {
        return false;
    }

    const field = document.createElement("div");
    field.className = "details-field";

    const labelEl = document.createElement("div");
    labelEl.className = "details-label";
    labelEl.textContent = label;
    field.appendChild(labelEl);

    const valueWrap = document.createElement("div");
    valueWrap.className = `details-value${valueClassName ? ` ${valueClassName}` : ""}`;
    if (preserveLineBreaks) {
        valueWrap.classList.add("details-value-pre");
    }

    if (richText) {
        valueWrap.classList.add("details-rich-text");
        if (!appendSanitizedRichText(valueWrap, value)) {
            return false;
        }
        field.appendChild(valueWrap);
        container.appendChild(field);
        return true;
    }

    if (link || email) {
        const href = email ? getEmailHref(value) : getSafeHref(value, true);
        if (href) {
            const linkEl = document.createElement("a");
            linkEl.href = href;
            if (!href.startsWith("mailto:")) {
                linkEl.target = "_blank";
                linkEl.rel = "noopener noreferrer";
            }
            linkEl.textContent = normalizedValue;
            valueWrap.appendChild(linkEl);
        } else {
            valueWrap.textContent = normalizedValue;
        }
    } else {
        valueWrap.textContent = normalizedValue;
    }

    field.appendChild(valueWrap);
    container.appendChild(field);
    return true;
}

function appendDetailListFieldTo(container, label, values, options = {}) {
    if (!container) return false;

    const items = Array.isArray(values)
        ? values.filter(item => {
            if (options.displayFormatter) {
                return normalizeString(options.displayFormatter(item));
            }
            return normalizeString(item);
        })
        : [];

    if (!items.length) {
        return false;
    }

    const field = document.createElement("div");
    field.className = "details-field";

    const labelEl = document.createElement("div");
    labelEl.className = "details-label";
    labelEl.textContent = label;
    field.appendChild(labelEl);

    const list = document.createElement("ul");
    list.className = `details-list${options.plain ? " details-list-plain" : ""}`;

    items.forEach(item => {
        const entry = document.createElement("li");
        const displayText = options.displayFormatter
            ? normalizeString(options.displayFormatter(item))
            : normalizeString(item);

        if (options.link) {
            const href = getSafeHref(String(item ?? ""), true);
            if (href) {
                const linkEl = document.createElement("a");
                linkEl.href = href;
                linkEl.target = "_blank";
                linkEl.rel = "noopener noreferrer";
                linkEl.textContent = displayText;
                entry.appendChild(linkEl);
            } else {
                entry.textContent = displayText;
            }
        } else if (options.tel) {
            const href = getPhoneHref(item);
            if (href) {
                const linkEl = document.createElement("a");
                linkEl.href = href;
                linkEl.textContent = displayText;
                entry.appendChild(linkEl);
            } else {
                entry.textContent = displayText;
            }
        } else {
            entry.textContent = displayText;
        }

        list.appendChild(entry);
    });

    field.appendChild(list);
    container.appendChild(field);
    return true;
}

function appendRichTextBlockTo(container, value) {
    if (!container || !getPlainText(value)) {
        return false;
    }

    const block = document.createElement("div");
    block.className = "details-rich-text";
    if (!appendSanitizedRichText(block, value)) {
        return false;
    }

    container.appendChild(block);
    return true;
}

function appendChipGroupTo(container, label, values, formatter = null) {
    if (!container) return false;

    const items = normalizeStringArray(values)
        .map(item => formatter ? formatter(item) : item)
        .filter(Boolean);

    if (!items.length) {
        return false;
    }

    const group = document.createElement("div");
    group.className = "details-chip-group";

    const labelEl = document.createElement("div");
    labelEl.className = "details-chip-label";
    labelEl.textContent = label;
    group.appendChild(labelEl);

    const list = document.createElement("div");
    list.className = "details-chip-list";

    items.forEach(item => {
        const chip = document.createElement("span");
        chip.className = "details-chip";
        chip.textContent = item;
        list.appendChild(chip);
    });

    group.appendChild(list);
    container.appendChild(group);
    return true;
}

function createDetailActionLink(label, href) {
    const link = document.createElement("a");
    link.className = "details-action-btn";
    link.href = href;
    if (href.startsWith("http://") || href.startsWith("https://")) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
    }
    link.textContent = label;
    return link;
}

function createCopyAddressButton(address) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "details-action-btn details-action-btn-secondary";
    button.textContent = "Copy address";
    button.addEventListener("click", async () => {
        const copied = await copyTextToClipboard(address);
        const originalText = button.textContent;
        button.textContent = copied ? "Address copied" : "Copy failed";
        window.setTimeout(() => {
            button.textContent = originalText;
        }, 1800);
    });
    return button;
}

function sortByOrganizationInPlace(list) {
    list.sort((a, b) => {
        const nameA = getResourceTitle(a).toLowerCase();
        const nameB = getResourceTitle(b).toLowerCase();
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
        strong.textContent = getResourceTitle(resource) || "No name";
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
    const resourceId = normalizeString(resource?.id);
    updateSelectedResultCardState(resourceId);

    selectedResourceId = resourceId;
    if (activeMapScope === "results" || activeRightPanel === "map") {
        renderMapView();
        if (updateHistory) {
            updateUrlState();
        }
        if (focusDetails) {
            detailsDiv.focus();
        }
        return;
    }

    renderDetailsShell();
    destroyLeafletMap();
    const titleBlock = document.createElement("div");
    titleBlock.className = "details-title-block";
    titleBlock.appendChild(
        createTextBlock("div", "details-title", getResourceTitle(resource) || "No name")
    );
    appendChipGroupTo(titleBlock, "Categories", resource.Categories);
    rightPanelContent.appendChild(titleBlock);

    const phones = getResourcePhoneNumbers(resource);
    const websites = getResourceWebsites(resource);
    const address = formatResourceAddress(resource);
    const mapHref = getResourceMapHref(resource);

    const priorityGrid = document.createElement("div");
    priorityGrid.className = "details-priority-grid";

    const contactCard = createDetailsPriorityCard("Contact");
    const hasContactContent = [
        appendDetailListFieldTo(contactCard.body, "Phone", phones, {
            tel: true,
            plain: true,
            displayFormatter: getPhoneDisplayText
        }),
        appendDetailFieldTo(contactCard.body, "Email", resource.Email, { email: true }),
        appendDetailListFieldTo(contactCard.body, "Website", websites, {
            link: true,
            plain: true,
            displayFormatter: getWebsiteDisplayText
        })
    ].some(Boolean);
    if (hasContactContent) {
        priorityGrid.appendChild(contactCard.section);
    }

    const locationCard = createDetailsPriorityCard("Location");
    const hasLocation = appendDetailFieldTo(locationCard.body, "Address", address, {
        preserveLineBreaks: true,
        valueClassName: "details-address"
    });
    if (hasLocation) {
        const actionRow = document.createElement("div");
        actionRow.className = "details-action-row";
        if (mapHref) {
            actionRow.appendChild(createDetailActionLink("Open in map", mapHref));
        }
        actionRow.appendChild(createCopyAddressButton(address));
        locationCard.body.appendChild(actionRow);
        priorityGrid.appendChild(locationCard.section);
    }

    const factsCard = createDetailsPriorityCard("Quick Facts");
    const hasFacts = [
        appendDetailFieldTo(factsCard.body, "Eligibility", resource.Eligibility),
        appendDetailFieldTo(factsCard.body, "Hours", resource.Hours),
        appendDetailFieldTo(factsCard.body, "Cost", resource.Cost),
        appendDetailFieldTo(factsCard.body, "Last Verified", formatDisplayDate(resource["Last Verified"]))
    ].some(Boolean);
    if (hasFacts) {
        priorityGrid.appendChild(factsCard.section);
    }

    if (priorityGrid.childElementCount > 0) {
        rightPanelContent.appendChild(priorityGrid);
    }

    const overviewSection = createDetailsSection("Overview");
    if (appendRichTextBlockTo(overviewSection.body, resource.Description)) {
        rightPanelContent.appendChild(overviewSection.section);
    }

    const detailsSection = createDetailsSection("Program Details");
    const hasProgramDetails = [
        appendChipGroupTo(detailsSection.body, "Subcategories", resource.Subcategories, formatSubcategoryLabel),
        appendRichTextBlockTo(detailsSection.body, resource.Notes)
    ].some(Boolean);
    if (hasProgramDetails) {
        rightPanelContent.appendChild(detailsSection.section);
    }

    if (updateHistory) {
        updateUrlState();
    }
    if (focusDetails) {
        detailsDiv.focus();
    }
}

function showError(message) {
    destroyLeafletMap();
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
    activeMapScope = "selected";
    activeRightPanel = "details";
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
            getResourceTitle(resource),
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
