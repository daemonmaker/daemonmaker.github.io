# daemonmaker.github.io

Source for [daemonmaker.github.io](https://daemonmaker.github.io) — a one-page
AI/ML technical-lead portfolio.

## Stack

Plain static files. No build step, no generator, no framework.

- `index.html`
- `style.css`
- `assets/headshot.jpg`
- `grocery.html`, `grocery.css`, `grocery.js` — shared grocery lists (Firebase)

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
- **`lists/{listId}/items/{itemId}`** — `name`, `createdAt`.

Shared lists are visible and editable by any signed-in user. Personal lists are
private to the owner. Only shared lists can be set as the global default.

### Firebase console checklist (one-time)

1. **Firestore** — create the database in **`us-west3` (Salt Lake City)**.
2. **Authentication** — enable **Google** sign-in.
3. **Authentication → Settings → Authorized domains** — add `daemonmaker.github.io`
   and `localhost`.
4. **Firestore → Rules** — copy from [firestore.rules](firestore.rules) and
   publish.
5. **Firestore → Indexes** — if prompted, create the composite index for
   `lists` on `scope` + `ownerUid` (see [firestore.indexes.json](firestore.indexes.json)).
6. **Google OAuth client ID** — copy the **Web client ID** from Firebase Console
   → Authentication → Sign-in method → Google → Web SDK configuration. Paste
   it into [grocery-config.js](grocery-config.js) as `GOOGLE_OAUTH_CLIENT_ID`
   (public value, safe to commit). In [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   → Credentials → that Web client:
   - **Authorized JavaScript origins:** `https://daemonmaker.github.io`,
     `http://localhost`
   - **Authorized redirect URIs:** `https://daemonmaker.github.io/grocery.html`,
     `http://localhost:8000/grocery.html` (adjust port if needed)

Local preview: `python3 -m http.server 8000` then open `/grocery.html`.

**Why not Firebase popup/redirect?** GitHub Pages cannot host Firebase’s
`__/auth/*` helpers, and browsers block the cross-site storage handoff between
`github.io` and `firebaseapp.com`. Sign-in uses a **full-page Google OAuth
redirect** (token in URL hash) plus Firebase `signInWithCredential` — no popup or
`postMessage`, so Chrome COOP warnings from the GIS button are avoided.
See [Firebase redirect best practices](https://firebase.google.com/docs/auth/web/redirect-best-practices).
