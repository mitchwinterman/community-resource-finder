import { expect } from "@playwright/test";

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function mergeObjects(target, source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return source === undefined ? target : source;
  }

  const base = target && typeof target === "object" && !Array.isArray(target)
    ? { ...target }
    : {};

  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      base[key] = mergeObjects(base[key], value);
      continue;
    }
    base[key] = value;
  }

  return base;
}

export function buildMockState(overrides = {}) {
  const base = {
    auth: {
      currentUser: null,
      resetEmail: "editor@foodbank.example.org",
      usersByEmail: {
        "admin@example.org": { uid: "admin-1", email: "admin@example.org" },
        "editor@foodbank.example.org": { uid: "member-1", email: "editor@foodbank.example.org" }
      },
      claimsByUid: {
        "admin-1": { admin: true },
        "member-1": { admin: false }
      }
    },
    collections: {
      categories: {
        "cat-housing": {
          name: "Housing",
          subcategories: ["Emergency Shelter", "Rent Assistance"]
        },
        "cat-food": {
          name: "Food & Nutrition",
          subcategories: ["Food Pantry", "Meal Program"]
        }
      },
      organizations: {
        "org-1": {
          name: "Northern Nevada Food Bank",
          status: "active",
          primaryEmail: "hello@foodbank.example.org",
          phone: "(775) 555-1200",
          website: "https://foodbank.example.org"
        },
        "org-2": {
          name: "Safe Harbor Housing",
          status: "active",
          primaryEmail: "info@safeharbor.example.org",
          phone: "(775) 555-2200",
          website: "https://safeharbor.example.org"
        }
      },
      resources: {
        "res-1": {
          resourceTitle: "Downtown Food Pantry",
          organizationId: "org-1",
          status: "published",
          submissionState: "approved",
          Description: "<p>Weekly grocery assistance for families.</p>",
          Notes: "<p>Bring ID and proof of address.</p>",
          Categories: ["Food & Nutrition"],
          Subcategories: ["Food Pantry"],
          Keywords: "food groceries pantry",
          Websites: ["https://foodbank.example.org/pantry"],
          PhoneNumbers: [{ label: "Main", number: "(775) 555-1234" }],
          Email: "pantry@foodbank.example.org",
          Address: "123 Market St",
          City: "Reno",
          Zip: "89501",
          Latitude: "39.5296",
          Longitude: "-119.8138",
          IncludeInMap: true,
          Hours: "Mon-Fri 9am-4pm",
          Eligibility: "Washoe County residents",
          Cost: "Free",
          Languages: "English, Spanish",
          "Last Verified": "2026-03-01"
        },
        "res-2": {
          resourceTitle: "Family Shelter Intake",
          organizationId: "org-2",
          status: "published",
          submissionState: "approved",
          Description: "<p>Emergency shelter intake and referral.</p>",
          Notes: "<p>Call ahead when possible.</p>",
          Categories: ["Housing"],
          Subcategories: ["Emergency Shelter"],
          Keywords: "housing shelter family",
          Websites: ["https://safeharbor.example.org/intake"],
          PhoneNumbers: [{ number: "(775) 555-5678" }],
          Email: "intake@safeharbor.example.org",
          Address: "500 Shelter Ave",
          City: "Sparks",
          Zip: "89431",
          Latitude: "39.5349",
          Longitude: "-119.7527",
          IncludeInMap: true,
          Hours: "24/7",
          Eligibility: "Families with children",
          Cost: "Free",
          Languages: "English",
          "Last Verified": "2026-02-15"
        },
        "res-3": {
          resourceTitle: "Rent Support Navigation",
          organizationId: "org-2",
          status: "published",
          submissionState: "approved",
          Description: "<p>Case management and rent support referrals.</p>",
          Notes: "<p>Appointments required.</p>",
          Categories: ["Housing"],
          Subcategories: ["Rent Assistance"],
          Keywords: "rent assistance case management",
          Websites: ["https://safeharbor.example.org/rent"],
          PhoneNumbers: [{ label: "Office", number: "(775) 555-9012" }],
          Email: "rent@safeharbor.example.org",
          Address: "800 Stability Way",
          City: "Reno",
          Zip: "89502",
          Latitude: "",
          Longitude: "",
          IncludeInMap: false,
          Hours: "Mon-Thu 8am-5pm",
          Eligibility: "Income qualified households",
          Cost: "Free",
          Languages: "English",
          "Last Verified": "2026-01-22"
        },
        "res-4": {
          resourceTitle: "Draft Intake Resource",
          organizationId: "org-1",
          status: "draft",
          submissionState: "pending",
          Description: "<p>Draft resource for admin smoke coverage.</p>",
          Notes: "<p>Not visible publicly.</p>",
          Categories: ["Food & Nutrition"],
          Subcategories: ["Meal Program"],
          IncludeInMap: false
        }
      },
      organization_members: {
        "member-1": {
          email: "editor@foodbank.example.org",
          organizationId: "org-1",
          role: "org_editor",
          status: "active",
          notes: "Smoke test editor"
        }
      },
      editor_invites: {
        "invite-1": {
          organizationId: "org-1",
          email: "new-editor@foodbank.example.org",
          role: "org_editor",
          status: "queued",
          customMessage: "Welcome aboard"
        }
      },
      resource_change_requests: {
        "req-1": {
          organizationId: "org-1",
          resourceId: "res-1",
          resourceName: "Downtown Food Pantry",
          requestType: "resource_update",
          status: "pending",
          submittedByUid: "member-1",
          submittedByEmail: "editor@foodbank.example.org",
          submitterNotes: "Updated the hours for summer operations.",
          proposedData: {
            Hours: "Mon-Fri 8am-4pm",
            Notes: "<p>Summer schedule is now in effect.</p>"
          }
        }
      },
      review_confirmations: {
        "review-token-1": {
          resourceId: "res-1",
          resourceName: "Downtown Food Pantry",
          organizationName: "Northern Nevada Food Bank",
          recipientEmail: "editor@foodbank.example.org",
          reviewAnchorDate: "2026-04-01",
          status: "sent"
        }
      },
      mail_queue: {
        "mail-1": {
          subject: "Quarterly review reminder",
          status: "queued",
          sourceCollection: "resource_change_requests",
          sourceId: "req-1"
        }
      },
      audit_logs: {
        "audit-1": {
          action: "resource.updated",
          actorEmail: "admin@example.org",
          relatedResourceId: "res-1"
        }
      },
      auth_user_actions: {}
    }
  };

  return mergeObjects(base, deepClone(overrides));
}

function createFirebaseAppModule() {
  return `
    export function initializeApp(config) {
      return { config };
    }
  `;
}

function createFirebaseFirestoreModule() {
  return `
    const DELETE_FIELD = Symbol("deleteField");

    function getState() {
      return globalThis.__CRF_TEST_STATE__ || { collections: {} };
    }

    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function ensureCollection(name) {
      const state = getState();
      if (!state.collections[name]) {
        state.collections[name] = {};
      }
      return state.collections[name];
    }

    function applyPatch(existing, patch) {
      const next = { ...(existing || {}) };
      Object.entries(patch || {}).forEach(([key, value]) => {
        if (value === DELETE_FIELD) {
          delete next[key];
          return;
        }
        next[key] = clone(value);
      });
      return next;
    }

    function buildDocSnapshot(id, value) {
      return {
        id,
        exists() {
          return value != null;
        },
        data() {
          return value == null ? undefined : clone(value);
        }
      };
    }

    function listDocs(collectionName) {
      const collection = ensureCollection(collectionName);
      return Object.entries(collection).map(([id, value]) => buildDocSnapshot(id, value));
    }

    function matchesWhere(docValue, constraint) {
      if (!constraint || constraint.kind !== "where") return true;
      if (constraint.op === "==") {
        return String(docValue?.[constraint.field] ?? "") === String(constraint.value ?? "");
      }
      if (constraint.op === "array-contains") {
        const value = docValue?.[constraint.field];
        return Array.isArray(value) && value.some(item => String(item ?? "") === String(constraint.value ?? ""));
      }
      throw new Error("Unsupported where clause in smoke tests.");
    }

    export function getFirestore(app) {
      return { app };
    }

    export function collection(db, name) {
      return { kind: "collection", name };
    }

    export function doc(dbOrCollection, collectionName, docId) {
      if (docId === undefined) {
        return {
          kind: "doc",
          collectionName: dbOrCollection?.name || "",
          id: collectionName
        };
      }

      return {
        kind: "doc",
        collectionName,
        id: docId
      };
    }

    export function where(field, op, value) {
      return { kind: "where", field, op, value };
    }

    export function query(ref, ...constraints) {
      return { kind: "query", ref, constraints };
    }

    export async function getDocs(ref) {
      const source = ref?.kind === "query" ? ref.ref : ref;
      const constraints = ref?.kind === "query" ? ref.constraints : [];
      const docs = listDocs(source?.name || "").filter(snapshot =>
        constraints.every(constraint => matchesWhere(snapshot.data(), constraint))
      );

      return {
        docs,
        empty: docs.length === 0,
        size: docs.length,
        forEach(callback) {
          docs.forEach(callback);
        }
      };
    }

    export async function getDoc(ref) {
      const collection = ensureCollection(ref.collectionName);
      const value = Object.prototype.hasOwnProperty.call(collection, ref.id)
        ? collection[ref.id]
        : null;
      return buildDocSnapshot(ref.id, value);
    }

    export async function addDoc(ref, value) {
      const collection = ensureCollection(ref.name);
      const nextId = \`\${ref.name}-\${Object.keys(collection).length + 1}\`;
      collection[nextId] = clone(value);
      return { id: nextId };
    }

    export async function setDoc(ref, value) {
      const collection = ensureCollection(ref.collectionName);
      collection[ref.id] = clone(value);
    }

    export async function updateDoc(ref, patch) {
      const collection = ensureCollection(ref.collectionName);
      collection[ref.id] = applyPatch(collection[ref.id], patch);
    }

    export async function deleteDoc(ref) {
      const collection = ensureCollection(ref.collectionName);
      delete collection[ref.id];
    }

    export function deleteField() {
      return DELETE_FIELD;
    }

    export function serverTimestamp() {
      return "2026-04-20T12:00:00.000Z";
    }
  `;
}

function createFirebaseAuthModule() {
  return `
    const listeners = new Set();

    function getState() {
      return globalThis.__CRF_TEST_STATE__ || { auth: {} };
    }

    function getCurrentUser() {
      return getState().auth?.currentUser || null;
    }

    function setCurrentUser(user) {
      const state = getState();
      if (!state.auth) {
        state.auth = {};
      }
      state.auth.currentUser = user || null;
    }

    function emitChange() {
      const user = getCurrentUser();
      listeners.forEach(listener => listener(user));
    }

    export function getAuth(app) {
      return { app };
    }

    export async function signInWithEmailAndPassword(auth, email) {
      const state = getState();
      const user = state.auth?.usersByEmail?.[String(email).trim().toLowerCase()];
      if (!user) {
        const error = new Error("auth/user-not-found");
        error.code = "auth/user-not-found";
        throw error;
      }
      setCurrentUser({ ...user });
      emitChange();
      return { user: getCurrentUser() };
    }

    export async function sendPasswordResetEmail() {
      return;
    }

    export async function signOut() {
      setCurrentUser(null);
      emitChange();
    }

    export function onAuthStateChanged(auth, callback) {
      listeners.add(callback);
      Promise.resolve().then(() => callback(getCurrentUser()));
      return () => listeners.delete(callback);
    }

    export async function getIdTokenResult(user) {
      const state = getState();
      return {
        claims: state.auth?.claimsByUid?.[user?.uid] || {}
      };
    }

    export async function verifyPasswordResetCode() {
      const state = getState();
      return state.auth?.resetEmail || "editor@foodbank.example.org";
    }

    export async function confirmPasswordReset() {
      return;
    }
  `;
}

function createLeafletScript() {
  return `
    class MockMarker {
      constructor(coords) {
        this.coords = coords;
      }

      addTo() {
        return this;
      }

      bindPopup() {
        return this;
      }

      openPopup() {
        return this;
      }

      on() {
        return this;
      }

      setStyle() {
        return this;
      }
    }

    class MockMap {
      setView() {
        return this;
      }

      invalidateSize() {
        return this;
      }

      fitBounds() {
        return this;
      }

      remove() {
        return this;
      }
    }

    window.L = {
      map(target) {
        if (target && !target.dataset.mockLeafletReady) {
          target.dataset.mockLeafletReady = "true";
          target.textContent = "";
        }
        return new MockMap();
      },
      tileLayer() {
        return {
          addTo() {
            return this;
          }
        };
      },
      circleMarker(coords) {
        return new MockMarker(coords);
      },
      marker(coords) {
        return new MockMarker(coords);
      }
    };
  `;
}

function createDomPurifyScript() {
  return `
    window.DOMPurify = {
      sanitize(html) {
        return String(html ?? "");
      }
    };
  `;
}

function createQuillScript() {
  return `
    class MockQuill {
      constructor(host) {
        this.host = host;
        this.history = {
          clear() {}
        };
        this.clipboard = {
          dangerouslyPasteHTML: (html) => {
            this.root.innerHTML = String(html ?? "");
          }
        };
        this.toolbar = document.createElement("div");
        this.toolbar.className = "ql-toolbar ql-snow";
        this.container = document.createElement("div");
        this.container.className = "ql-container ql-snow";
        this.root = document.createElement("div");
        this.root.className = "ql-editor";
        this.container.appendChild(this.root);
        this.host.appendChild(this.toolbar);
        this.host.appendChild(this.container);
        this._delta = null;
      }

      setContents(delta) {
        this._delta = delta;
        const text = Array.isArray(delta?.ops)
          ? delta.ops.map(op => typeof op.insert === "string" ? op.insert : "").join("")
          : "";
        this.root.textContent = text;
      }

      setText(text) {
        this._delta = { ops: [{ insert: String(text ?? "") }] };
        this.root.textContent = String(text ?? "");
      }

      getText() {
        return this.root.textContent || "";
      }

      getContents() {
        return this._delta || { ops: [{ insert: this.getText() }] };
      }

      getSemanticHTML() {
        return this.root.innerHTML;
      }
    }

    window.Quill = MockQuill;
  `;
}

export async function installOfflineRoutes(page, overrides = {}) {
  const state = buildMockState(overrides);
  await page.addInitScript(value => {
    window.__CRF_TEST_STATE__ = value;
  }, state);

  const moduleResponses = new Map([
    ["https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js", createFirebaseAppModule()],
    ["https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js", createFirebaseFirestoreModule()],
    ["https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js", createFirebaseAuthModule()]
  ]);

  await page.route(url => moduleResponses.has(url.toString()), async route => {
    const body = moduleResponses.get(route.request().url()) || "";
    await route.fulfill({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      body
    });
  });

  await page.route("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js", async route => {
    await route.fulfill({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      body: createLeafletScript()
    });
  });

  await page.route("https://cdn.jsdelivr.net/npm/dompurify@3.3.1/dist/purify.min.js", async route => {
    await route.fulfill({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      body: createDomPurifyScript()
    });
  });

  await page.route("https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js", async route => {
    await route.fulfill({
      status: 200,
      contentType: "text/javascript; charset=utf-8",
      body: createQuillScript()
    });
  });

  await page.route(/https:\/\/(?:unpkg\.com\/leaflet@1\.9\.4\/dist\/leaflet\.css|cdn\.jsdelivr\.net\/npm\/quill@2\.0\.3\/dist\/quill\.snow\.css|fonts\.googleapis\.com\/.*)/, async route => {
    await route.fulfill({
      status: 200,
      contentType: "text/css; charset=utf-8",
      body: ""
    });
  });

  await page.route(/https:\/\/fonts\.gstatic\.com\/.*/, async route => {
    await route.fulfill({
      status: 200,
      contentType: "font/woff2",
      body: ""
    });
  });
}

export function createRuntimeIssueCollector(page) {
  const errors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on("console", message => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  page.on("pageerror", error => {
    pageErrors.push(error.message);
  });

  page.on("requestfailed", request => {
    failedRequests.push(`${request.method()} ${request.url()}`);
  });

  return {
    async expectClean() {
      expect(errors, "console errors").toEqual([]);
      expect(pageErrors, "page errors").toEqual([]);
      expect(failedRequests, "failed network requests").toEqual([]);
    }
  };
}

export async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    docWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body ? document.body.scrollWidth : 0
  }));

  expect(Math.max(dimensions.docWidth, dimensions.bodyWidth)).toBeLessThanOrEqual(dimensions.innerWidth + 1);
}

export async function expectResponsiveMainPanels(page) {
  const viewport = page.viewportSize();
  const results = page.locator(".results-panel, .admin-list").first();
  const details = page.locator(".details-panel, .admin-editor").first();

  await expect(results).toBeVisible();
  await expect(details).toBeVisible();

  const [resultsBox, detailsBox] = await Promise.all([
    results.boundingBox(),
    details.boundingBox()
  ]);

  expect(resultsBox).not.toBeNull();
  expect(detailsBox).not.toBeNull();

  if (!resultsBox || !detailsBox || !viewport) return;

  if (viewport.width <= 900) {
    expect(resultsBox.y).toBeLessThan(detailsBox.y);
  } else {
    expect(resultsBox.x).toBeLessThan(detailsBox.x);
  }
}
