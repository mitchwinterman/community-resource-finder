// import.js - one-time importer for data.json + categories.json into Firestore

import { db } from "./firebase.js";
import {
    collection,
    addDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const logEl = document.getElementById("log");
function log(message) {
    const ts = new Date().toISOString();
    logEl.textContent += `[${ts}] ${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
}

const btnResources = document.getElementById("import-resources-btn");
const btnCategories = document.getElementById("import-categories-btn");
const btnAll = document.getElementById("import-all-btn");

function setButtonsDisabled(disabled) {
    [btnResources, btnCategories, btnAll].forEach(btn => {
        if (!btn) return;
        btn.disabled = disabled;
    });
}

function normalizeString(value) {
    return String(value ?? "").trim();
}

function normalizeStringArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map(item => normalizeString(item)).filter(Boolean);
}

async function loadJson(path) {
    const resp = await fetch(path);
    if (!resp.ok) {
        throw new Error(`Failed to fetch ${path}: ${resp.status} ${resp.statusText}`);
    }
    return await resp.json();
}

function parseCategoryDefinitions(rawCats) {
    let categoryLabels = [];
    let rawSubcategories = {};

    if (rawCats && Array.isArray(rawCats.categories)) {
        categoryLabels = rawCats.categories;
        rawSubcategories = rawCats.subcategories || {};
    } else if (rawCats && typeof rawCats === "object") {
        categoryLabels = Object.keys(rawCats);
        rawSubcategories = rawCats;
    } else {
        throw new Error("categories.json is in an unexpected format.");
    }

    const categories = categoryLabels
        .map(label => normalizeString(label))
        .filter(Boolean);

    const subcategoriesByCategory = {};
    categories.forEach(catLabel => {
        subcategoriesByCategory[catLabel] = normalizeStringArray(rawSubcategories[catLabel]);
    });

    const allSubcategories = Array.from(new Set(
        Object.values(subcategoriesByCategory).flatMap(list => list)
    ));

    return {
        categories,
        subcategoriesByCategory,
        allSubcategories
    };
}

const LEGACY_CATEGORY_ALIASES = {
    "Children, Youth & Family Services": "Children, Youth & Family Services",
    "Employment, Education & Financial Assistance": "Employment, Education & Financial Assistance",
    "Employment Education & Job Training": "Employment, Education & Financial Assistance",
    "Employment, Education & Job Training": "Employment, Education & Financial Assistance",
    "Employment, Education, & Job Training": "Employment, Education & Financial Assistance",
    "Financial Assistance & Benefits": "Employment, Education & Financial Assistance",
    "Food, Clothing, & Basic Needs": "Food & Basic Needs",
    "Food Clothing & Basic Needs": "Food & Basic Needs",
    "Health Care & Wellness": "Health & Medical",
    "Healthcare & Wellness": "Health & Medical",
    "Mental Health, Addiction & Substance Use": "Mental Health & Substance Use",
    "Mental Health, Addiction, & Substance Use": "Mental Health & Substance Use",
    "Mental Health Addiction & Substance Use": "Mental Health & Substance Use",
    "Seniors & Disability Support": "Seniors & Disability Services"
};

function applyLegacyCategoryAliases(values) {
    const deduped = new Map();

    normalizeStringArray(values).forEach(value => {
        const canonical = LEGACY_CATEGORY_ALIASES[value] || value;
        deduped.set(canonical.toLowerCase(), canonical);
    });

    return Array.from(deduped.values());
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildCategoryCandidates(options) {
    const candidates = new Map();

    normalizeStringArray(options).forEach(option => {
        candidates.set(option.toLowerCase(), { label: option, canonical: option });
    });

    Object.entries(LEGACY_CATEGORY_ALIASES).forEach(([label, canonical]) => {
        const normalizedLabel = normalizeString(label);
        const normalizedCanonical = normalizeString(canonical);
        if (!normalizedLabel || !normalizedCanonical) return;

        candidates.set(normalizedLabel.toLowerCase(), {
            label: normalizedLabel,
            canonical: normalizedCanonical
        });
    });

    return Array.from(candidates.values()).sort((a, b) => b.label.length - a.label.length);
}

function parseKnownValues(storedValue, options) {
    if (Array.isArray(storedValue)) {
        return {
            matches: normalizeStringArray(storedValue),
            leftovers: ""
        };
    }

    const raw = normalizeString(storedValue);
    if (!raw) {
        return { matches: [], leftovers: "" };
    }

    let working = raw.toLowerCase();
    const matches = [];
    const used = new Set();

    const sortedOptions = (options || [])
        .map(option => normalizeString(option))
        .filter(Boolean)
        .sort((a, b) => b.length - a.length);

    sortedOptions.forEach(option => {
        const optionLower = option.toLowerCase();
        if (used.has(optionLower)) return;

        if (working.includes(optionLower)) {
            matches.push(option);
            used.add(optionLower);
            working = working.replace(optionLower, " ");
        }
    });

    const leftovers = working.replace(/[\s,;|/.-]+/g, "");
    return { matches, leftovers };
}

function convertResourceTaxonomy(resource, definitions) {
    const normalizedCategoryOptions = new Map(
        definitions.categories.map(category => [category.toLowerCase(), category])
    );
    const categoryCandidates = buildCategoryCandidates(definitions.categories);
    const matchedCategoryMap = new Map();
    let categoryWorking = normalizeString(resource.Categories);
    const unmatchedCategories = [];

    if (Array.isArray(resource.Categories)) {
        applyLegacyCategoryAliases(resource.Categories).forEach(category => {
            const canonical = normalizedCategoryOptions.get(category.toLowerCase());
            if (canonical) {
                matchedCategoryMap.set(canonical.toLowerCase(), canonical);
            } else {
                unmatchedCategories.push(category);
            }
        });
    } else if (categoryWorking) {
        categoryCandidates.forEach(({ label, canonical }) => {
            const canonicalLabel = normalizedCategoryOptions.get(canonical.toLowerCase());
            if (!canonicalLabel) return;

            const matcher = new RegExp(escapeRegExp(label), "ig");
            if (matcher.test(categoryWorking)) {
                matchedCategoryMap.set(canonicalLabel.toLowerCase(), canonicalLabel);
                categoryWorking = categoryWorking.replace(matcher, " ");
            }
        });

        unmatchedCategories.push(
            ...categoryWorking
                .split(",")
                .map(part => normalizeString(part))
                .filter(Boolean)
        );
    }

    const subcategoryResult = parseKnownValues(resource.Subcategories, definitions.allSubcategories);

    return {
        resource: {
            ...resource,
            Categories: Array.from(matchedCategoryMap.values()),
            Subcategories: subcategoryResult.matches
        },
        warnings: {
            categoryLeftovers: unmatchedCategories.join(" | "),
            subcategoryLeftovers: subcategoryResult.leftovers
        }
    };
}

async function importResources() {
    log("Starting import of resources from data.json ...");

    const [data, rawCats] = await Promise.all([
        loadJson("data.json"),
        loadJson("categories.json")
    ]);

    if (!Array.isArray(data)) {
        throw new Error("data.json is not an array. Cannot import.");
    }

    const definitions = parseCategoryDefinitions(rawCats);
    log(`Found ${data.length} resources in data.json.`);

    const resourcesCol = collection(db, "resources");

    let count = 0;
    let warned = 0;

    for (const resource of data) {
        const converted = convertResourceTaxonomy(resource, definitions);
        await addDoc(resourcesCol, converted.resource);
        count++;

        if (converted.warnings.categoryLeftovers || converted.warnings.subcategoryLeftovers) {
            warned++;
        }

        if (count % 20 === 0) {
            log(`Imported ${count} resources...`);
        }
    }

    if (warned > 0) {
        log(`Imported with ${warned} taxonomy warning(s). Review source data if needed.`);
    }

    log(`Finished importing resources. Total imported: ${count}.`);
}

async function importCategories() {
    log("Starting import of categories from categories.json ...");

    const rawCats = await loadJson("categories.json");
    const definitions = parseCategoryDefinitions(rawCats);

    log(`Detected ${definitions.categories.length} category labels.`);

    const categoriesCol = collection(db, "categories");
    let count = 0;

    for (const catLabel of definitions.categories) {
        const docData = {
            name: catLabel,
            subcategories: definitions.subcategoriesByCategory[catLabel] || []
        };

        await addDoc(categoriesCol, docData);
        count++;

        if (count % 10 === 0) {
            log(`Imported ${count} categories...`);
        }
    }

    log(`Finished importing categories. Total imported: ${count}.`);
}

btnResources.addEventListener("click", async () => {
    try {
        setButtonsDisabled(true);
        await importResources();
        log("Resources import complete.");
    } catch (err) {
        console.error(err);
        log(`ERROR during resources import: ${err.message}`);
    } finally {
        setButtonsDisabled(false);
    }
});

btnCategories.addEventListener("click", async () => {
    try {
        setButtonsDisabled(true);
        await importCategories();
        log("Categories import complete.");
    } catch (err) {
        console.error(err);
        log(`ERROR during categories import: ${err.message}`);
    } finally {
        setButtonsDisabled(false);
    }
});

btnAll.addEventListener("click", async () => {
    try {
        setButtonsDisabled(true);
        log("Running full import: resources THEN categories...");
        await importResources();
        await importCategories();
        log("Full import complete.");
    } catch (err) {
        console.error(err);
        log(`ERROR during full import: ${err.message}`);
    } finally {
        setButtonsDisabled(false);
    }
});
