# Community Resource Finder

Community Resource Finder is a Firebase-backed directory for browsing community services, filtering them by category and subcategory, and maintaining the directory through a browser-based admin panel.

This repository currently contains the public site, the admin interface, the one-time Firestore import tool, the Firebase client configuration, and the legacy JSON source files that were used to seed the Firestore database.

## What This Project Does

The app is designed to help patrons and staff find local organizations and programs by:

- searching by organization name, description, keywords, categories, and subcategories
- filtering the directory by category and subcategory
- viewing resource details in a master-detail layout
- maintaining resources and categories through an authenticated admin page
- importing existing JSON records into Firestore

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
- `admin.js`: admin authentication and CRUD operations for resources and categories
- `admin.css`: admin styling
- `import.html`: one-time import page
- `import.js`: one-time Firestore importer for `data.json` and `categories.json`
- `migrate-taxonomy.html`: one-time schema migration page for converting legacy resource taxonomy strings to arrays
- `migrate-taxonomy.js`: migration logic for rewriting existing Firestore resource docs
- `firebase.js`: Firebase app, Firestore, and Auth initialization
- `data.json`: legacy resource data source used for initial import
- `categories.json`: legacy category/subcategory data source used for initial import
- `crf-logo.png`: Community Resource Finder logo
- `wcls-logo.png`: Washoe County Library System logo

## High-Level Architecture

### Public App

The public app lives in `index.html` + `app.js`.

At startup it:

1. Connects to Firebase using the config in `firebase.js`.
2. Reads the `resources` collection from Firestore.
3. Reads the `categories` collection from Firestore.
4. Builds the category and subcategory filter dropdowns.
5. Filters all loaded records client-side in the browser.
6. Renders a result list on the left and resource details on the right.

### Admin App

The admin app lives in `admin.html` + `admin.js`.

It:

1. Shows a login screen.
2. Signs users in with Firebase Authentication using email and password.
3. Checks the signed-in email against a hard-coded admin email in `admin.js`.
4. Loads categories and resources from Firestore.
5. Allows creating, editing, and deleting:
   - resources
   - categories
   - subcategories inside category documents

### Import Tool

The import tool lives in `import.html` + `import.js`.

It:

- reads `data.json`
- reads `categories.json`
- writes those records into Firestore
- is intended for one-time use only

Important: the import tool uses `addDoc()`, so rerunning imports will create duplicate records unless the target collections are cleared first.

## Firebase Configuration

The app is currently configured for this Firebase project in `firebase.js`:

- `projectId`: `washoe-community-resources`
- `authDomain`: `washoe-community-resources.firebaseapp.com`
- `storageBucket`: `washoe-community-resources.firebasestorage.app`
- `messagingSenderId`: `788386726804`

The Firebase web config is committed directly in the repository. That is normal for Firebase client apps, but it means the real security boundary must be enforced by Firebase Authentication and Firestore security rules, not by hiding the config.

## Data Model

The repo currently uses two Firestore collections:

- `resources`
- `categories`

### `resources` Collection

Each document in `resources` is expected to look roughly like this:

```json
{
  "Organization": "Example Organization",
  "Description": "What the organization provides",
  "Address": "123 Main St",
  "City": "Reno",
  "Zip": "89501",
  "Phone": "(775) 555-1234",
  "Website": "example.org",
  "Categories": ["Housing & Homelessness", "Food & Basic Needs"],
  "Subcategories": ["Emergency Shelter", "Food Pantry"],
  "Email": "info@example.org",
  "Hours": "Mon-Fri 9am-5pm",
  "Eligibility": "Varies by program",
  "Cost": "Free",
  "Notes": "Additional notes",
  "DescriptionDelta": { "ops": [] },
  "NotesDelta": { "ops": [] },
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
- `Last Verified` is stored as a string in `YYYY-MM-DD` format when entered through the admin UI.

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
- The import tool can also derive these records from `categories.json`.

## Login Details

### Admin Login URL

Use:

- `admin.html`

Examples:

- local dev: `http://localhost:8000/admin.html`
- hosted site: `https://<your-site>/admin.html`

### Admin Email

The admin email currently hard-coded in the app is:

- `mwinterman@washoecounty.gov`

This is defined in `admin.js` as `ADMIN_EMAIL`.

### Admin Password

The password is not stored anywhere in this repository.

To log in successfully, a user must have:

1. a Firebase Authentication user account with email/password sign-in enabled
2. that account's email set to `mwinterman@washoecounty.gov`
3. the correct current password for that Firebase Auth account

If the password has been lost, recover or reset it in Firebase Authentication. Do not add plaintext passwords to this repository.

### Important Security Note

The current admin authorization model has two layers:

1. Firebase Authentication sign-in by email and password
2. client-side email check in `admin.js`

That second step is only a UI gate. Actual protection for Firestore data should be enforced in Firebase security rules. If those rules are too permissive, changing the frontend alone will not secure the data.

## Local Development

### Prerequisites

You need:

- a web browser
- internet access to load the Firebase CDN modules and Google Fonts
- access to the configured Firebase project if you want the live app and admin functions to work

No Node.js install is required for the current repo as written.

### Why You Should Use a Local Web Server

Even though this is a static site, you should serve it through a local web server instead of opening the HTML files directly from disk.

Reasons:

- ES modules are loaded via `<script type="module">`
- `import.js` fetches local JSON files
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
- `/import.html`
- `/migrate-taxonomy.html`

## Public Site Behavior

### Search

The public search input searches across these fields:

- `Organization`
- `Description`
- `Categories`
- `Subcategories`
- `Keywords`

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

If login succeeds and the email matches `ADMIN_EMAIL`, the admin panels are shown.

If login succeeds but the email does not match `ADMIN_EMAIL`, the UI signs the user back out and shows a not-authorized message.

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
- `Description`
- `Categories & Subcategories`
- `Keywords`
- `Website`
- `Phone`
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

### Category Management

The Categories panel allows staff to:

- view all categories
- create a new category
- edit an existing category name
- add or remove subcategories
- save changes
- delete categories

## Import Workflow

The import tool exists to seed Firestore from the JSON files in this repo.

### What It Imports

- `data.json` -> `resources` collection
- `categories.json` -> `categories` collection

### How to Run the Import

1. Make sure Firebase is pointed at the correct project.
2. Start a local web server.
3. Open `import.html`.
4. Click one of:
   - `Import Resources`
   - `Import Categories`
   - `Import BOTH (Resources + Categories)`
5. Watch the on-page log for progress and errors.

### Import Safety Notes

- The importer does not deduplicate records.
- The importer does not upsert by ID.
- The importer does not delete old records first.
- Running an import multiple times will create duplicates.
- `import.html` and `import.js` should not remain publicly exposed on production hosting after the data is loaded.
- Resource imports convert legacy category/subcategory strings into arrays using the category definitions in `categories.json`.

## Schema Migration

The repository now expects `resources.Categories` and `resources.Subcategories` to be Firestore arrays.

If your existing Firestore data still uses legacy comma-delimited strings, run the one-time migration page before deploying the hard-cutover app/admin changes.

### Migration Page

Use:

- `migrate-taxonomy.html`

Examples:

- local dev: `http://localhost:8000/migrate-taxonomy.html`
- hosted temporary page: `https://<your-site>/migrate-taxonomy.html`

### Migration Steps

1. Start a local web server for this repo.
2. Open `migrate-taxonomy.html`.
3. Sign in with the admin Firebase account.
4. Click `Preview Migration`.
5. Review any warnings in the on-page log.
6. Click `Run Migration`.
7. Deploy the updated app/admin code only after the migration succeeds.

### Migration Notes

- The migration rewrites existing resource docs in Firestore.
- It converts `Categories` and `Subcategories` from strings to arrays.
- Docs with unmatched leftover taxonomy text are skipped and logged for manual review.
- `migrate-taxonomy.html` and `migrate-taxonomy.js` should not remain publicly exposed after use.

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
2. Firestore rules protect write access appropriately
3. Firebase Auth email/password sign-in is enabled
4. the admin user exists in Firebase Auth
5. the admin password is known and stored in an approved password manager
6. `resources` and `categories` collections exist and contain expected data
7. `import.html` and `import.js` are removed from production hosting if no longer needed
8. contact email targets are still correct
9. branding assets and footer text are current
10. the site works on mobile and desktop browsers

## Firestore and Auth Setup Checklist

If recreating the project from scratch:

1. Create or select the Firebase project.
2. Enable Firestore.
3. Enable Firebase Authentication.
4. Turn on Email/Password as a sign-in provider.
5. Create the admin user:
   - email: `mwinterman@washoecounty.gov`
   - password: set this in Firebase Auth or through the Admin SDK, then store it outside the repo
6. Configure Firestore security rules.
7. Serve this site and confirm the client can read the intended collections.
8. Log into `admin.html` and confirm create/edit/delete behavior.

## Operational Notes

### Data Quality

The current dataset appears to contain some inconsistent values, placeholder blanks, and formatting issues. Examples include:

- blank fields represented as `" "` instead of empty strings
- multiple websites stored in a single `Website` field
- inconsistent capitalization in some subcategories
- taxonomy entries in `categories.json` with formatting artifacts

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
- admin authorization includes a client-side hard-coded email check

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
- that the email is exactly `mwinterman@washoecounty.gov`
- that the password is correct
- that the site can reach Firebase Auth endpoints

### Admin Loads But Writes Fail

Check:

- Firestore rules
- browser console errors
- that the authenticated user has permission to write the `resources` and `categories` collections

### Import Runs But Duplicates Appear

That is expected if the importer has been run more than once without clearing or deduplicating the target collections.

## Suggested Next Maintenance Steps

If you are actively maintaining this project, the highest-value follow-up work is:

1. add Firestore rules and document them in the repo
2. replace `mailto:` contact flow with a real submission backend
3. remove or secure the import page in production
4. remove or secure the migration page after the cutover
5. add a data validation and cleanup process for the taxonomy and imported records

## Maintenance Ownership Notes

If another maintainer inherits this repo, they will need access to:

- the Firebase project
- Firebase Authentication user management
- Firestore data
- hosting configuration
- the admin account password, stored outside the repo

Without that access, the code alone is not enough to operate the system end-to-end.
