import { db, auth } from "./firebase.js";
import {
    collection,
    getDocs,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const ADMIN_EMAIL = "mwinterman@washoecounty.gov";

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const previewBtn = document.getElementById("previewBtn");
const runBtn = document.getElementById("runBtn");
const loginError = document.getElementById("login-error");
const statusEl = document.getElementById("status");
const logEl = document.getElementById("log");

function log(message) {
    const ts = new Date().toISOString();
    logEl.textContent += `[${ts}] ${message}\n`;
    logEl.scrollTop = logEl.scrollHeight;
}

function normalizeString(value) {
    return String(value ?? "").trim();
}

function normalizeStringArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map(item => normalizeString(item)).filter(Boolean);
}

function setBusy(isBusy) {
    loginBtn.disabled = isBusy;
    previewBtn.disabled = isBusy || !currentUserIsAdmin();
    runBtn.disabled = isBusy || !currentUserIsAdmin();
    logoutBtn.disabled = isBusy || !currentUserIsAdmin();
}

function currentUserIsAdmin() {
    const user = auth.currentUser;
    return !!user && normalizeString(user.email).toLowerCase() === ADMIN_EMAIL.toLowerCase();
}

async function loadJson(path) {
    const resp = await fetch(path);
    if (!resp.ok) {
        throw new Error(`Failed to fetch ${path}: ${resp.status} ${resp.statusText}`);
    }
    return await resp.json();
}

function parseCategoryDefinitions(rawCats) {
    const categories = Object.keys(rawCats || {})
        .map(label => normalizeString(label))
        .filter(Boolean);

    const subcategories = Array.from(new Set(
        Object.values(rawCats || {}).flatMap(value => normalizeStringArray(value))
    ));

    return { categories, subcategories };
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

function matchKnownCategories(storedValue, options) {
    if (Array.isArray(storedValue)) {
        return {
            matches: applyLegacyCategoryAliases(storedValue),
            leftovers: []
        };
    }

    const raw = normalizeString(storedValue);
    if (!raw) {
        return { matches: [], leftovers: [] };
    }

    const normalizedOptions = new Map(
        (options || [])
            .map(option => normalizeString(option))
            .filter(Boolean)
            .map(option => [option.toLowerCase(), option])
    );
    const candidates = buildCategoryCandidates(options);
    const found = new Map();
    let working = raw;

    candidates.forEach(({ label, canonical }) => {
        const canonicalLabel = normalizedOptions.get(canonical.toLowerCase());
        if (!canonicalLabel) return;

        const matcher = new RegExp(escapeRegExp(label), "ig");
        if (matcher.test(working)) {
            found.set(canonicalLabel.toLowerCase(), canonicalLabel);
            working = working.replace(matcher, " ");
        }
    });

    const leftovers = working
        .split(",")
        .map(part => normalizeString(part))
        .filter(Boolean);

    return { matches: Array.from(found.values()), leftovers };
}

function parseLegacySubcategories(storedValue) {
    if (Array.isArray(storedValue)) {
        return normalizeStringArray(storedValue);
    }

    return normalizeString(storedValue)
        .split(",")
        .map(part => normalizeString(part))
        .filter(Boolean);
}

async function loadDefinitions() {
    const rawCats = await loadJson("categories.json");
    return parseCategoryDefinitions(rawCats);
}

function analyzeResource(resource, definitions) {
    const categoryResult = matchKnownCategories(resource.Categories, definitions.categories);

    return {
        nextCategories: categoryResult.matches,
        nextSubcategories: parseLegacySubcategories(resource.Subcategories),
        categoryLeftovers: categoryResult.leftovers.join(" | "),
        categoriesAlreadyArray: Array.isArray(resource.Categories),
        subcategoriesAlreadyArray: Array.isArray(resource.Subcategories)
    };
}

async function previewMigration() {
    setBusy(true);
    log("Loading category definitions from local categories.json...");

    try {
        const definitions = await loadDefinitions();
        log(`Loaded ${definitions.categories.length} categories and ${definitions.subcategories.length} subcategories from categories.json.`);

        const resourceSnap = await getDocs(collection(db, "resources"));
        let total = 0;
        let needsMigration = 0;
        let warningCount = 0;

        resourceSnap.forEach(docSnap => {
            total++;
            const resource = docSnap.data() || {};
            const analysis = analyzeResource(resource, definitions);

            if (!analysis.categoriesAlreadyArray || !analysis.subcategoriesAlreadyArray) {
                needsMigration++;
            }

            if (analysis.categoryLeftovers) {
                warningCount++;
                log(
                    `WARNING ${docSnap.id} (${normalizeString(resource.Organization) || "Unnamed"}): ` +
                    `category leftovers="${analysis.categoryLeftovers}"`
                );
            }
        });

        log(`Preview complete. ${needsMigration} of ${total} resource docs need migration.`);
        if (warningCount === 0) {
            log("No unmatched category text detected.");
        } else {
            log(`${warningCount} doc(s) had unmatched category text. Review warnings before running migration.`);
        }
    } catch (err) {
        console.error(err);
        log(`ERROR during preview: ${err.message}`);
    } finally {
        setBusy(false);
    }
}

async function runMigration() {
    if (!confirm("This will rewrite Categories and Subcategories in Firestore to arrays. Continue?")) {
        return;
    }

    setBusy(true);
    log("Starting migration...");

    try {
        const definitions = await loadDefinitions();
        const resourceSnap = await getDocs(collection(db, "resources"));

        let scanned = 0;
        let updated = 0;
        let skipped = 0;

        for (const docSnap of resourceSnap.docs) {
            scanned++;
            const resource = docSnap.data() || {};
            const analysis = analyzeResource(resource, definitions);

            const needsMigration = !analysis.categoriesAlreadyArray || !analysis.subcategoriesAlreadyArray;
            if (!needsMigration) {
                continue;
            }

            if (analysis.categoryLeftovers) {
                skipped++;
                log(
                    `SKIPPED ${docSnap.id} (${normalizeString(resource.Organization) || "Unnamed"}): ` +
                    `unmatched category text detected.`
                );
                continue;
            }

            await updateDoc(docSnap.ref, {
                Categories: analysis.nextCategories,
                Subcategories: analysis.nextSubcategories
            });
            updated++;

            if (updated % 25 === 0) {
                log(`Updated ${updated} resource docs so far...`);
            }
        }

        log(`Migration complete. Scanned ${scanned} docs, updated ${updated}, skipped ${skipped}.`);
    } catch (err) {
        console.error(err);
        log(`ERROR during migration: ${err.message}`);
    } finally {
        setBusy(false);
    }
}

loginBtn.addEventListener("click", async () => {
    loginError.textContent = "";
    setBusy(true);

    try {
        await signInWithEmailAndPassword(auth, normalizeString(emailInput.value), passwordInput.value);
    } catch (err) {
        console.error(err);
        loginError.textContent = err?.message || "Login failed.";
        setBusy(false);
    }
});

logoutBtn.addEventListener("click", async () => {
    setBusy(true);
    try {
        await signOut(auth);
    } catch (err) {
        console.error(err);
        log(`ERROR during logout: ${err.message}`);
        setBusy(false);
    }
});

previewBtn.addEventListener("click", previewMigration);
runBtn.addEventListener("click", runMigration);

onAuthStateChanged(auth, async user => {
    if (!user) {
        statusEl.textContent = "Not signed in.";
        loginBtn.disabled = false;
        previewBtn.disabled = true;
        runBtn.disabled = true;
        logoutBtn.disabled = true;
        return;
    }

    if (!currentUserIsAdmin()) {
        loginError.textContent = `Signed in as ${user.email || "(no email)"} - not authorized.`;
        await signOut(auth);
        return;
    }

    statusEl.textContent = `Signed in as ${user.email}.`;
    log(`Authenticated as ${user.email}.`);
    setBusy(false);
});
