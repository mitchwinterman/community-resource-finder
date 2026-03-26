export const SUBCATEGORY_REPLACEMENTS = Object.freeze({
  "Access To Healthcare": "Access to Healthcare",
  "Basic Skills Training (Bst)": "Basic Skills Training (BST)",
  "Dentistry)": "Dental Services",
  "Energy Assistance (Eap)": "Energy Assistance (EAP)",
  "Ent": "Ear, Nose & Throat (ENT)",
  "Etc.)": null,
  "Employment For People With Disabilities": "Employment for People with Disabilities",
  "Faith Based": "Faith-Based",
  "Hiv & Std Services": "HIV & STD Services",
  "Hiv Services": "HIV Services",
  "Information And Referrals": "Information and Referrals",
  "Job Skills (Automotive": "Automotive Training",
  "Lgbtq Support": "LGBTQ Support",
  "Mat": "Medication-Assisted Treatment (MAT)",
  "Medical Clinics (Optometry": "Eye Care",
  "Prison Re-Entry": "Reentry Services",
  "Prisoner Re-Entry": "Reentry Services",
  "Psychosocial Rehab (Psr)": "Psychosocial Rehabilitation (PSR)",
  "Psychosocial Rehabilitation (Psr)": "Psychosocial Rehabilitation (PSR)",
  "Services For The Blind": "Services for the Blind",
  "Snap": "SNAP",
  "Ssdi": "SSDI",
  "Ssi": "SSI",
  "Stabilization Services (Tanf": "Stabilization Services (TANF)",
  "Std Testing": "STD Testing",
  "Tanf": "TANF",
  "Va Pension": "VA Pension",
  "Welding)": "Welding Training",
  "Wic": "WIC",
  "Women And Children": "Women and Children",
  "Women And Families": "Women and Families",
  "Women\u2019S Health": "Women's Health",
  "Women\u2019S Health Connection": "Women's Health Connection",
  "Wrap-Around Services": "Wraparound Services"
});

export function normalizeString(value) {
  return String(value ?? "").trim();
}

export function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => normalizeString(item)).filter(Boolean);
}

export function parseStringList(value) {
  if (Array.isArray(value)) {
    return normalizeStringArray(value);
  }

  return normalizeString(value)
    .split(",")
    .map(item => normalizeString(item))
    .filter(Boolean);
}

export function canonicalizeSubcategoryLabel(label) {
  const normalized = normalizeString(label);
  if (!normalized) return "";

  if (Object.prototype.hasOwnProperty.call(SUBCATEGORY_REPLACEMENTS, normalized)) {
    return SUBCATEGORY_REPLACEMENTS[normalized] || "";
  }

  return normalized;
}

export function canonicalizeSubcategoryInput(value) {
  const originalValues = parseStringList(value);
  const canonicalValues = [];
  const changes = [];
  const seen = new Set();

  originalValues.forEach(original => {
    const canonical = canonicalizeSubcategoryLabel(original);

    if (!canonical) {
      changes.push({ from: original, to: null, type: "removed" });
      return;
    }

    if (canonical !== original) {
      changes.push({ from: original, to: canonical, type: "renamed" });
    }

    const key = canonical.toLowerCase();
    if (seen.has(key)) {
      changes.push({ from: original, to: canonical, type: "deduped" });
      return;
    }

    seen.add(key);
    canonicalValues.push(canonical);
  });

  return {
    values: canonicalValues,
    changes
  };
}

export function arraysEqual(left, right) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

export function formatNormalizationChange(change) {
  if (change.type === "removed") {
    return `${change.from} -> [removed]`;
  }

  if (change.type === "deduped") {
    return `${change.from} -> ${change.to} [duplicate removed]`;
  }

  return `${change.from} -> ${change.to}`;
}
