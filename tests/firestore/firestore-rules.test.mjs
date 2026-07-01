import assert from "node:assert/strict";
import fs from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where
} from "firebase/firestore";

const PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-crf-rules-test";
const EDITOR_A_UID = "editorA";
const EDITOR_B_UID = "editorB";
const EDITOR_A_EMAIL = "editor-a@example.org";
const EDITOR_B_EMAIL = "editor-b@example.org";
const ADMIN_EMAIL = "admin@example.org";
const NOW = new Date("2026-07-01T12:00:00.000Z");

let testEnv;

function getEmulatorConfig() {
  const [host, portText] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
  return {
    host,
    port: Number.parseInt(portText, 10)
  };
}

function resourceData(overrides = {}) {
  return {
    resourceTitle: "Seed Resource",
    Description: "Seed description",
    Categories: ["Food"],
    Subcategories: ["pantry"],
    organizationId: "orgA",
    status: "published",
    updatedAt: NOW,
    ...overrides
  };
}

function requestData(overrides = {}) {
  return {
    resourceId: "draftA",
    resourceName: "Draft A",
    organizationId: "orgA",
    submittedByUid: EDITOR_A_UID,
    submittedByEmail: EDITOR_A_EMAIL,
    requestType: "resource_edit",
    status: "pending",
    proposedData: {
      resourceTitle: "Draft A update"
    },
    submitterNotes: "",
    reviewNotes: "",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides
  };
}

function publicDb() {
  return testEnv.unauthenticatedContext().firestore();
}

function editorADb() {
  return testEnv.authenticatedContext(EDITOR_A_UID, {
    email: EDITOR_A_EMAIL
  }).firestore();
}

function adminDb() {
  return testEnv.authenticatedContext("admin", {
    admin: true,
    email: ADMIN_EMAIL
  }).firestore();
}

async function seedData() {
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await Promise.all([
      setDoc(doc(db, "organizations", "orgA"), {
        name: "Org A",
        primaryEmail: "info-a@example.org"
      }),
      setDoc(doc(db, "organizations", "orgB"), {
        name: "Org B",
        primaryEmail: "info-b@example.org"
      }),
      setDoc(doc(db, "organization_members", EDITOR_A_UID), {
        organizationId: "orgA",
        status: "active",
        email: EDITOR_A_EMAIL
      }),
      setDoc(doc(db, "organization_members", EDITOR_B_UID), {
        organizationId: "orgB",
        status: "active",
        email: EDITOR_B_EMAIL
      }),
      setDoc(doc(db, "resources", "publishedA"), resourceData({
        resourceTitle: "Published A",
        organizationId: "orgA",
        status: "published",
        Subcategories: ["pantry", "meals"]
      })),
      setDoc(doc(db, "resources", "draftA"), resourceData({
        resourceTitle: "Draft A",
        organizationId: "orgA",
        status: "draft",
        Subcategories: ["housing"]
      })),
      setDoc(doc(db, "resources", "draftB"), resourceData({
        resourceTitle: "Draft B",
        organizationId: "orgB",
        status: "draft",
        Subcategories: ["transportation"]
      })),
      setDoc(doc(db, "resource_change_requests", "pendingA"), requestData()),
      setDoc(doc(db, "resource_change_requests", "pendingB"), requestData({
        resourceId: "draftB",
        resourceName: "Draft B",
        organizationId: "orgB",
        submittedByUid: EDITOR_B_UID,
        submittedByEmail: EDITOR_B_EMAIL,
        proposedData: {
          resourceTitle: "Draft B update"
        }
      }))
    ]);
  });
}

before(async () => {
  const emulatorConfig = getEmulatorConfig();
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: fs.readFileSync("firestore.rules", "utf8"),
      host: emulatorConfig.host,
      port: emulatorConfig.port
    }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await seedData();
});

after(async () => {
  await testEnv?.cleanup();
});

test("public users can read published resources but not unpublished resources", async () => {
  const db = publicDb();
  const publishedSnap = await assertSucceeds(getDoc(doc(db, "resources", "publishedA")));
  assert.equal(publishedSnap.exists(), true);
  assert.equal(publishedSnap.data().status, "published");

  await assertFails(getDoc(doc(db, "resources", "draftA")));
});

test("public users can query published resources by subcategory", async () => {
  const db = publicDb();
  const resourcesQuery = query(
    collection(db, "resources"),
    where("status", "==", "published"),
    where("Subcategories", "array-contains", "pantry")
  );
  const snap = await assertSucceeds(getDocs(resourcesQuery));
  assert.deepEqual(snap.docs.map(item => item.id), ["publishedA"]);
});

test("org editors can read their own unpublished resources", async () => {
  const snap = await assertSucceeds(getDoc(doc(editorADb(), "resources", "draftA")));
  assert.equal(snap.exists(), true);
  assert.equal(snap.data().organizationId, "orgA");
});

test("org editors cannot read another organization's unpublished resources", async () => {
  await assertFails(getDoc(doc(editorADb(), "resources", "draftB")));
});

test("org editors cannot create edit or delete requests for another organization's resource", async () => {
  const db = editorADb();

  await assertFails(setDoc(doc(db, "resource_change_requests", "cross-org-edit"), requestData({
    resourceId: "draftB",
    resourceName: "Draft B"
  })));

  await assertFails(setDoc(doc(db, "resource_change_requests", "cross-org-delete"), requestData({
    resourceId: "draftB",
    resourceName: "Draft B",
    requestType: "resource_delete"
  })));
});

test("org editors cannot submit protected proposedData fields", async () => {
  const db = editorADb();
  const protectedFields = [
    ["status", "published"],
    ["organizationId", "orgB"],
    ["reviewNotes", "approve this"],
    ["reviewedBy", "admin"],
    ["updatedBy", "admin"]
  ];

  for (const [field, value] of protectedFields) {
    await assertFails(setDoc(doc(db, "resource_change_requests", `protected-${field}`), requestData({
      proposedData: {
        resourceTitle: "Invalid update",
        [field]: value
      }
    })));
  }

  await assertFails(setDoc(doc(db, "resource_change_requests", "protected-Website"), requestData({
    proposedData: {
      resourceTitle: "Invalid update",
      Website: "https://example.org"
    }
  })));

  await assertFails(setDoc(doc(db, "resource_change_requests", "protected-Phone"), requestData({
    proposedData: {
      resourceTitle: "Invalid update",
      Phone: "555-0100"
    }
  })));
});

test("org editors can cancel their own pending org request", async () => {
  await assertSucceeds(updateDoc(doc(editorADb(), "resource_change_requests", "pendingA"), {
    status: "cancelled",
    cancelledAt: NOW,
    updatedAt: NOW
  }));
});

test("org editors cannot cancel another organization's pending request", async () => {
  await assertFails(updateDoc(doc(editorADb(), "resource_change_requests", "pendingB"), {
    status: "cancelled",
    cancelledAt: NOW,
    updatedAt: NOW
  }));
});

test("admins can perform admin-only resource and request writes", async () => {
  const db = adminDb();

  await assertSucceeds(setDoc(doc(db, "resources", "admin-created"), resourceData({
    resourceTitle: "Admin Created",
    organizationId: "orgA",
    status: "draft"
  })));
  await assertSucceeds(updateDoc(doc(db, "resources", "draftA"), {
    status: "published",
    updatedAt: NOW
  }));
  await assertSucceeds(deleteDoc(doc(db, "resources", "draftB")));
  await assertSucceeds(updateDoc(doc(db, "resource_change_requests", "pendingA"), {
    status: "approved",
    reviewNotes: "Approved in test",
    updatedAt: NOW
  }));
  await assertSucceeds(deleteDoc(doc(db, "resource_change_requests", "pendingB")));
});
