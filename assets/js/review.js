import { db } from "./firebase.js";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  normalizeWebsiteList,
  normalizePhoneEntries,
  getPhoneDisplayText,
  getPhoneHref,
  getWebsiteDisplayText
} from "./contact-fields.js";

const reviewPageTitle = document.getElementById("review-page-title");
const reviewMessage = document.getElementById("review-message");
const reviewDetails = document.getElementById("review-details");
const reviewActionBar = document.getElementById("review-action-bar");
const confirmReviewBtn = document.getElementById("confirm-review-btn");
const reviewLoginLink = document.getElementById("review-login-link");

let reviewDoc = null;
let reviewToken = "";
let resourceDoc = null;

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
  if (opts.html != null) el.innerHTML = opts.html;
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

function getDOMPurify() {
  if (!window.DOMPurify) {
    throw new Error("DOMPurify is not available on this page.");
  }
  return window.DOMPurify;
}

function sanitizeRichTextHtml(html) {
  const clean = getDOMPurify().sanitize(String(html ?? ""), {
    ALLOWED_TAGS: ["a", "br", "em", "li", "ol", "p", "strong", "u", "ul"],
    ALLOWED_ATTR: ["href", "target", "rel"]
  });

  const template = document.createElement("template");
  template.innerHTML = clean;
  if (!normalizeString(template.content.textContent || "")) {
    return "";
  }

  return clean;
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => normalizeString(item)).filter(Boolean);
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

function buildRichTextBlock(title, html) {
  const cleanHtml = sanitizeRichTextHtml(html);
  if (!cleanHtml) return null;

  const block = createEl("div", { className: "request-block" });
  block.appendChild(createEl("h4", { text: title }));
  block.appendChild(createEl("div", {
    className: "field-meta-value",
    html: cleanHtml
  }));
  return block;
}

function buildListBlock(title, values, linkBuilder = null) {
  const items = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!items.length) return null;

  const block = createEl("div", { className: "request-block" });
  block.appendChild(createEl("h4", { text: title }));
  const list = createEl("ul");

  items.forEach(item => {
    const li = createEl("li");
    const href = typeof linkBuilder === "function" ? normalizeString(linkBuilder(item)) : "";
    if (href) {
      li.appendChild(createEl("a", {
        text: item,
        attrs: {
          href,
          target: "_blank",
          rel: "noopener noreferrer"
        }
      }));
    } else {
      li.textContent = item;
    }
    list.appendChild(li);
  });

  block.appendChild(list);
  return block;
}

function buildResourceView(resource) {
  const source = resource && typeof resource === "object" ? resource : {};
  const fragment = document.createDocumentFragment();

  const descriptionBlock = buildRichTextBlock("Short Description", source.Description);
  if (descriptionBlock) fragment.appendChild(descriptionBlock);

  const notesBlock = buildRichTextBlock("Detailed Description", source.Notes);
  if (notesBlock) fragment.appendChild(notesBlock);

  const taxonomyRows = [
    ["Categories", normalizeStringArray(source.Categories).join(", ")],
    ["Subcategories", normalizeStringArray(source.Subcategories).join(", ")],
    ["Keywords", normalizeString(source.Keywords)],
    ["Last Verified", normalizeString(source["Last Verified"])]
  ].filter(([, value]) => normalizeString(value));
  if (taxonomyRows.length) {
    fragment.appendChild(buildMetaBlock("Taxonomy", taxonomyRows));
  }

  const websites = normalizeWebsiteList(Array.isArray(source.Websites) ? source.Websites : source.Website)
    .map(item => ({ text: getWebsiteDisplayText(item), href: item }))
    .filter(item => item.text);
  const phones = normalizePhoneEntries(Array.isArray(source.PhoneNumbers) ? source.PhoneNumbers : source.Phone)
    .map(item => ({ text: getPhoneDisplayText(item), href: getPhoneHref(item) }))
    .filter(item => item.text);

  const contactRows = [
    ["Email", normalizeString(source.Email)],
    ["Hours", normalizeString(source.Hours)],
    ["Eligibility", normalizeString(source.Eligibility)],
    ["Cost", normalizeString(source.Cost)],
    ["Languages", normalizeString(source.Languages)]
  ].filter(([, value]) => normalizeString(value));
  if (contactRows.length) {
    fragment.appendChild(buildMetaBlock("Contact and Access", contactRows));
  }

  const phoneBlock = buildListBlock("Phone Numbers", phones.map(item => item.text), value => {
    const match = phones.find(item => item.text === value);
    return match?.href || "";
  });
  if (phoneBlock) fragment.appendChild(phoneBlock);

  const websiteBlock = buildListBlock("Websites", websites.map(item => item.text), value => {
    const match = websites.find(item => item.text === value);
    return match?.href || "";
  });
  if (websiteBlock) fragment.appendChild(websiteBlock);

  const locationRows = [
    ["Address", normalizeString(source.Address)],
    ["City", normalizeString(source.City)],
    ["Zip", normalizeString(source.Zip)]
  ].filter(([, value]) => normalizeString(value));
  if (locationRows.length) {
    fragment.appendChild(buildMetaBlock("Location", locationRows));
  }

  return fragment;
}

function setMessage(text, tone = "info") {
  clearChildren(reviewMessage);
  reviewMessage.appendChild(buildMessageCard(text, tone));
}

function setUnavailableState(message) {
  reviewDoc = null;
  resourceDoc = null;
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

  if (resourceDoc) {
    reviewDetails.appendChild(buildResourceView(resourceDoc));
  } else {
    reviewDetails.appendChild(buildMetaBlock("Listing Preview", [
      ["Status", "This listing preview is temporarily unavailable."]
    ]));
  }

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
    resourceDoc = null;
    const resourceId = normalizeString(reviewDoc.resourceId);
    if (resourceId) {
      try {
        const resourceSnap = await getDoc(doc(db, "resources", resourceId));
        if (resourceSnap.exists()) {
          resourceDoc = { id: resourceSnap.id, ...resourceSnap.data() };
        }
      } catch (resourceErr) {
        console.error("Error loading resource preview:", resourceErr);
      }
    }
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
    setMessage("Thanks. Your confirmation has been received and sent to library staff for review. Redirecting you to the organization portal...", "success");
    window.setTimeout(() => {
      window.location.href = getLoginUrl();
    }, 1500);
  } catch (err) {
    console.error("Error confirming review:", err);
    confirmReviewBtn.disabled = false;
    setMessage("We could not record that confirmation just now. Please try again, or use the organization portal if edits are needed.", "warning");
  }
});

loadReviewToken();
