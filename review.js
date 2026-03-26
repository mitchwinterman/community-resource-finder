import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const reviewPageTitle = document.getElementById("review-page-title");
const reviewMessage = document.getElementById("review-message");
const reviewDetails = document.getElementById("review-details");
const reviewActionBar = document.getElementById("review-action-bar");
const confirmReviewBtn = document.getElementById("confirm-review-btn");
const reviewLoginLink = document.getElementById("review-login-link");

let reviewDoc = null;
let reviewToken = "";

function normalizeString(value) {
  return String(value ?? "").trim();
}

function clearChildren(el) {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
}

function createEl(tag, opts = {}) {
  const el = document.createElement(tag);
  if (opts.className) el.className = opts.className;
  if (opts.text != null) el.textContent = opts.text;
  if (opts.attrs) {
    Object.entries(opts.attrs).forEach(([key, value]) => {
      el.setAttribute(key, value);
    });
  }
  return el;
}

function getLoginUrl() {
  return new URL("login.html", window.location.href).href;
}

function buildMetaBlock(title, rows) {
  const block = createEl("div", { className: "request-block" });
  block.appendChild(createEl("h4", { text: title }));

  const list = createEl("div", { className: "request-meta-list" });
  rows.forEach(([label, value]) => {
    const row = createEl("div", { className: "request-meta-row" });
    row.appendChild(createEl("strong", { text: label }));
    row.appendChild(createEl("span", { text: normalizeString(value) || "(None)" }));
    list.appendChild(row);
  });

  block.appendChild(list);
  return block;
}

function buildMessageCard(text, tone = "info") {
  return createEl("div", {
    className: `review-message-card ${tone}`,
    text
  });
}

function setMessage(text, tone = "info") {
  clearChildren(reviewMessage);
  reviewMessage.appendChild(buildMessageCard(text, tone));
}

function setUnavailableState(message) {
  reviewDoc = null;
  clearChildren(reviewDetails);
  reviewPageTitle.textContent = "Review Link Unavailable";
  setMessage(message, "warning");
  confirmReviewBtn.disabled = true;
  reviewActionBar.classList.add("review-action-bar-disabled");
}

function renderReviewState() {
  if (!reviewDoc) {
    setUnavailableState("This review link is invalid, expired, or no longer available.");
    return;
  }

  const resourceName = normalizeString(reviewDoc.resourceName) || "Resource listing";
  const organizationName = normalizeString(reviewDoc.organizationName) || "Organization";
  const recipientEmail = normalizeString(reviewDoc.recipientEmail);
  const anchorDate = normalizeString(reviewDoc.reviewAnchorDate);
  const status = normalizeString(reviewDoc.status).toLowerCase();

  reviewPageTitle.textContent = `Quarterly Review: ${resourceName}`;
  clearChildren(reviewDetails);
  reviewDetails.appendChild(buildMetaBlock("Listing Details", [
    ["Resource", resourceName],
    ["Organization", organizationName],
    ["Recipient", recipientEmail],
    ["Current Review Date", anchorDate || "(Not set)"]
  ]));

  reviewLoginLink.href = getLoginUrl();

  if (status === "confirmed" || status === "applied") {
    setMessage("Thanks. Your confirmation has been recorded. If you still need to make edits, you can sign in to the organization portal below.", "success");
    confirmReviewBtn.disabled = true;
    reviewActionBar.classList.add("review-action-bar-disabled");
    return;
  }

  if (status !== "sent") {
    setUnavailableState("This review link is no longer active. If updates are needed, please sign in to the organization portal.");
    return;
  }

  setMessage("Please confirm whether this listing still looks correct. If it does, use the confirmation button below. If it needs changes, use the organization portal link instead.", "info");
  confirmReviewBtn.disabled = false;
  reviewActionBar.classList.remove("review-action-bar-disabled");
}

async function loadReviewToken() {
  const token = normalizeString(new URLSearchParams(window.location.search).get("token"));
  reviewToken = token;
  reviewLoginLink.href = getLoginUrl();

  if (!token) {
    setUnavailableState("This review link is missing its token. Please use the full link from the quarterly review email.");
    return;
  }

  try {
    const snap = await getDoc(doc(db, "review_confirmations", token));
    if (!snap.exists()) {
      setUnavailableState("This review link is invalid or expired. If you still need access, please sign in to the organization portal.");
      return;
    }

    reviewDoc = { id: snap.id, ...snap.data() };
    renderReviewState();
  } catch (err) {
    console.error("Error loading review confirmation:", err);
    setUnavailableState("This review link is unavailable right now. Please try again later or sign in to the organization portal.");
  }
}

confirmReviewBtn?.addEventListener("click", async () => {
  if (!reviewToken || !reviewDoc || normalizeString(reviewDoc.status).toLowerCase() !== "sent") return;

  confirmReviewBtn.disabled = true;

  try {
    await updateDoc(doc(db, "review_confirmations", reviewToken), {
      status: "confirmed",
      confirmedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    reviewDoc = {
      ...reviewDoc,
      status: "confirmed"
    };
    renderReviewState();
  } catch (err) {
    console.error("Error confirming review:", err);
    confirmReviewBtn.disabled = false;
    setMessage("We could not record that confirmation just now. Please try again, or use the organization portal if edits are needed.", "warning");
  }
});

loadReviewToken();
