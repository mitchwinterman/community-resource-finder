export const ORG_RESOURCE_REQUEST_TYPES = Object.freeze([
  "resource_create",
  "resource_edit",
  "resource_delete"
]);

export const SYSTEM_RESOURCE_REQUEST_TYPES = Object.freeze([
  "quarterly_confirmation"
]);

export const RESOURCE_REQUEST_TYPES = Object.freeze([
  ...ORG_RESOURCE_REQUEST_TYPES,
  ...SYSTEM_RESOURCE_REQUEST_TYPES
]);

export const ORG_EDITABLE_RESOURCE_FIELDS = Object.freeze([
  "resourceTitle",
  "Description",
  "DescriptionDelta",
  "Categories",
  "Subcategories",
  "Keywords",
  "Websites",
  "PhoneNumbers",
  "Email",
  "Address",
  "City",
  "Zip",
  "Latitude",
  "Longitude",
  "IncludeInMap",
  "Hours",
  "Eligibility",
  "Cost",
  "Languages",
  "Notes",
  "NotesDelta"
]);

export const LEGACY_CLEAR_RESOURCE_FIELDS = Object.freeze([
  "Website",
  "Phone"
]);

export const SYSTEM_REVIEW_EXTRA_RESOURCE_FIELDS = Object.freeze([
  "Last Verified"
]);

export const ORG_REQUEST_PROPOSED_DATA_FIELDS = Object.freeze([
  ...ORG_EDITABLE_RESOURCE_FIELDS,
  ...LEGACY_CLEAR_RESOURCE_FIELDS
]);

export const SYSTEM_REVIEW_PROPOSED_DATA_FIELDS = Object.freeze([
  ...ORG_REQUEST_PROPOSED_DATA_FIELDS,
  ...SYSTEM_REVIEW_EXTRA_RESOURCE_FIELDS
]);

export function normalizeResourceRequestType(value) {
  const requestType = String(value ?? "").trim().toLowerCase();
  return RESOURCE_REQUEST_TYPES.includes(requestType) ? requestType : "";
}

export function isOrgResourceRequestType(value) {
  return ORG_RESOURCE_REQUEST_TYPES.includes(normalizeResourceRequestType(value));
}

export function isSystemResourceRequestType(value) {
  return SYSTEM_RESOURCE_REQUEST_TYPES.includes(normalizeResourceRequestType(value));
}

export function getAllowedProposedDataFieldsForRequestType(requestType) {
  return isSystemResourceRequestType(requestType)
    ? SYSTEM_REVIEW_PROPOSED_DATA_FIELDS
    : ORG_REQUEST_PROPOSED_DATA_FIELDS;
}

export function getDisallowedProposedDataKeys(proposedData, requestType) {
  if (!proposedData || typeof proposedData !== "object" || Array.isArray(proposedData)) {
    return [];
  }

  const allowed = new Set(getAllowedProposedDataFieldsForRequestType(requestType));
  return Object.keys(proposedData).filter(key => !allowed.has(key));
}
