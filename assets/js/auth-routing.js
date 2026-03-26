import { db } from "./firebase.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getIdTokenResult
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

function normalizeString(value) {
  return String(value ?? "").trim();
}

export async function getAccessProfile(user) {
  if (!user) {
    return {
      isAdmin: false,
      hasActiveMembership: false,
      membership: null
    };
  }

  let isAdmin = false;
  try {
    const tokenResult = await getIdTokenResult(user, true);
    isAdmin = tokenResult?.claims?.admin === true;
  } catch (err) {
    console.error("Error reading auth claims:", err);
  }

  let membership = null;
  try {
    const membershipSnap = await getDoc(doc(db, "organization_members", user.uid));
    if (membershipSnap.exists()) {
      membership = {
        id: membershipSnap.id,
        ...membershipSnap.data()
      };
    }
  } catch (err) {
    console.error("Error loading organization membership:", err);
  }

  const hasActiveMembership =
    membership != null &&
    normalizeString(membership.status) === "active" &&
    normalizeString(membership.organizationId) !== "";

  return {
    isAdmin,
    hasActiveMembership,
    membership
  };
}

export function getPortalPathForProfile(profile) {
  if (profile?.isAdmin) return "admin.html";
  if (profile?.hasActiveMembership) return "org.html";
  return "";
}

export function redirectToPortalForProfile(profile) {
  const path = getPortalPathForProfile(profile);
  if (!path) return false;

  const currentPath = window.location.pathname.split("/").pop() || "";
  if (currentPath !== path) {
    window.location.replace(path);
  }
  return true;
}

export function redirectToUnifiedLogin() {
  const currentPath = window.location.pathname.split("/").pop() || "";
  if (currentPath !== "login.html") {
    window.location.replace("login.html");
  }
}
