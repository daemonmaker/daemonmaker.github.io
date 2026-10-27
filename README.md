# daemonmaker.github.io

Source for [daemonmaker.github.io](https://daemonmaker.github.io) — a one-page
AI/ML technical-lead portfolio.

## Stack

Plain static files. No build step, no generator, no framework.

- `index.html`
- `style.css`
- `assets/headshot.jpg`
- `grocery.html`, `grocery.css`, `grocery.js`, `grocery-config.js`, `grocery-items.mjs`, `grocery-meals.mjs`, `grocery-meal-editor.mjs` — unlisted grocery lists and meals (Firebase)
- `firestore.rules`, `firestore.indexes.json` — rules and index source; publish rules in the Firebase console
- `__/auth/*`, `__/firebase/init.json` — unused Firebase Auth handler copies, not the sign-in path

## Local preview

Open the file directly in a browser:

```bash
open index.html
```

Or, if you prefer a local server:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy

This repo is a GitHub user site. Push to `main` and GitHub Pages serves it
automatically at `https://daemonmaker.github.io`.

```bash
git add .
git commit -m "Update site"
git push origin main
```

First-time setup (one-time, on github.com):

1. Repo Settings → Branches → set the default branch to `main`.
2. Repo Settings → Pages → set Source to `Deploy from a branch`, Branch
   `main` / `/ (root)`.
3. Optional: delete the now-stale `master` branch.

Pages typically updates within ~30 seconds of a push.

## Updating the headshot

The site uses `assets/headshot.jpg`. To replace it:

1. Replace `assets/headshot.jpg` with the new image.
2. Commit and push.

Recommended: a square-ish portrait against a white background, at least
640×640 px.

## Editing content

The file `index.html` is short and self-contained. The page intentionally
omits employer/project names and any specific metrics — keep it that way.
LinkedIn is the only external contact link; do not add `mailto:` or GitHub
links.

## Grocery lists

Unlisted app at [daemonmaker.github.io/grocery.html](https://daemonmaker.github.io/grocery.html)
(not linked from the portfolio). Google sign-in via Firebase Auth; data in
Firestore project `daemonmaker-grocery`.

### Data model

- **`config/app`** — `defaultListId`: the shared list everyone opens on sign-in.
- **`lists/{listId}`** — `name`, `scope` (`shared` | `personal`), `ownerUid`
  (personal only), timestamps. Bootstrap shared list id: `shared-grocery`
  (name “Grocery”).
- **`lists/{listId}/items/{itemId}`** — `name`, `createdAt`, `checked`
  (boolean). Legacy items without `checked` display as unchecked. The UI sorts
  by name or checked state and supports inline rename (click the item name).
- **`meals/{mealId}`** — saved meals (not grocery lists): same fields as a list
  (`name`, `scope`, `ownerUid`, timestamps).
- **`meals/{mealId}/items/{itemId}`** — ingredient lines: `name`, `createdAt`
  only. No `checked` field.

Shared lists are visible and editable by any signed-in user. Personal lists are
private to the owner. Only shared lists can be set as the global default. Shared
meals work the same way; personal meals are owner-only.

### Add meal to list

When you add a meal to the active list, ingredients are matched to list items
by normalized name (trim + lowercase). Missing items are batch-added to the
list. A confirmation dialog lists each ingredient and lets you toggle `checked`
on the matching grocery row (duplicate names prefer an unchecked row). Logic
lives in `grocery-meals.mjs`; meal editing helpers in `grocery-meal-editor.mjs`.

### Firebase console checklist (one-time)

1. **Firestore** — create the database in **`us-west3` (Salt Lake City)**.
2. **Authentication** — enable **Google** sign-in.
3. **Authentication → Settings → Authorized domains** — add `daemonmaker.github.io`
   and `localhost`.
4. **Firestore → Rules** — copy from [firestore.rules](firestore.rules) and
   publish after every rules edit (including `meals` collections). Git does not
   deploy these rules. List item updates may change `checked` or `name`; new list
   items must include `checked` as a boolean. Meal item documents are
   `name` + `createdAt` only. A `get` of a list that does not exist yet must
   stay allowed, or the first sign-in cannot create `shared-grocery`.
5. **Firestore → Indexes** — if prompted, create the composite index for
   `lists` on `scope` + `ownerUid` (see [firestore.indexes.json](firestore.indexes.json)).
6. **Authorized redirect URIs** — in [Google Cloud Console](https://console.cloud.google.com/apis/credentials?project=daemonmaker-grocery)
   → **Credentials** → the Web client whose ID matches
   [grocery-config.js](grocery-config.js). Add these exactly, with no trailing
   slash:

   - `https://daemonmaker.github.io/grocery.html`
   - `http://localhost:8000/grocery.html`

Sign-in is a full-page redirect to Google. The page returns with an `id_token`
and `access_token` in the URL hash, and `grocery.js` signs in with
`signInWithCredential`. Firebase popups and `signInWithRedirect` do not finish
on GitHub Pages, and the OAuth client secret must not be committed. `authDomain`
stays `daemonmaker-grocery.firebaseapp.com`.

Local preview: `python3 -m http.server 8000`, then open
`http://localhost:8000/grocery.html`. Use `localhost`, not `127.0.0.1`. The
port is part of the redirect URI, so a different port will not match the URI
registered above.

Item sort/check and meal helpers:

```bash
node --test grocery-items.test.mjs grocery-meals.test.mjs grocery-meal-editor.test.mjs
```
