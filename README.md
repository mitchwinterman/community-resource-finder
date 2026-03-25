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
- `admin.html`: admin login and editing interface
- `admin.js`: admin authentication and CRUD operations for resources, categories, and organizations
- `admin.css`: admin styling
- `ownership-backfill.html`: one-time Phase 2A ownership/status backfill page
- `ownership-backfill.js`: one-time Phase 2A resource ownership backfill logic
- `taxonomy-rules.js`: shared taxonomy normalization rules used by the admin category editor
- `contact-fields.js`: shared website and phone normalization helpers used by the app and admin
- `firestore.rules`: Cloud Firestore security rules for public reads and admin-only writes
- `package.json`: Node tooling for one-time Firebase Admin scripts
- `tools/set_admin_claim.mjs`: one-time script to grant or remove the Firebase `admin` custom claim
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

1. Shows a login screen.
2. Signs users in with Firebase Authentication using email and password.
3. Checks the signed-in user's Firebase custom claims for `admin: true`.
4. Loads organizations, categories, and resources from Firestore.
5. Allows creating, editing, and deleting:
   - resources
   - categories
   - subcategories inside category documents
   - organizations

## Firebase Configuration

The app is currently configured for this Firebase project in `firebase.js`:

- `projectId`: `washoe-community-resources`
- `authDomain`: `washoe-community-resources.firebaseapp.com`
- `storageBucket`: `washoe-community-resources.firebasestorage.app`
- `messagingSenderId`: `788386726804`

The Firebase web config is committed directly in the repository. That is normal for Firebase client apps, but it means the real security boundary must be enforced by Firebase Authentication and Firestore security rules, not by hiding the config.

## Data Model

The repo currently uses three active Firestore collections:

- `resources`
- `categories`
- `organizations`

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
  "Title": "",
  "OrganizationName": ""
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
- `status` controls whether the public app should treat the resource as live.
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

- this collection is admin-only in the current Firestore rules
- Phase 2 uses it as the owner lookup for `resources.organizationId`
- future org-user login and membership work will build on this collection

## Login Details

### Admin Login URL

Use:

- `admin.html`

Examples:

- local dev: `http://localhost:8000/admin.html`
- hosted site: `https://<your-site>/admin.html`

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
- access to the configured Firebase project if you want the live app and admin functions to work
- Node.js if you want to run the one-time admin-claim setup script locally

Node.js is not required to run the site itself, but it is required for the `tools/set_admin_claim.mjs` script.

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
- `/admin.html`
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
- `Title`
- `OrganizationName`

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

## Deployment

This repo is structured like a static site deployment.

### Minimum Deployment Requirements

Your hosting environment must:

- serve static HTML, CSS, JS, JSON, and image files
- allow browser access to Firebase CDN modules
- allow browser access to Google Fonts, if those fonts are still desired

### Common Deployment Pattern

A likely deployment setup is Firebase Hosting or another static host such as GitHub Pages, Netlify, Vercel static hosting, or a simple web server.

### Production Checklist

Before pushing to production, verify:

1. the Firebase project config points at the intended environment
2. Firestore rules from `firestore.rules` have been published to the intended project
3. Firebase Auth email/password sign-in is enabled
4. the admin user exists in Firebase Auth
5. the admin user has the Firebase custom claim `admin: true`
6. `resources`, `categories`, and `organizations` collections exist and contain expected data
7. contact email targets are still correct
8. branding assets and footer text are current
9. the site works on mobile and desktop browsers
10. the admin password is known and stored in an approved password manager

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
