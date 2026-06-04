# daemonmaker.github.io

Source for [daemonmaker.github.io](https://daemonmaker.github.io) — a one-page
AI/ML technical-lead portfolio.

## Stack

Plain static files. No build step, no generator, no framework.

- `index.html`
- `style.css`
- `assets/headshot.jpg`

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
