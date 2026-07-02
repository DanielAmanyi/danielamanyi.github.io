# Control Panel

A static homepage that acts as the front door to your whole ecosystem of HTML
apps. Pure HTML/CSS/JS, no build step, no backend — deploys straight to
GitHub Pages.

## Structure

```
control-panel/
├── index.html          Homepage (sidebar, search, portal grid, recents)
├── css/style.css        Design tokens + all styling
├── js/data.js            ★ Edit this to add/remove portals & quick actions
├── js/app.js              Rendering, command palette, keyboard shortcuts
├── docs/                Docs portal (Strategy/Architecture/Whitepapers/…)
│   ├── index.html
│   └── data.js          ★ Edit this to add your writing
├── library/              Library portal (opens PDFs in the native viewer)
│   ├── index.html
│   └── data.js           ★ Edit this to add books/papers/references
├── titan/  pretitan/  interview/  evaluator/
├── meridian/  boss/  music/       Placeholder folders — drop your existing
                                    app's files in here, replacing the
                                    stub index.html. No other changes needed.
```

## Adding or changing a portal

Open `js/data.js` and edit the `PORTALS` array. Each entry needs:

```js
{
  id: "titan",              // unique, used internally
  name: "TITAN",            // shown on the card
  path: "titan/index.html", // where it links to
  category: "build",        // controls the accent color — see CATEGORIES
  description: "…",
  icon: "titan",             // key into the ICONS map in js/app.js
  shortcut: "T",             // single-key jump from the homepage
}
```

Nothing else needs to change — the sidebar, portal grid, command palette,
and keyboard shortcuts all read from this one list.

## Adding documents / library items

- `docs/data.js` — add entries to `DOCUMENTS`, set `category` to one of the
  values in `DOC_CATEGORIES`, and point `href` at the actual page/file.
- `library/data.js` — add entries to `LIBRARY_ITEMS`, set `category` to one
  of `LIBRARY_CATEGORIES`, and point `href` directly at a PDF (or other
  file). Library links open in a new tab and use the browser's own PDF
  viewer — there's no custom reader to maintain.

## Navigation

- `⌘K` / `Ctrl+K` (or `/`) opens the command palette — fuzzy search across
  every portal, document, and quick action, arrow keys + Enter to jump.
- Single-letter shortcuts (shown on each card) jump straight to a portal
  from the homepage, e.g. press `T` for TITAN.
- "Recently Visited" and "Recent Documents" are tracked automatically in
  `localStorage` as you click around — nothing to configure.

## Deploying

Push this folder to a GitHub repo and enable Pages (Settings → Pages →
Deploy from branch). No build step required.
