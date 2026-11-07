# AGENTS.md

Static GitHub Pages site at https://daemonmaker.github.io. Four surfaces:

- Portfolio: `index.html` + `style.css`. LinkedIn is the only outbound link.
- Apps launcher: unlisted app at `/apps.html`. Do not link it from the portfolio.
- Grocery lists: unlisted app at `/grocery.html`. Do not link it from the portfolio.
- Habit tracker: unlisted app at `/habits.html`. Do not link it from the portfolio.

Plain files only. No build, no npm, no framework, no bundler.

## Portfolio

`index.html` stays short and self-contained. Do not add employer or project names, metrics, `mailto:` links, or GitHub links. Headshot is `assets/headshot.jpg`.

## Shared app chrome (apps, grocery, habits)

The three Firebase apps share one tight, menu-driven chrome. Keep them aligned; do not reintroduce sprawling header toolbars, separate theme pages, or loose card-heavy layouts.

### Density and look

- Tight UI: compact padding and controls (`--text-base: 15px`, small `--btn-pad-*` / `--input-pad-*`, short nav rows, modest `--coin-size`). Prefer denser rows over card stacks and always-visible action strips.
- Light mode is black text on white; dark mode is white on black. Flat surfaces; avoid heavy multi-layer chrome.
- Keep `[hidden] { display: none !important; }` in each app CSS (`.login { display: grid }` otherwise overrides HTML `hidden` and looks like a login loop).

### Theme

- Modes: `system` | `light` | `dark`. `system` follows `prefers-color-scheme`.
- Shared theme `localStorage` key: `micro_apps_theme` (read/write via `app-theme.mjs`; migrates legacy `apps_theme`, `grocery_theme`, `habits_theme` on load).
- Inline head script sets `data-apps-theme` / `data-grocery-theme` / `data-habits-theme` on `<html>` before CSS loads to avoid a flash.
- Login: System / Light / Dark buttons before sign-in.
- Signed-in: theme radios live in the user-coin account menu (`.theme-controls.theme-controls--menu`).

### Menus

- **User coin** (initial via `userCoinLetter`): opens the account menu — display name, theme radios, Sign out. Grocery and habits also link back to `apps.html` ("Micro Apps"). Close on outside click / Escape.
- **Hamburger** (`.icon-btn--menu` with `.icon-btn__bars`): contextual options for the active entity. Grocery: list menu (set default, delete). Habits: habit menu (layout, range, delete). Apps launcher has the coin only (no hamburger).
- Put contextual actions in these menus, not as always-visible header button rows. When an app has both menus, only one panel should be open at a time.

### Swipe-to-delete rows

Use the same swipe pattern wherever a list row can be deleted. Do not show always-visible **Remove** / **Delete** text buttons on those rows.

- Swipe the row **left** to reveal a red **trash** icon strip on the **right** (`background: var(--danger)`).
- Markup: outer row (`overflow: hidden`, `touch-action: pan-y`) with a hidden **reveal** layer on the right (`.items__reveal` or `.roster__reveal`) and a **front** layer (`.items__front` or `.roster__front`) that translates left. Toggle `is-swiping` / `is-revealed` during interaction; CSS width via `--items-swipe-w` or `--roster-swipe-w` (typically `3.25rem`).
- **Grocery** list items: implementation in `grocery.js` (`bindItemSwipe`, `trashIconSvg`, `ITEMS_SWIPE_WIDTH_PX` / open threshold).
- **Micro Apps** admin roster (`#roster`): implementation in `apps-roster-swipe.mjs` (`bindRosterRowSwipe`, `clampSwipeOffset`, `shouldOpenSwipe`); wired from `apps.js`. Do not start a swipe from checkboxes on the row.
- Only one row may stay open at a time; close on outside click or **Escape** (and when re-rendering the list).

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

Only users with `grocery` in `access/{emailKey}.apps` may read or write grocery data (Firestore rules + client 404 if signed in without access). Among entitled users, shared lists and meals are editable by anyone signed in; personal lists and meals are owner-only. Only a shared list can be the global default. Deleting the default reassigns it or recreates `shared-grocery`.

- `prefs/{uid}` — per-user UI state (owner-only): optional `groceryActiveListId`, optional `habitsActiveHabitId`, `updatedAt`. Grocery and habits read/write their own field on selection; Firestore wins over `localStorage` on sign-in, with one-time upload when cloud is empty but local has a value. Helpers in `app-prefs.mjs`.

`firestore.rules` is the rules source, but GitHub Pages does not publish them. Copy the file into the Firebase console and publish it after any rules change (including list item `checked` or `name` updates, `meals` rules, and `prefs/{uid}`). List reads are split into `get` and `list`: a `get` of a missing list must be allowed, or `ensureBootstrap()` fails with `permission-denied` before it can create `shared-grocery`. `readDocOrMissing()` treats that denial as "missing" and then creates the doc. Queries use `list` and must stay constrained to `scope == shared` or `ownerUid == auth.uid`. Meal access follows the same shared vs personal pattern as lists.

### Add meal to list

Adding a meal to the active grocery list uses normalized names (trim + lowercase) in `grocery-meals.mjs`. `matchMealItems()` pairs each meal ingredient with a list row (each result includes the meal item `id` for stable UI keys); when several rows share a name, prefer an unchecked match (missing `checked` counts as unchecked). `itemsToAdd()` returns spellings not on the list yet (case-insensitive; duplicate ingredient names in the meal collapse to the first spelling). The client batch-adds missing items, then opens `#meal-dialog`, where checkboxes toggle grocery list `checked` state and the meal title and ingredient names support the same inline rename pattern as the meal editor (`#meal-dialog-message` for errors; ingredient duplicate renames rejected case-insensitively excluding the row being edited). Meal and ingredient name parsing while editing meals is in `grocery-meal-editor.mjs` (`parseMealName`, `parseIngredientName`, `ingredientExists`, `ingredientExistsAmongOthers`, `mealEditorNameBlurAction`, `mealEditorTitleCommitUIEffect`, `mealIngredientNameCommitAction`, `mealIngredientNameCommitUIEffect`, `draftMealPersistResult`, `mealIngredientAddAttempt` (validation and focus hints for Add ingredient), and related helpers for draft vs saved meal editor behavior). The meal editor dialog uses the same inline rename pattern as grocery list items for the meal title and each ingredient row (click name, edit, commit on Enter/change/blur/outside pointerdown in the dialog). Ingredient renames reject duplicates case-insensitively, excluding the row being edited. Meal editor errors show in `#meal-editor-message` inside the dialog.

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

### UI

Follow [Shared app chrome](#shared-app-chrome-apps-grocery-habits). Sidebar list nav with user coin; active-list **hamburger** for set-default / delete (list delete stays in the menu; **item** delete uses [swipe-to-delete rows](#swipe-to-delete-rows)). List title uses the same inline rename pattern as item names (click title to edit).

### CSS

Keep `[hidden] { display: none !important; }` in `grocery.css` as required by Shared app chrome (login grid vs signed-in shell).

## Habits app

Files: `habits.html`, `habits.css`, `habits.js`, `habits-config.js`, `habits-grid.mjs`, `habits-grid.test.mjs`, `habits-state.mjs`, `habits-state.test.mjs`. Same Firebase project and auth domain as grocery. Does not import grocery or portfolio files.

### Data model

- `habits/{habitId}` — `name`, `ownerUid`, `doneColor`, `undoneColor`, `todayOutlineColor`, `doneDayKeys` (array of `yyyy-mm-dd` strings), `createdAt`, `updatedAt`. Requires `habits` in `access/{emailKey}.apps`. Owner-only; query `where ownerUid == auth.uid`. Toggle a day with `arrayUnion` / `arrayRemove` on `doneDayKeys` (missing field treated as empty in the UI). Client shows 404 when signed in without access. Active habit syncs via `prefs/{uid}.habitsActiveHabitId` (see grocery data model).

### UI

Follow [Shared app chrome](#shared-app-chrome-apps-grocery-habits). Dot grid per habit: **Week grid** (7 columns, week starts Sunday) or **Wrapping row**. **Rolling year** (last 365 days through today, dots in reverse chronological order so today is at the top) or **Calendar year** (current year with leading padding; future days muted and not togglable). Per-habit done/undone/today-outline colors via color pickers (defaults green / grey / blue ring on today’s dot). Layout and range prefs in `localStorage` (`habits_layout`, `habits_range`); theme uses shared `micro_apps_theme` per Shared app chrome.

Sidebar **My Habits** with **user coin**; active-habit **hamburger** for layout, range, and delete. Sidebar habit list scrolls (~3 rows visible); **+** creates a habit.

Date layout helpers live in `habits-grid.mjs` (`toDateKey`, `rollingDays`, `calendarYearDays`, `weekGridCells`, `wrapSequence`, `dayKeysForRange`). Done-state and UI prefs helpers live in `habits-state.mjs` (`doneDayKeysForHabit`, `isDayDoneForHabit`, `reconcilePendingDoneKeys`, `userCoinLetter`, `parseThemePref`, `parseLayoutPref`, `parseRangePref`).

### Sign-in

Same implicit Google redirect pattern as grocery with habits-specific keys:

1. Inline script in `habits.html`: stash OAuth hash in `sessionStorage` `habits_oauth_hash`, strip hash, clear `firebase` session keys.
2. `localStorage` `habits_google_oauth_nonce` for nonce verification.
3. Prod redirect: `https://daemonmaker.github.io/habits.html` (`habits-config.js`). Local: `http://localhost:8000/habits.html`.

Register those redirect URIs on the same Google OAuth web client as grocery.

### CSS

Keep `[hidden] { display: none !important; }` in `habits.css` as required by Shared app chrome (login grid vs signed-in shell).

## Apps launcher

Files: `apps.html`, `apps.css`, `apps.js`, `apps-config.js`, `apps-access.mjs`, `apps-access.test.mjs`, `apps-roster-swipe.mjs`, `apps-roster-swipe.test.mjs`. Same Firebase project and auth domain as grocery/habits. Does not import grocery, habits, or portfolio files. User-facing title: **Micro Apps** (`<title>` and signed-in heading).

### Data model

- `config/admins` — `uids` and `emails` (lowercase) for admins who can manage invites. Readable by any signed-in user; writable by admins only. Bootstrap: seed admin emails in `apps-config.js` (`SEED_ADMIN_EMAILS`) and matching literals in `firestore.rules` `isSeedAdmin()`.
- `access/{emailKey}` — `email` (lowercase, equals doc id), `apps` (`grocery` | `habits`), optional `uid` (set on first sign-in), optional `displayName`, `createdAt`, `updatedAt`. Invites are admin-only; users may bind their own `uid`.

### UI

Follow [Shared app chrome](#shared-app-chrome-apps-grocery-habits). Title row with **user coin** only (no hamburger). Non-admins with an access doc see launcher links for granted apps. Admins also see **People & access** (invite by email, toggle app checkboxes). Removing an invite uses [swipe-to-delete rows](#swipe-to-delete-rows) on `#roster` — no visible Remove button. Signed-in users without an access doc see 404 (same pattern on grocery/habits when the app is missing from `apps`).

Access helpers live in `apps-access.mjs` (`normalizeEmail`, `hasApp`, `sessionView`, `bindUidWrite`, `inviteUpsertFields`, `appsLauncherLinks`, `isAdminUser`, etc.).

### Sign-in

Same implicit Google redirect pattern with apps-specific keys:

1. Inline script in `apps.html`: stash OAuth hash in `sessionStorage` `apps_oauth_hash`, strip hash, clear `firebase` session keys.
2. `localStorage` `apps_google_oauth_nonce` for nonce verification.
3. Prod redirect: `https://daemonmaker.github.io/apps.html` (`apps-config.js`). Local: `http://localhost:8000/apps.html`.

Register those redirect URIs on the same Google OAuth web client as grocery.

### CSS

Keep `[hidden] { display: none !important; }` in `apps.css` as required by Shared app chrome (login grid vs signed-in shell).

### Deploy order (access rules)

After publishing `firestore.rules` with `hasApp()` gates: sign in to `/apps.html` as seed admin first so the client can create `config/admins` and your `access/{email}` doc with both apps; then invite others before they rely on grocery/habits.

## Local preview

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/grocery.html`, `http://localhost:8000/habits.html`, or `http://localhost:8000/apps.html`. The local server serves the working tree, so it is ahead of GitHub Pages until `main` is pushed.

Pure helper tests:

```bash
node --test grocery-items.test.mjs grocery-meals.test.mjs grocery-meal-editor.test.mjs grocery-prefs.test.mjs app-prefs.test.mjs app-theme.test.mjs habits-grid.test.mjs habits-state.test.mjs apps-access.test.mjs apps-roster-swipe.test.mjs
```

After access or habits rule changes, copy `firestore.rules` into the Firebase console and publish (same as grocery).

## Deploy

This is a GitHub user site. Push to `main` and Pages serves the repo root. Do not commit or push unless asked. Do not commit `.env`, credentials, or an OAuth client secret.
