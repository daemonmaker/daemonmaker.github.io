# AGENTS.md

Static GitHub Pages site at https://daemonmaker.github.io. Two surfaces:

- Portfolio: `index.html` + `style.css`. LinkedIn is the only outbound link.
- Grocery lists: unlisted app at `/grocery.html`. Do not link it from the portfolio.

Plain files only. No build, no npm, no framework, no bundler.

## Portfolio

`index.html` stays short and self-contained. Do not add employer or project names, metrics, `mailto:` links, or GitHub links. Headshot is `assets/headshot.jpg`.

## Grocery app

Files: `grocery.html`, `grocery.css`, `grocery.js`, `grocery-config.js`, `grocery-items.mjs`, `grocery-meals.mjs`, `grocery-meal-editor.mjs`, `firestore.rules`, `firestore.indexes.json`.

Firebase project `daemonmaker-grocery`. Firestore region `us-west3`. The web API key in `grocery.js` is public; security is Firestore rules. Never put a Google OAuth client secret in this repo. The web client is confidential, so the authorization-code flow cannot run here.

### Data model

- `config/app.defaultListId` — shared list everyone opens after sign-in.
- `lists/{listId}` — `name`, `scope` (`shared` | `personal`), `ownerUid` (personal only), `createdAt`, `updatedAt`.
- `lists/{listId}/items/{itemId}` — `name`, `createdAt`, `checked` (boolean). Missing `checked` is treated as unchecked in the UI. Client sort by name or checked state; inline rename uses `itemNameCommitAction` in `grocery-items.mjs`.
- Bootstrap list id `shared-grocery`, name `Grocery`.
- `meals/{mealId}` — saved meals, not grocery lists: `name`, `scope` (`shared` | `personal`), `ownerUid` (personal only), `createdAt`, `updatedAt` (same shape as `lists/{listId}`).
- `meals/{mealId}/items/{itemId}` — ingredient lines only: `name`, `createdAt`. No `checked`; checked state lives on grocery list items when a meal is added to a list.

Any signed-in user can create, rename, delete, and edit shared lists and their items. Personal lists are owner-only. Only a shared list can be the global default. Deleting the default reassigns it or recreates `shared-grocery`. Shared meals and their ingredients are editable by any signed-in user; personal meals are owner-only.

`firestore.rules` is the rules source, but GitHub Pages does not publish them. Copy the file into the Firebase console and publish it after any rules change (including list item `checked` or `name` updates and `meals` rules). List reads are split into `get` and `list`: a `get` of a missing list must be allowed, or `ensureBootstrap()` fails with `permission-denied` before it can create `shared-grocery`. `readDocOrMissing()` treats that denial as "missing" and then creates the doc. Queries use `list` and must stay constrained to `scope == shared` or `ownerUid == auth.uid`. Meal access follows the same shared vs personal pattern as lists.

### Add meal to list

Adding a meal to the active grocery list uses normalized names (trim + lowercase) in `grocery-meals.mjs`. `matchMealItems()` pairs each meal ingredient with a list row; when several rows share a name, prefer an unchecked match (missing `checked` counts as unchecked). `itemsToAdd()` returns spellings not on the list yet (case-insensitive; duplicate ingredient names in the meal collapse to the first spelling). The client batch-adds missing items, then shows a dialog where each matched line can toggle the grocery item’s `checked` state. Meal and ingredient name parsing while editing meals is in `grocery-meal-editor.mjs` (`parseMealName`, `parseIngredientName`, `ingredientExists` for duplicate detection against the meal’s items; `mealEditorNameBlurAction`, `draftMealPersistResult`, `mealIngredientAddAttempt` (validation and focus hints for Add ingredient), and related helpers for draft vs saved meal editor behavior). Meal editor errors show in `#meal-editor-message` inside the dialog.

### Sign-in

`grocery.js` is the source of truth for the implementation. `README.md` summarizes the same flow for people.

Sign-in is a full-page redirect to Google's implicit flow (`response_type=id_token token`, `response_mode=fragment`), then `signInWithCredential`. Auth is `initializeAuth` with `browserLocalPersistence` and no popup or redirect resolver. `authDomain` stays `daemonmaker-grocery.firebaseapp.com`.

The inline script in `grocery.html` must keep running before the module:

1. Stash a hash that contains `id_token`, `access_token`, or `error` in `sessionStorage` key `grocery_oauth_hash`.
2. Strip that hash with `history.replaceState`.
3. Delete `sessionStorage` keys whose names contain `firebase`, so a leftover Firebase redirect does not send the user back to Google.

`completeGoogleRedirect()` reads that stash, checks the nonce in `localStorage` key `grocery_google_oauth_nonce`, and signs in. JWT payloads are base64url and often unpadded; pad them before `atob`.

Redirect URI must match Google Cloud exactly, including port and with no trailing slash:

- Production: `https://daemonmaker.github.io/grocery.html` (`GOOGLE_OAUTH_REDIRECT_URI`).
- Local: `http://localhost:<port>/grocery.html`, from `origin + pathname`. Hostname must be `localhost`, not `127.0.0.1`. The registered local URI is `http://localhost:8000/grocery.html`.

Do not switch sign-in back to any of these. Each one fails on this host:

- `signInWithPopup` or `signInWithRedirect` (Chrome COOP blocks `window.close`; third-party storage drops the redirect result between `github.io` and `firebaseapp.com`).
- GIS `gsi/client`, including `initTokenClient` with `ux_mode: "redirect"` (it still opens a popup and polls `window.closed`).
- Raw FedCM against `https://accounts.google.com/gsi/fedcm.json`.
- Authorization-code exchange (`client_secret is missing`).
- `authDomain` set to `daemonmaker.github.io` with the self-hosted `/__/auth/handler`. That handler loses `sessionStorage` ("missing initial state") and loops back to Google.

`__/auth/` and `__/firebase/init.json` are leftover same-origin handler files. `.nojekyll` must stay so Jekyll does not ignore `__`. GitHub Pages serves extensionless files as `application/octet-stream`, which is why the handler and iframe live at `__/auth/handler/index.html` and `__/auth/iframe/index.html`. They are not the active sign-in path.

### CSS

Keep this rule in `grocery.css`:

```css
[hidden] {
  display: none !important;
}
```

`.login { display: grid }` overrides the HTML `hidden` attribute. Without the `!important` rule, a successful sign-in still shows the login card and looks like a login loop. The signed-in shell is on the page underneath.

## Local preview

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/grocery.html`. The local server serves the working tree, so it is ahead of GitHub Pages until `main` is pushed.

Item sort/check and meal helpers:

```bash
node --test grocery-items.test.mjs grocery-meals.test.mjs grocery-meal-editor.test.mjs
```

## Deploy

This is a GitHub user site. Push to `main` and Pages serves the repo root. Do not commit or push unless asked. Do not commit `.env`, credentials, or an OAuth client secret.
