# Phase 2 Plan: Organization Ownership and Review Workflow

This document defines the next architecture step after Phase 1 admin hardening.

Phase 1 established:

- backend-enforced admin writes through Firestore rules
- Firebase custom claim `admin: true` for library admins
- continued public read access for `resources` and `categories`

Phase 2 introduces organization ownership, persistent organization logins, and a review workflow so outside groups can maintain their own data without directly publishing changes to the public site.

## Goals

- let community organizations sign in whenever they want
- restrict each organization to its own resources
- require library review before public data changes go live
- preserve a clean audit trail of who submitted what
- prepare the data model for future invite flows and multi-user org management

## Non-Goals

- direct public publishing by organization users
- full self-service organization onboarding
- replacing the current library admin UI immediately
- changing the public search UX in Phase 2

## Role Model

### `library_admin`

Global library staff role enforced by Firebase custom claim:

- `request.auth.token.admin == true`

Permissions:

- full CRUD on `resources`
- full CRUD on `categories`
- full CRUD on `organizations`
- full CRUD on `organization_members`
- approve or reject submitted changes
- manage organization accounts and invitations

### `org_editor`

Per-organization role stored in Firestore membership docs.

Permissions:

- read own organization and own resources
- create and edit change requests for own organization
- optionally create draft resources for own organization
- cannot modify `categories`
- cannot directly publish to live `resources`

### `public`

Permissions:

- read published resources only
- read categories

## Proposed Collections

### `organizations/{orgId}`

Represents a community organization.

Suggested fields:

```json
{
  "name": "Domestic Violence Resource Center",
  "status": "active",
  "primaryEmail": "info@example.org",
  "phone": "(775) 555-1234",
  "website": "https://example.org",
  "createdAt": "<timestamp>",
  "createdBy": "<uid>",
  "updatedAt": "<timestamp>",
  "updatedBy": "<uid>"
}
```

Notes:

- `status` can be `active`, `inactive`, or `archived`
- one organization may own multiple resources

### `organization_members/{memberId}`

Maps an authenticated Firebase user to an organization role.

Suggested fields:

```json
{
  "uid": "<firebase-auth-uid>",
  "organizationId": "<orgId>",
  "email": "user@example.org",
  "role": "org_editor",
  "status": "active",
  "createdAt": "<timestamp>",
  "createdBy": "<uid>",
  "updatedAt": "<timestamp>",
  "updatedBy": "<uid>"
}
```

Notes:

- one user may belong to one or more organizations
- a unique index is not available in Firestore rules, so the app should prevent duplicate `(uid, organizationId)` rows
- if multi-org membership is not needed yet, Phase 2 can still use this collection shape safely

### `resources/{resourceId}`

Live public resources continue to live here, but gain ownership and publishing metadata.

New suggested fields:

```json
{
  "organizationId": "<orgId>",
  "status": "published",
  "submissionState": "approved",
  "lastSubmittedAt": "<timestamp>",
  "lastSubmittedBy": "<uid>",
  "lastApprovedAt": "<timestamp>",
  "lastApprovedBy": "<uid>"
}
```

Notes:

- existing public-facing fields remain in `resources`
- Phase 2 should keep `status: "published"` for current live docs
- `organizationId` is the critical new field needed for authorization

### `resource_change_requests/{requestId}`

Stores proposed edits from organizations before approval.

Suggested fields:

```json
{
  "resourceId": "<resourceId>",
  "organizationId": "<orgId>",
  "submittedByUid": "<uid>",
  "status": "pending",
  "proposedData": {
    "Description": "<html>",
    "PhoneNumbers": [{ "label": "Main", "number": "(775) 555-1234" }],
    "Websites": ["https://example.org"]
  },
  "submitterNotes": "",
  "reviewNotes": "",
  "createdAt": "<timestamp>",
  "updatedAt": "<timestamp>",
  "reviewedAt": null,
  "reviewedBy": null
}
```

Notes:

- `status` can be `pending`, `approved`, `rejected`, or `cancelled`
- `proposedData` should contain only editable resource fields, not internal review metadata
- approval copies `proposedData` into the live `resources/{resourceId}` document

## Recommended Editing Model

### Live Data

- public site reads only `resources` where `status == "published"`
- library staff continue to manage live resources directly as needed

### Organization Submission Flow

1. organization user signs in
2. app loads memberships for `request.auth.uid`
3. user sees resources for their organization
4. user edits a draft form
5. app writes a `resource_change_requests` document
6. library admin reviews pending requests
7. on approval, app or privileged backend copies the proposed data into the live `resources` doc

## Firestore Rules Direction for Phase 2

Phase 2 rules should evolve from the current Phase 1 rules into something closer to:

- `categories`
  - public read
  - admin write only
- `resources`
  - public read only for `status == "published"`
  - admin write only
- `organizations`
  - admin read/write
  - org users may read their own organization
- `organization_members`
  - admin read/write
  - org users may read their own membership docs
- `resource_change_requests`
  - admin read/write
  - org users may create and update only requests for organizations they belong to

Important: Phase 2 should still keep direct writes to live `resources` restricted to admins only.

## UI Direction

### Keep

- current `admin.html` for library staff

### Add

- separate organization portal, for example:
  - `org.html`
  - `org.js`

Organization portal responsibilities:

- sign in with Firebase Auth
- list only owned resources
- open a resource into an editable form
- submit changes for review
- view request status history

### Do Not Do Yet

- expose the current library admin page to outside orgs
- let org users edit `categories`
- let org users directly publish to the public site

## Migration Plan

### Phase 2A: Ownership Preparation

1. add `organizations` collection
2. add `organization_members` collection
3. backfill `organizationId` onto existing `resources`
4. mark existing resources as `status: "published"`

### Phase 2B: Submission Workflow

1. add `resource_change_requests`
2. build org portal for sign-in and submission
3. build admin review UI for pending requests

### Phase 2C: Operational Hardening

1. add audit timestamps consistently
2. add reminder workflow for stale resources
3. add account recovery and membership management flows

## Recommended Backfill Strategy for `organizationId`

Because current resources do not have organization ownership recorded, Phase 2 should use a deliberate mapping exercise:

1. create organization rows first
2. export current resources
3. assign each resource to an `organizationId`
4. run a one-time migration to write `organizationId` to every resource
5. review unmapped resources manually

Do not guess organization ownership from email or website domains alone unless you are comfortable with false matches.

## Suggested Initial Constraints

To keep Phase 2 manageable:

- support only one primary organization owner per resource
- support only one organization per org-editor account initially
- allow only library admins to create categories and publish changes
- keep the public app reading from a single `resources` collection

These constraints can be relaxed later without throwing away the model.

## Success Criteria

Phase 2 is complete when:

- every live resource has an `organizationId`
- org users can sign in with their own accounts
- org users can only see and edit their own resources
- edits create `resource_change_requests` instead of changing live data
- library staff can approve or reject requests
- approved changes appear on the public site only after approval
