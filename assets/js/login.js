import { auth } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
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
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const loginError = document.getElementById("login-error");

let authStatusMessage = "";

function normalizeString(value) {
  return String(value ?? "").trim();
}

function showLoginMessage(message, type = "error") {
  if (!loginError) return;
  loginError.textContent = message;
  loginError.classList.toggle("success", type === "success");
}

function getLoginReturnUrl() {
  return new URL("login.html", window.location.href).href;
}

function applyInitialLoginMessage() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("passwordReset") !== "1") return;

  authStatusMessage = "Password changed. Sign in with your new password.";
  showLoginMessage(authStatusMessage, "success");
  params.delete("passwordReset");

  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
  window.history.replaceState({}, "", nextUrl);
}

loginBtn?.addEventListener("click", async () => {
  authStatusMessage = "";
  showLoginMessage("");

  const email = normalizeString(emailInput.value);
  const password = passwordInput.value;
  if (!email || !password) {
    showLoginMessage("Please enter email and password.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error("Login error:", err);
    showLoginMessage(err?.message || "Login failed.");
  }
});

forgotPasswordBtn?.addEventListener("click", async () => {
  authStatusMessage = "";
  showLoginMessage("");

  const email = normalizeString(emailInput.value);
  if (!email) {
    showLoginMessage("Enter your email address first, then select Forgot password.");
    emailInput?.focus();
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email, {
      url: getLoginReturnUrl()
    });
    showLoginMessage("If an account exists for that email, a password reset link has been sent.", "success");
  } catch (err) {
    console.error("Password reset error:", err);
    if (err?.code === "auth/invalid-email") {
      showLoginMessage("Please enter a valid email address.");
      return;
    }
    if (err?.code === "auth/too-many-requests") {
      showLoginMessage("Too many reset attempts. Please wait a few minutes and try again.");
      return;
    }
    showLoginMessage("Unable to send a password reset email right now. Please try again.");
  }
});

applyInitialLoginMessage();

onAuthStateChanged(auth, async user => {
  if (!user) {
    showLoginMessage(authStatusMessage, authStatusMessage === "Password changed. Sign in with your new password." ? "success" : "error");
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
