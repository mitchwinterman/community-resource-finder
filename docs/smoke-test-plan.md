# Browser Smoke Test Plan

This repo is a static multi-page frontend with three main browser surfaces:

- `index.html`: public search, filter, detail, and map experience
- `admin.html`: authenticated admin CRUD and review workflow
- `org.html`: authenticated organization portal and request submission flow

The new smoke harness uses Playwright with mocked Firebase/CDN dependencies so failures point at the UI instead of live Firestore, Auth, Leaflet, Quill, or DOMPurify availability.

## Test Matrix

Configured projects:

- `chromium-desktop`: broad evergreen Chromium coverage
- `firefox-desktop`: Gecko layout and form-control coverage
- `webkit-desktop`: Safari-style layout/overflow coverage
- `tablet-portrait`: tablet breakpoint coverage around the app's `900px` responsive switch
- `mobile-safari`: narrow mobile viewport coverage

Core smoke coverage:

- `tests/smoke/public.smoke.spec.js`
  - public results list loads from seeded mock data
  - search, category, and subcategory filters work
  - selecting a result updates the details panel
  - details/map toggles work
  - responsive split/stack behavior stays intact
- `tests/smoke/static-pages.smoke.spec.js`
  - `about.html`, `help.html`, and `contact.html` render without runtime failures
  - `contact.html` suggestion fields enable/disable correctly
  - pages do not overflow horizontally
- `tests/smoke/auth.smoke.spec.js`
  - login page handles empty forgot-password flow
  - password reset page renders and validates confirmation mismatch
- `tests/smoke/admin-org-review.smoke.spec.js`
  - admin portal loads authenticated seeded data and opens the editor shell
  - org portal loads owned resources and request history
  - quarterly review page loads tokenized resource data and records confirmation

## Running

Install the test dependency and browsers first:

```powershell
npm.cmd install
npx playwright install chromium firefox webkit
```

Run the full smoke matrix:

```powershell
npm.cmd run smoke:test
```

Run interactively:

```powershell
npm.cmd run smoke:test:headed
```

## Pre-Test Recommendations

These are worth addressing before treating smoke results as authoritative:

1. Add viewport metadata to every HTML shell.
   This is now patched for the non-public pages because mobile rendering was otherwise misleading by default.

2. Clean up encoding/mojibake in several static pages.
   Examples showed up in page titles and footer separators. Smoke tests can still run, but text regressions will be noisy until file encoding is normalized consistently to UTF-8.

3. Add at least one layout breakpoint between desktop and phone.
   The public page currently jumps from a wide multi-column layout straight to stacked layout at `900px`. Tablets and smaller laptops are the most likely place for clipped controls and awkward wrapping.

4. Keep smoke tests backend-independent.
   Cross-browser layout checks should not depend on live Firebase data, auth state, or third-party CDNs. The new suite follows that rule on purpose.

## Follow-Up Coverage

After the smoke suite is stable, the next high-value additions are:

- visual snapshots for the public page header/search/results layout
- authenticated save-flow tests against a disposable Firebase project or emulator
- targeted accessibility checks for keyboard navigation and tab order
