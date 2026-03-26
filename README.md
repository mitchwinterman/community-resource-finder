# Community Resource Finder

Community Resource Finder is a Firebase-backed directory for browsing community services, filtering them by category and subcategory, and maintaining the directory through a browser-based admin panel.

This repository currently contains the public site, the admin interface, the Firebase client configuration, shared normalization rules for taxonomy and contact fields, Firestore security rules, a one-time admin-claim setup script, and legacy JSON source files from the original Firestore seed process.

## What This Project Does

The app is designed to help patrons and staff find local organizations and programs by:

- searching by organization name, description, keywords, categories, and subcategories
- filtering the directory by category and subcategory
- viewing resource details in a master-detail layout
- maintaining resources and categories through an authenticated admin page

The project is implemented as a small static frontend application. There is no build step, no framework, and no server-side application code in this repo.

## Current Stack

- Plain HTML, CSS, and JavaScript
- Firebase Authentication
- Cloud Firestore
- Firebase JavaScript SDK loaded from Google CDN
- Static assets hosted directly from the repository output

## Repository Contents

Top-level files:

- `index.html`: public search and browse UI
- `app.js`: public application logic, Firestore reads, filtering, and details rendering
- `styles.css`: shared public-facing styling
- `about.html`: about page
- `help.html`: help page
- `contact.html`: contact and resource suggestion form
- `login.html`: unified login entry point that routes by role
- `login.js`: role-aware login and portal routing logic
- `review.html`: public quarterly-review confirmation page for secure email links
- `review.js`: quarterly-review token handling and confirmation logic
- `admin.html`: admin login and editing interface
- `admin.js`: admin authentication and CRUD operations for resources, categories, organizations, review status, mail, audit logs, and request review
- `admin.css`: admin styling
- `auth-routing.js`: shared role detection and redirect logic for admin and org portals
- `org.html`: organization login and submission portal
- `org.js`: organization-side request submission logic
- `ownership-backfill.html`: one-time Phase 2A ownership/status backfill page
- `ownership-backfill.js`: one-time Phase 2A resource ownership backfill logic
- `taxonomy-rules.js`: shared taxonomy normalization rules used by the admin category editor
- `contact-fields.js`: shared website and phone normalization helpers used by the app and admin
- `firestore.rules`: Cloud Firestore security rules for public reads and admin-only writes
- `package.json`: Node tooling for one-time Firebase Admin scripts
- `tools/set_admin_claim.mjs`: one-time script to grant or remove the Firebase `admin` custom claim
- `tools/mail_worker.mjs`: recurring outbound mail worker that drains `mail_queue` through Outlook Desktop
- `tools/send_outlook_mail.ps1`: Outlook COM bridge used by the mail worker on Windows
- `tools/run_mail_worker.ps1`: scheduler-friendly wrapper that sets env vars and launches the Outlook mail worker
- `firebase.js`: Firebase app, Firestore, and Auth initialization
- `data.json`: legacy resource data snapshot retained for reference
- `categories.json`: canonical category/subcategory snapshot retained for reference
- `crf-logo.png`: Community Resource Finder logo
- `wcls-logo.png`: Washoe County Library System logo

## High-Level Architecture

### Public App

The public app lives in `index.html` + `app.js`.

At startup it:

1. Connects to Firebase using the config in `firebase.js`.
2. Reads the `resources` collection from Firestore.
3. Reads the `categories` collection from Firestore.
4. Filters the loaded resources so only `published` records are treated as live.
5. Builds the category and subcategory filter dropdowns.
6. Filters all loaded records client-side in the browser.
7. Renders a result list on the left and resource details on the right.

### Admin App

The admin app lives in `admin.html` + `admin.js`.

It:

1. Requires a signed-in session from `login.html`.
2. Redirects non-admin users away automatically.
3. Loads organizations, categories, resources, memberships, and requests from Firestore.
4. Allows creating, editing, and deleting:
   - resources
   - categories
   - subcategories inside category documents
   - organizations
   - organization access records
5. Reviews `resource_change_requests` and approves or rejects them.

### Organization Portal

The organization portal lives in `org.html` + `org.js`.

It:

1. Requires a signed-in session from `login.html`.
2. Redirects admins or unauthorized users away automatically.
3. Reads the user's `organization_members/{uid}` document.
4. Loads only resources owned by that organization.
5. Lets the user submit updates as `resource_change_requests`.
6. Never writes directly to live `resources`.

## Firebase Configuration

The app is currently configured for this Firebase project in `firebase.js`:

- `projectId`: `washoe-community-resources`
- `authDomain`: `washoe-community-resources.firebaseapp.com`
- `storageBucket`: `washoe-community-resources.firebasestorage.app`
- `messagingSenderId`: `788386726804`

The Firebase web config is committed directly in the repository. That is normal for Firebase client apps, but it means the real security boundary must be enforced by Firebase Authentication and Firestore security rules, not by hiding the config.

## Data Model

The repo currently uses nine active Firestore collections:

- `resources`
- `categories`
- `organizations`
- `organization_members`
- `editor_invites`
- `resource_change_requests`
- `review_confirmations`
- `mail_queue`
- `audit_logs`

### `resources` Collection

Each document in `resources` is expected to look roughly like this:

```json
{
  "Organization": "Example Organization",
  "Description": "What the organization provides",
  "Address": "123 Main St",
  "City": "Reno",
  "Zip": "89501",
  "Phone": "",
  "Website": "",
  "PhoneNumbers": [
    { "number": "(775) 555-1234" },
    { "label": "Main Office", "number": "775-555-5678" }
  ],
  "Websites": ["https://example.org", "https://example.org/help"],
  "Categories": ["Housing & Homelessness", "Food & Basic Needs"],
  "Subcategories": ["Emergency Shelter", "Food Pantry"],
  "Email": "info@example.org",
  "Hours": "Mon-Fri 9am-5pm",
  "Eligibility": "Varies by program",
  "Cost": "Free",
  "Notes": "Additional notes",
  "DescriptionDelta": { "ops": [] },
  "NotesDelta": { "ops": [] },
  "organizationId": "<organizations doc id>",
  "status": "published",
  "submissionState": "approved",
  "createdAt": "<timestamp>",
  "createdByUid": "<uid>",
  "createdByEmail": "admin@example.org",
  "updatedAt": "<timestamp>",
  "updatedByUid": "<uid>",
  "updatedByEmail": "admin@example.org",
  "lastSubmittedAt": "<timestamp>",
  "lastSubmittedBy": "<uid>",
  "lastApprovedAt": "<timestamp>",
  "lastApprovedBy": "<uid>",
  "Last Verified": "2026-03-01",
  "Keywords": "housing, shelter, pantry",
  "UpdatedBy": "Staff Name",
  "Languages": "English, Spanish",
}
```

Notes:

- This schema is not formally enforced in the repo.
- Many fields are optional in practice.
- `Description` and `Notes` contain sanitized HTML for public rendering.
- `DescriptionDelta` and `NotesDelta` store Quill Delta data for safer structured editing in the admin panel.
- `Categories` and `Subcategories` are stored as arrays of strings.
- `Websites` is stored as an array of strings.
- `PhoneNumbers` is stored as an array of objects with `number` and optional `label`.
- `Website` and `Phone` are legacy fields and should remain blank after migration.
- `Last Verified` is stored as a string in `YYYY-MM-DD` format when entered through the admin UI.
- `organizationId` links a resource to its owning document in `organizations`.
- `status` controls whether the resource is publicly readable; the public app and Firestore rules both treat only `published` resources as live.
- `submissionState` is groundwork for the future review workflow.

### `categories` Collection

Each document in `categories` is expected to look like this:

```json
{
  "name": "Housing & Homelessness",
  "subcategories": [
    "Emergency Shelter",
    "Transitional Housing",
    "Case Management"
  ]
}
```

Notes:

- The public site reads category names from these documents.
- The admin site uses these documents to build its nested category/subcategory selector.

### `organizations` Collection

Each document in `organizations` is expected to look roughly like this:

```json
{
  "name": "Domestic Violence Resource Center",
  "status": "active",
  "primaryEmail": "info@example.org",
  "phone": "(775) 555-1234",
  "website": "https://example.org",
  "notes": "Internal ownership notes",
  "createdAt": "<timestamp>",
  "createdBy": "<uid>",
  "createdByEmail": "admin@example.org",
  "updatedAt": "<timestamp>",
  "updatedBy": "<uid>",
  "updatedByEmail": "admin@example.org"
}
```

Notes:

- library admins can write this collection; org users can read only their own organization doc
- Phase 2 uses it as the owner lookup for `resources.organizationId`
- org-user login and membership work build on this collection

### `organization_members` Collection

Each document in `organization_members` is keyed by Firebase Auth UID and is expected to look roughly like this:

```json
{
  "uid": "<firebase-auth-uid>",
  "email": "user@example.org",
  "organizationId": "<organizations doc id>",
  "role": "org_editor",
  "status": "active",
  "notes": "Internal setup notes",
  "createdAt": "<timestamp>",
  "createdBy": "<uid>",
  "createdByEmail": "admin@example.org",
  "updatedAt": "<timestamp>",
  "updatedBy": "<uid>",
  "updatedByEmail": "admin@example.org"
}
```

Notes:

- the document id should match the Firebase Auth `uid`
- this is what grants an org user access to `org.html`
- the current implementation assumes one organization per org-user account

### `editor_invites` Collection

Each document in `editor_invites` is expected to look roughly like this:

```json
{
  "email": "user@example.org",
  "organizationId": "<organizations doc id>",
  "role": "org_editor",
  "customMessage": "Optional custom note from library staff",
  "notes": "Internal notes",
  "status": "pending",
  "firebaseUid": "",
  "setupLink": "",
  "error": "",
  "sentAt": null,
  "acceptedAt": null,
  "createdAt": "<timestamp>",
  "createdBy": "<uid>",
  "createdByEmail": "admin@example.org",
  "updatedAt": "<timestamp>",
  "updatedBy": "<uid>",
  "updatedByEmail": "admin@example.org"
}
```

Notes:

- library admins create and manage these docs from the Organizations panel
- the local Outlook worker creates or links the Firebase Auth account, upserts `organization_members`, generates a password setup link, and sends the invite email
- first successful org-portal access marks matching `sent` invites as `accepted`

### `resource_change_requests` Collection

Each document in `resource_change_requests` is expected to look roughly like this:

```json
{
  "resourceId": "<resources doc id>",
  "resourceName": "Example Organization",
  "organizationId": "<organizations doc id>",
  "submittedByUid": "<firebase-auth-uid>",
  "submittedByEmail": "user@example.org",
  "status": "pending",
  "proposedData": {
    "Description": "<p>Updated description</p>",
    "PhoneNumbers": [{ "label": "Main", "number": "(775) 555-1234" }]
  },
  "submitterNotes": "Updated hours and hotline number.",
  "reviewNotes": "",
  "createdAt": "<timestamp>",
  "updatedAt": "<timestamp>",
  "reviewedAt": null,
  "reviewedBy": null,
  "reviewedByEmail": null
}
```

Notes:

- org users create these docs from `org.html`
- library admins review them in `admin.html`
- approving a request copies `proposedData` into the live `resources` doc

### `review_confirmations` Collection

This collection stores secure quarterly-review confirmation links and their response lifecycle.

Each document is expected to look roughly like this:

```json
{
  "type": "quarterly_review",
  "status": "sent",
  "organizationId": "<organizations doc id>",
  "organizationName": "AARP",
  "resourceId": "<resources doc id>",
  "resourceName": "AARP",
  "recipientEmail": "editor@example.org",
  "recipientType": "organization_editor",
  "recipientUid": "<firebase-auth-uid or empty string>",
  "reviewAnchorSource": "Last Verified",
  "reviewAnchorDate": "2026-03-01",
  "emailBatchId": "<batch id>",
  "createdAt": "<timestamp>",
  "updatedAt": "<timestamp>",
  "sentAt": "<timestamp>",
  "confirmedAt": null,
  "appliedAt": null,
  "expiresAt": "<timestamp>",
  "error": ""
}
```

Notes:

- the document id itself acts as the secure bearer token embedded in `review.html?token=...`
- quarterly reminder emails create one token document per resource-recipient pair
- a `confirmed` token means the recipient clicked "Yes, everything looks correct"
- the background worker then applies that confirmation back to the live resource by updating the existing `Last Verified` field
- the admin `Review Status` panel reads this collection to show reminder and confirmation activity

### `mail_queue` Collection

This collection is operationally backend-managed and is intended as an outbound message queue.

Each document is expected to look roughly like this:

```json
{
  "to": "user@example.org",
  "subject": "[CRF] Update approved: Example Organization",
  "text": "Plain-text email body",
  "html": "<p>HTML email body</p>",
  "type": "request_status",
  "sourceCollection": "resource_change_requests",
  "sourceId": "<request doc id>",
  "status": "queued",
  "createdAt": "<timestamp>",
  "updatedAt": "<timestamp>",
  "sentAt": null,
  "transportMessageId": "",
  "error": ""
}
```

Notes:

- library admins queue these documents from the admin review workflow
- the Windows Outlook worker in `tools/mail_worker.mjs` can process and send these documents
- approval/rejection emails now flow through this queue
- future invite/setup emails can reuse the same queue and sender

### `audit_logs` Collection

This collection is an immutable operational audit trail for the admin UI, org portal, and mail worker.

Each document is expected to look roughly like this:

```json
{
  "area": "requests",
  "action": "request.approved",
  "entityType": "request",
  "entityId": "<request doc id>",
  "entityLabel": "AARP",
  "organizationId": "<organizations doc id>",
  "relatedResourceId": "<resources doc id>",
  "relatedRequestId": "<request doc id>",
  "relatedMailId": "<mail_queue doc id>",
  "actorType": "admin",
  "actorUid": "<firebase-auth-uid>",
  "actorEmail": "admin@example.org",
  "source": "admin_ui",
  "summary": "Approved request for AARP",
  "details": {
    "reviewNotes": "Looks good"
  },
  "createdAt": "<timestamp>"
}
```

Notes:

- reads are admin-only
- admin actions, org request submissions, and mail-worker outcomes can all write to this collection
- the admin `Audit Logs` panel reads from this collection for operations review

## Login Details

### Unified Login URL

Use:

- `login.html`

Examples:

- local dev: `http://localhost:8000/login.html`
- hosted site: `https://<your-site>/login.html`

Users should start here. The app detects role and routes automatically:

- library admins -> `admin.html`
- organization users with active `organization_members` access -> `org.html`

### Admin Portal URL

Use:

- `admin.html`

Examples:

- local dev: `http://localhost:8000/admin.html`
- hosted site: `https://<your-site>/admin.html`

### Organization Portal URL

Use:

- `org.html`

Examples:

- local dev: `http://localhost:8000/org.html`
- hosted site: `https://<your-site>/org.html`

If a signed-in user opens the wrong portal directly, the page should redirect them to the correct one.

### Admin Account

The current intended library admin account is:

- `mwinterman@washoecounty.gov`

However, the admin UI no longer trusts email alone. The account must also have the Firebase Auth custom claim:

- `admin: true`

### Admin Password

The password is not stored anywhere in this repository.

To log in successfully, a user must have:

1. a Firebase Authentication user account with email/password sign-in enabled
2. the correct current password for that Firebase Auth account
3. the Firebase custom claim `admin: true`

If the password has been lost, recover or reset it in Firebase Authentication. Do not add plaintext passwords to this repository.

### Important Security Note

The current admin authorization model has two layers:

1. Firebase Authentication sign-in by email and password
2. Firestore security rules that allow writes only for users with `request.auth.token.admin == true`

The frontend still hides or shows the admin UI based on the user's token claims, but the real security boundary is Firestore. A user without the `admin` custom claim should be blocked at the database layer even if they tamper with the browser UI.

## Local Development

### Prerequisites

You need:

- a web browser
- internet access to load the Firebase CDN modules and Google Fonts
- access to the configured Firebase project if you want the live app and admin tools to work
- Node.js if you want to run local helper scripts such as the admin-claim setup script

Node.js is not required to run the site itself, but it is required for scripts in `tools/`.

### Why You Should Use a Local Web Server

Even though this is a static site, you should serve it through a local web server instead of opening the HTML files directly from disk.

Reasons:

- ES modules are loaded via `<script type="module">`
- browsers often block or behave inconsistently with module imports and fetches under `file://`

### Quick Start with Python

If Python is installed:

```powershell
python -m http.server 8000
```

Then open:

- `http://localhost:8000/index.html`

### Quick Start with VS Code Live Server

If you use VS Code with Live Server, you can also serve the folder that way.

### Expected Local Pages

After starting a local server, these pages should be available:

- `/index.html`
- `/about.html`
- `/help.html`
- `/contact.html`
- `/login.html`
- `/admin.html`
- `/org.html`
- `/ownership-backfill.html`

## Public Site Behavior

### Search

The public search input searches across these fields:

- `Organization`
- `Description`
- `Categories`
- `Subcategories`
- `Keywords`
- `PhoneNumbers`
- `Websites`

Search is case-insensitive and uses substring matching.

### Category Filter

The category dropdown is populated from the Firestore `categories` collection.

### Subcategory Filter

The subcategory dropdown:

- is disabled until a category is selected
- is populated from the selected category's `subcategories`

### Result Sorting

Results are sorted alphabetically by `Organization`.

### Details Panel

Clicking a result shows:

- organization name
- description
- address
- city
- zip
- phone
- email
- website
- categories
- subcategories
- eligibility
- hours
- cost
- last verified
- notes

## Static Pages

### About

`about.html` explains the purpose of the directory and includes general disclaimers.

### Help

`help.html` explains how to search, filter, and reset the app.

### Contact

`contact.html` contains a form that uses a `mailto:` action rather than sending through a backend service.

Implications:

- it depends on the visitor having a configured local mail client
- it may not work well on all devices or browsers
- submissions are not stored in a database
- there is no server-side validation or auditing

## Admin Workflow

### Logging In

1. Open `admin.html`.
2. Enter the admin email.
3. Enter the Firebase Auth password for that account.
4. Click `Log In`.

If login succeeds and the account has the `admin` custom claim, the admin panels are shown.

If login succeeds but the account does not have the `admin` custom claim, the UI signs the user back out and shows a not-authorized message.

### Resource Management

The Resources panel allows staff to:

- view all resources
- open an existing resource for editing
- create a new resource
- save resource changes
- delete a resource

#### Resource Editor Fields

The current resource editor includes:

- `Organization`
- `Owning Organization`
- `Publication Status`
- `Submission State`
- `Description`
- `Categories & Subcategories`
- `Keywords`
- `Websites`
- `Phone Numbers`
- `Email`
- `Address`
- `City`
- `Zip`
- `Hours`
- `Eligibility`
- `Cost`
- `Languages`
- `Last Verified`
- `UpdatedBy`
- `Notes`

The admin now uses Quill for `Description` and `Notes`, and saves both:

- sanitized HTML in `Description` and `Notes`
- Quill Delta data in `DescriptionDelta` and `NotesDelta`

#### Categories in the Resource Editor

The admin resource editor uses a nested category selector:

- categories are top-level checkboxes
- subcategories appear beneath each category
- subcategories can only remain checked if their parent category is checked

Selected categories and subcategories are saved back to Firestore as arrays.

When saving categories, known deprecated subcategory labels are automatically normalized to the current canonical labels.

When saving resources, websites are saved in `Websites`, and phone entries are saved in `PhoneNumbers` with optional labels such as `Main`, `Office`, or `Cell`. The legacy `Website` and `Phone` fields are cleared.

### Organization Management

The Organizations panel allows library admins to:

- view all organization owner records
- create a new organization owner
- edit organization status and contact information
- delete organizations that are not currently attached to resources

These organization records are the source of truth for `resources.organizationId`.

### Organization Access Management

The Organization Access panel allows library admins to:

- create `organization_members` docs keyed by Firebase Auth UID
- connect an authenticated org user to exactly one organization
- activate or deactivate org access
- manage role labels such as `org_editor` and `org_admin`

Phase 2B still assumes library staff create the Firebase Auth user outside the app, then enter the UID here.

### Category Management

The Categories panel allows staff to:

- view all categories
- create a new category
- edit an existing category name
- add or remove subcategories
- save changes
- delete categories

### Ownership Backfill

Use `ownership-backfill.html` after creating organization records in `admin.html`.

The tool:

- can bootstrap organization owner records directly from unique existing resource names
- loads resources missing `organizationId`, `status`, or `submissionState`
- suggests an owner when the resource name exactly matches an organization record
- lets a library admin assign ownership manually when there is no safe exact match
- backfills default publication metadata onto older resource docs

Recommended order:

1. publish the updated `firestore.rules`
2. either create organization records in `admin.html` or use `Bootstrap Organizations` in `ownership-backfill.html`
3. run the backfill preview in `ownership-backfill.html`
4. run the backfill
5. spot-check resources in `admin.html`

### Request Review

The Review Requests panel allows library admins to:

- view submitted `resource_change_requests`
- compare proposed data against the live resource
- approve a request and publish the proposed data to the live `resources` doc
- reject a request with review notes

### Organization Portal Workflow

The organization portal in `org.html` allows org users to:

- sign in with email and password
- view only resources owned by their organization
- edit resource details in a submission form
- submit changes for review
- view recent request history

Org users do not directly edit live `resources`.

## Deployment

This repo is structured like a static site deployment.

### Minimum Deployment Requirements

Your hosting environment must:

- serve static HTML, CSS, JS, JSON, and image files
- allow browser access to Firebase CDN modules
- allow browser access to Google Fonts, if those fonts are still desired

### Common Deployment Pattern

A likely deployment setup is Firebase Hosting or another static host such as GitHub Pages, Netlify, Vercel static hosting, or a simple web server.

### Outbound Mail Queue

The admin review flow writes approval/rejection notifications into the `mail_queue` collection, and the quarterly review system writes secure confirmation tokens into `review_confirmations`.

The intended sender for this repo is the local Outlook Desktop worker in `tools/mail_worker.mjs`. That worker:

1. reads queued docs from `mail_queue`
2. opens the signed-in Outlook Desktop profile on a trusted Windows machine
3. sends the message through Outlook
4. marks the queue doc `sent` or `failed`
5. processes pending `editor_invites` and sends password-setup emails
6. applies confirmed quarterly review links back to the live resource `Last Verified` field
7. sends quarterly review reminder emails to organization primary contacts and active org editors

Operational queue policy:

- failed mail items stay in `mail_queue` until staff retry or delete them manually
- sent mail items can be bulk-deleted from the admin UI
- the background worker automatically deletes sent mail items older than roughly 6 months

### Outlook Mail Worker Setup

The mail worker does not use SMTP credentials. It uses the currently configured Outlook Desktop profile on the Windows machine that runs it.

Requirements:

- Outlook Desktop installed on the machine
- Outlook configured and signed in with the mailbox you want to send from
- access to the Firebase service account JSON for this project
- Node.js installed locally
- the production site domain added to Firebase Authentication authorized domains

Optional environment variables:

- `CRF_OUTLOOK_FROM_EMAIL`
  - if set, the worker tries to send through that Outlook account instead of whatever Outlook picks by default
- `CRF_PUBLIC_BASE_URL`
  - if set, the worker rewrites any `localhost` or `127.0.0.1` links inside queued mail bodies to this hosted site base URL

Manual test:

1. queue a test approval or rejection from `admin.html`
2. in PowerShell, set `GOOGLE_APPLICATION_CREDENTIALS` to the Firebase service account JSON path
3. optionally set:
   - `CRF_OUTLOOK_FROM_EMAIL`
   - `CRF_PUBLIC_BASE_URL`
4. run:
   - `npm run mail-worker`
5. confirm the queue doc changes to `sent`

Example PowerShell session:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\firebase-service-account.json"
$env:CRF_OUTLOOK_FROM_EMAIL="mwinterman@washoecounty.gov"
$env:CRF_PUBLIC_BASE_URL="https://mitchwinterman.github.io/community-resource-finder"
npm.cmd run mail-worker
```

Task Scheduler command:

Program/script:

```text
powershell.exe
```

Add arguments:

```text
-NoProfile -ExecutionPolicy Bypass -File "C:\Users\mwinterman\Documents\GitHub\community-resource-finder\tools\run_mail_worker.ps1" -ServiceAccountPath "C:\Users\mwinterman\Documents\GitHub\CRF Extras\washoe-community-resources-firebase-adminsdk-fbsvc-fb80802fe8.json"
```

Recommended scheduler settings:

- run every 1 hour
- run only when the user is logged on
- use a Windows account that has the correct Outlook profile configured

Operational notes:

- if Outlook is signed out, locked down by policy, or prompts for reauthentication, mail may remain queued or fail
- if your Windows password or Microsoft 365 password changes, the worker should continue sending after Outlook itself has been reauthenticated
- the wrapper script defaults `CRF_PUBLIC_BASE_URL` to `https://mitchwinterman.github.io/community-resource-finder`
- this worker is intended for a trusted internal machine, not an end-user workstation
- Firebase Auth password setup links will only return cleanly to your public site if `mitchwinterman.github.io` is listed under Firebase Authentication authorized domains

### Production Checklist

Before pushing to production, verify:

1. the Firebase project config points at the intended environment
2. Firestore rules from `firestore.rules` have been published to the intended project
3. Firebase Auth email/password sign-in is enabled
4. the admin user exists in Firebase Auth
5. the admin user has the Firebase custom claim `admin: true`
6. `resources`, `categories`, and `organizations` collections exist and contain expected data
7. `organization_members` and `resource_change_requests` are configured if the org portal is in use
8. if outbound email is enabled, the machine running `tools/mail_worker.mjs` has Outlook configured and access to the Firebase service account credential
9. contact email targets are still correct
10. branding assets and footer text are current
11. the site works on mobile and desktop browsers
12. the admin password is known and stored in an approved password manager

## Admin Claim Setup

Use `tools/set_admin_claim.mjs` to grant the Firebase `admin` custom claim before publishing the hardened Firestore rules.

### Safe Rollout Order

1. Install the Node dependency:
   - `npm install`
2. Obtain a Firebase service account credential for the target project.
3. Set `GOOGLE_APPLICATION_CREDENTIALS` to the service account JSON path, or set `FIREBASE_SERVICE_ACCOUNT_JSON` to the JSON contents.
4. Run:
   - `npm run set-admin-claim -- --email mwinterman@washoecounty.gov --admin true`
5. Sign out and sign back into the admin UI so the new claim appears in the client token.
6. Publish `firestore.rules` in Firebase Console or through the Firebase CLI.
7. Confirm the admin UI still loads and that writes succeed.

### Why Order Matters

If you publish `firestore.rules` before the admin account has the `admin` custom claim, the admin UI may still load briefly, but Firestore writes will be denied and you can lock yourself out of editing until the claim is added.

## Firestore and Auth Setup Checklist

If recreating the project from scratch:

1. Create or select the Firebase project.
2. Enable Firestore.
3. Enable Firebase Authentication.
4. Turn on Email/Password as a sign-in provider.
5. Create the admin user:
   - email: `mwinterman@washoecounty.gov`
   - password: set this in Firebase Auth or through the Admin SDK, then store it outside the repo
6. Grant that user the custom claim `admin: true`.
7. Configure Firestore security rules from `firestore.rules`.
8. Serve this site and confirm the client can read the intended collections.
9. Log into `admin.html` and confirm create/edit/delete behavior.

## Operational Notes

### Data Quality

The current dataset appears to contain some inconsistent values, placeholder blanks, and formatting issues. Examples include:

- blank fields represented as `" "` instead of empty strings
- the legacy `data.json` snapshot still contains old single-string website and phone formats
- the legacy `data.json` snapshot may not match the cleaned live taxonomy exactly

Treat the data model as operationally useful but not yet normalized.

### HTML Content in Resource Fields

`Description` and `Notes` are edited as rich text in the admin panel and stored as HTML.

That means:

- editors can apply some formatting
- the frontend currently renders stored HTML directly
- content safety depends on trusted editors and proper sanitization strategy

### Character Encoding

Some files previously displayed mojibake characters such as smart punctuation rendered incorrectly. If that reappears, confirm files are saved as UTF-8.

## Known Limitations

Current limitations in the repo as it stands:

- no automated test suite
- no formal linting or formatting setup
- no build process
- no environment separation documented in the repo
- no typed schema validation
- no deduplicating import flow
- client-side filtering loads entire collections into the browser
- contact form depends on `mailto:`
- no external-org ownership or review workflow yet

## Troubleshooting

### The Public App Shows No Results

Check:

- browser console for Firestore permission errors
- that the Firebase project config is correct
- that the `resources` collection exists
- that documents in `resources` contain the expected fields

### Categories Do Not Appear

Check:

- that the `categories` collection exists
- that documents contain `name` and `subcategories`
- that Firestore read permissions allow the current page to fetch them

### Admin Login Fails

Check:

- that Email/Password auth is enabled in Firebase
- that the user account exists
- that the user has the `admin: true` custom claim
- that the password is correct
- that the site can reach Firebase Auth endpoints
- if the claim was just granted, sign out and sign back in

### Admin Loads But Writes Fail

Check:

- Firestore rules
- browser console errors
- that the authenticated user has permission to write the `resources` and `categories` collections

## Suggested Next Maintenance Steps

If you are actively maintaining this project, the highest-value follow-up work is:

1. publish and verify `firestore.rules` in the live Firebase project
2. replace `mailto:` contact flow with a real submission backend
3. complete Phase 2B by adding organization memberships, an org-user portal, and review-before-publish change requests

The Phase 2 ownership and review design is documented in:

- `docs/phase-2-org-ownership-plan.md`

## Maintenance Ownership Notes

If another maintainer inherits this repo, they will need access to:

- the Firebase project
- Firebase Authentication user management
- Firestore data
- hosting configuration
- the admin account password, stored outside the repo

Without that access, the code alone is not enough to operate the system end-to-end.
