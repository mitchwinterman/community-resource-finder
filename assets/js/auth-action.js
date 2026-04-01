import { auth } from "./firebase.js";
import {
  confirmPasswordReset,
  verifyPasswordResetCode
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const titleEl = document.getElementById("auth-action-title");
const messageEl = document.getElementById("auth-action-message");
const formEl = document.getElementById("auth-action-form");
const errorEl = document.getElementById("auth-action-error");
const newPasswordInput = document.getElementById("new-password");
const confirmPasswordInput = document.getElementById("confirm-password");
const resetPasswordBtn = document.getElementById("resetPasswordBtn");
const loginLink = document.getElementById("auth-login-link");

const params = new URLSearchParams(window.location.search);
const mode = normalizeString(params.get("mode"));
const oobCode = normalizeString(params.get("oobCode"));
const continueUrl = getSafeContinueUrl(params.get("continueUrl"));

let redirectTimerId = null;

function normalizeString(value) {
  return String(value ?? "").trim();
}

function getSafeContinueUrl(rawValue) {
  const fallbackUrl = new URL("login.html", window.location.href);
  const normalized = normalizeString(rawValue);
  if (!normalized) return fallbackUrl.href;

  try {
    const parsed = new URL(normalized, window.location.href);
    if (parsed.origin !== window.location.origin) {
      return fallbackUrl.href;
    }

    return parsed.href;
  } catch {
    return fallbackUrl.href;
  }
}

function getSuccessRedirectUrl() {
  const successUrl = new URL(continueUrl, window.location.href);
  successUrl.searchParams.set("passwordReset", "1");
  return successUrl.href;
}

function setMessage(message) {
  if (messageEl) {
    messageEl.textContent = message;
  }
}

function setError(message = "") {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.remove("success");
}

function setSuccess(message = "") {
  if (!errorEl) return;
  errorEl.textContent = message;
  errorEl.classList.add("success");
}

function showUnsupportedState(message) {
  titleEl.textContent = "Account Access";
  setMessage(message);
  setError("");
  formEl?.classList.add("hidden");
}

function startRedirectCountdown(seconds = 5) {
  let remaining = seconds;
  setMessage(`Password changed. Redirecting to the login page in ${remaining} seconds...`);

  redirectTimerId = window.setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      window.clearInterval(redirectTimerId);
      window.location.assign(getSuccessRedirectUrl());
      return;
    }
    setMessage(`Password changed. Redirecting to the login page in ${remaining} seconds...`);
  }, 1000);
}

async function initializeResetPasswordView() {
  loginLink?.setAttribute("href", continueUrl);

  if (mode !== "resetPassword" || !oobCode) {
    showUnsupportedState("This link is not valid for password reset. Return to the login page and request a new reset link.");
    return;
  }

  try {
    const email = await verifyPasswordResetCode(auth, oobCode);
    titleEl.textContent = "Set New Password";
    setMessage(`Choose a new password for ${email}.`);
    formEl?.classList.remove("hidden");
    newPasswordInput?.focus();
  } catch (err) {
    console.error("Password reset verification error:", err);
    showUnsupportedState("This password reset link is invalid or has expired. Return to the login page and request a new reset link.");
  }
}

resetPasswordBtn?.addEventListener("click", async () => {
  setError("");
  setSuccess("");

  const newPassword = newPasswordInput?.value || "";
  const confirmPassword = confirmPasswordInput?.value || "";

  if (newPassword.length < 6) {
    setError("Please enter a password with at least 6 characters.");
    newPasswordInput?.focus();
    return;
  }

  if (newPassword !== confirmPassword) {
    setError("The password confirmation does not match.");
    confirmPasswordInput?.focus();
    return;
  }

  try {
    await confirmPasswordReset(auth, oobCode, newPassword);
    formEl?.classList.add("hidden");
    setSuccess("You can now sign in with your new password.");
    startRedirectCountdown(5);
  } catch (err) {
    console.error("Password reset confirmation error:", err);
    setError("This password reset link is no longer valid. Return to the login page and request a new reset link.");
  }
});

initializeResetPasswordView();
