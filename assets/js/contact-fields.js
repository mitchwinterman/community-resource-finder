export function normalizeString(value) {
  return String(value ?? "").trim();
}

function dedupeStrings(values) {
  const seen = new Set();
  const result = [];

  values.forEach(value => {
    const normalized = normalizeString(value);
    if (!normalized) return;

    const key = normalized.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    result.push(normalized);
  });

  return result;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /(?:\+?1[-.\s]*)?(?:\(\d{3}\)|\d{3})[-.\s]*\d{3}[-.\s]*\d{4}(?:\s*(?:x|ext\.?|extension)\s*#?\s*\d+)?/i;

function hasPhoneLikeText(value) {
  return phonePattern.test(normalizeString(value));
}

function splitPhoneSegmentOnPattern(segment, splitter) {
  const raw = normalizeString(segment);
  if (!raw) return [];

  const parts = raw.split(splitter).map(part => normalizeString(part)).filter(Boolean);
  if (parts.length <= 1) return [raw];
  if (!parts.every(part => hasPhoneLikeText(part))) return [raw];
  return parts;
}

export function normalizeWebsiteEntry(value) {
  const raw = normalizeString(value);
  if (!raw) return "";

  if (emailPattern.test(raw) && !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw)) {
    return `mailto:${raw}`;
  }

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(raw);
  const candidate = hasScheme ? raw : `https://${raw}`;

  try {
    const url = new URL(candidate);
    const protocol = url.protocol.toLowerCase();
    if (!["http:", "https:", "mailto:"].includes(protocol)) {
      return raw;
    }
    return url.href;
  } catch {
    return raw;
  }
}

export function normalizeWebsiteList(value) {
  if (Array.isArray(value)) {
    return dedupeStrings(value.map(item => normalizeWebsiteEntry(item)).filter(Boolean));
  }

  const raw = normalizeString(value);
  if (!raw) return [];

  const segments = raw
    .split(/\r?\n|;|,/)
    .map(segment => normalizeString(segment))
    .filter(Boolean)
    .map(segment => normalizeWebsiteEntry(segment));

  return dedupeStrings(segments);
}

export function normalizePhoneList(value) {
  if (Array.isArray(value)) {
    return dedupeStrings(value);
  }

  const raw = normalizeString(value);
  if (!raw) return [];

  const baseSegments = raw
    .split(/\r?\n|;|,/)
    .map(segment => normalizeString(segment))
    .filter(Boolean);

  const mergedSegments = [];
  for (let index = 0; index < baseSegments.length; index += 1) {
    const segment = baseSegments[index];

    if (!hasPhoneLikeText(segment)) {
      const nextSegment = baseSegments[index + 1];
      if (nextSegment && hasPhoneLikeText(nextSegment)) {
        mergedSegments.push(`${segment}, ${nextSegment}`);
        index += 1;
        continue;
      }

      if (mergedSegments.length > 0) {
        mergedSegments[mergedSegments.length - 1] = `${mergedSegments[mergedSegments.length - 1]}, ${segment}`;
      } else {
        mergedSegments.push(segment);
      }
      continue;
    }

    mergedSegments.push(segment);
  }

  const splitSegments = mergedSegments.flatMap(segment => {
    const slashSplit = splitPhoneSegmentOnPattern(segment, /\s*\/\s*/);
    return slashSplit.flatMap(item => splitPhoneSegmentOnPattern(item, /\s+or\s+/i));
  });

  return dedupeStrings(splitSegments);
}

function normalizePhoneEntryObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const label = normalizeString(value.label ?? value.Label);
  const number = normalizeString(value.number ?? value.Number ?? value.value);
  if (!number) return null;

  return label ? { label, number } : { number };
}

function parsePhoneStringToEntry(value) {
  const raw = normalizeString(value);
  if (!raw) return null;

  const match = raw.match(phonePattern);
  if (!match) {
    return { number: raw };
  }

  const matchText = match[0];
  const matchIndex = typeof match.index === "number" ? match.index : raw.indexOf(matchText);
  const prefix = normalizeString(
    raw.slice(0, Math.max(0, matchIndex)).replace(/[-,;:]+$/g, "")
  );
  const suffix = normalizeString(raw.slice(matchIndex + matchText.length));
  const number = normalizeString(`${matchText}${suffix ? ` ${suffix}` : ""}`);

  if (prefix && /[A-Za-z]/.test(prefix) && !/\d/.test(prefix)) {
    return { label: prefix, number };
  }

  return { number: raw };
}

export function normalizePhoneEntries(value) {
  const entries = [];
  const seen = new Set();

  const sourceItems = Array.isArray(value) ? value : normalizePhoneList(value);
  sourceItems.forEach(item => {
    const entry = typeof item === "string"
      ? parsePhoneStringToEntry(item)
      : normalizePhoneEntryObject(item);

    if (!entry) return;

    const key = `${normalizeString(entry.label).toLowerCase()}|${normalizeString(entry.number).toLowerCase()}`;
    if (seen.has(key)) return;

    seen.add(key);
    entries.push(entry.label ? { label: entry.label, number: entry.number } : { number: entry.number });
  });

  return entries;
}

export function getPhoneHref(value) {
  const raw = typeof value === "object" && value !== null
    ? normalizeString(value.number ?? value.Number ?? value.value)
    : normalizeString(value);
  if (!raw) return "";

  const match = raw.match(phonePattern);
  if (!match) return "";

  const digits = match[0].replace(/\D+/g, "");
  if (digits.length === 10) {
    return `tel:+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `tel:+${digits}`;
  }
  if (!digits) return "";
  return `tel:${digits}`;
}

export function getPhoneDisplayText(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const label = normalizeString(value.label ?? value.Label);
    const number = normalizeString(value.number ?? value.Number ?? value.value);
    if (!number) return "";
    return label ? `${label}: ${number}` : number;
  }

  return normalizeString(value);
}

export function getWebsiteDisplayText(value) {
  const raw = normalizeString(value);
  if (!raw) return "";
  if (raw.startsWith("mailto:")) {
    return raw.slice("mailto:".length);
  }
  return raw.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}
