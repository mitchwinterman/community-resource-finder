import { auth } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getAccessProfile,
  redirectToPortalForProfile
} from "./auth-routing.js";

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const loginError = document.getElementById("login-error");

let authStatusMessage = "";

function normalizeString(value) {
  return String(value ?? "").trim();
}

loginBtn?.addEventListener("click", async () => {
  authStatusMessage = "";
  loginError.textContent = "";

  const email = normalizeString(emailInput.value);
  const password = passwordInput.value;
  if (!email || !password) {
    loginError.textContent = "Please enter email and password.";
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error("Login error:", err);
    loginError.textContent = err?.message || "Login failed.";
  }
});

onAuthStateChanged(auth, async user => {
  if (!user) {
    loginError.textContent = authStatusMessage;
    return;
  }

  try {
    const profile = await getAccessProfile(user);
    if (redirectToPortalForProfile(profile)) {
      authStatusMessage = "";
      return;
    }

    authStatusMessage = `Signed in as ${user.email || "(no email)"} but this account does not have portal access yet.`;
    await signOut(auth);
  } catch (err) {
    console.error("Portal routing error:", err);
    authStatusMessage = err?.message || "Unable to determine account access.";
    await signOut(auth);
  }
});
