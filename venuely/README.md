# Venuely – event layout studio

A zero-build web app for planning event layouts (weddings, concerts, conferences, festivals, parties) in
**flat 2D plan view** or **isometric view**. Everything is modelled once and drawn in both views.

## Pages

| Page | What it is |
|---|---|
| `index.html` | Home page: what Venuely is, features, templates, and a way into the app |
| `app.html` | The editor. Anyone can design; export, print and saving need a free account |
| `projects.html` | Dashboard of the signed-in person's saved projects (open, rename, duplicate, delete) |

## Accounts and saved projects

Signing in uses **Firebase** (Google + email/password) and saves projects to **Firestore**. Until you add your keys the site runs in **demo mode**: accounts and projects live in the visitor's browser only, which is fine for trying things out but is not real security or sync.

To switch on real accounts:

1. Create a free project at <https://console.firebase.google.com>.
2. *Build → Authentication → Get started*: enable **Google** and **Email/Password**. Under *Settings → Authorized domains* add the domain you host on.
3. *Build → Firestore Database → Create database*, then paste these rules:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{db}/documents {
       match /users/{uid}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
4. *Project settings → Your apps → Web app* and copy the config into `js/config.js` as `FIREBASE_CONFIG`.

Data layout: `users/{uid}/projects/{id}` (name, updated, item count, thumbnail) and `users/{uid}/projectData/{id}` (the plan as JSON).

## Run it

It is plain HTML + ES modules, so any static server works:

```bash
cd venuely
python3 -m http.server 8000      # then open http://localhost:8000 (home), /app.html, /projects.html
```

It can also be hosted as-is on GitHub Pages / Netlify. Plans autosave to the browser's local storage.

### Offline single file

`Venuely-offline.html` is the whole app in one file (no server, no internet). Double-click it to open it in a browser.
Rebuild it after changing the source with `python3 tools/build-offline.py` (needs `esbuild`).

## Features

- **Templates**: garden wedding, open-air concert, garden party, conference hall, mini festival, or a blank plot.
- **Asset library (~75 presets)**: chairs, sofas (armchair / 2- / 3-seater / L-shaped, any size), tables with
  chairs, stages, runway, LED screens, speakers, DJ booth, **truss** (goalpost, straight beam, T, L, 4-tower box rig,
  tower; box or flat/ladder type) with **lights on truss** (par / moving head / spot, colours, beams),
  tents (marquee, pop-up canopy, big top, parasol, dome), food stalls & trucks, bars, kiosks, toilets, cars,
  fences / barriers, gates & arches, signposts, trees, hedges, flower beds, planters.
- **Resizable**: drag the edge handles on the canvas or type exact sizes. Every item has editable width / depth / height and colours.
- **Array modifier** on any item: grid (rows × columns, with aisles every N), circle / ring, or fan (curved rows).
  Drag a chair block's edge handles to add or remove rows and columns.
- **Zones, roads & labels**: rectangle or free-polygon zones with names, drawn roads/paths (asphalt, paver, carpet, sand …), flow arrows, text labels.
- **Views**: you work in a flat **2D plan**; a live **isometric preview** sits in the bottom-right corner. Click it to swap the two views. Rotate the isometric view in 90° steps, choose outline or soft drawing style and several ground themes.
- **Workspace**: a slim icon rail (Library, Layers, Summary, Templates, Map), a floating properties card that appears only when something is selected, and a bottom toolbar with the drawing tools.
- **Editing**: select / multi-select, move, rotate, snap, align & distribute, duplicate, copy / paste, layers panel (lock / hide), undo / redo.
- **Map background**: show a real map under the layout (2D and isometric) and plan on top of the actual site.
  Sources: **Google Maps** (your own API key with the *Maps Static API* enabled), **Esri satellite** and **OpenStreetMap** (free, no key).
  Search an address or paste `lat, lng`, then rotate / slide the map or drag it on the canvas. 1 m on the plan = 1 m on the map.
  The Google key is stored only in your browser (never in saved plans). Map images need internet access.
- **Summary tab**: bill of quantities plus total seat count.
- **Export**: PNG, print / PDF, save & open `.json` plans.

## Shortcuts

`2` / `3` view (or click the preview) · `Q` / `E` rotate view · `Space`+drag pan · scroll zoom · `R` rotate · `Ctrl+D` duplicate ·
`Ctrl+C/V` copy/paste · arrows nudge · `[` `]` order · `Del` delete · `Ctrl+Z` undo · `G` grid · `F` frame selection · `Ctrl+K` search the library.

## Code map

| File | Role |
|---|---|
| `js/assets.js` | Asset definitions (geometry as primitives + property schema) and the library presets |
| `js/painter.js` | Primitive builder (prisms, frusta, 3D polygons, text) |
| `js/render.js` | Camera (2D / isometric), shading, depth sorting, labels |
| `js/layout.js` | Array modifier (grid / circle / fan) |
| `js/scene.js` | Scene model, history, autosave |
| `js/editor.js` | Selection, handles, drawing tools, keyboard & pointer input |
| `js/ui.js` | Panels, properties form, menus, template picker |
| `js/templates.js` | Starter layouts |
| `js/maps.js`, `js/mapui.js` | Map imagery planning / loading and the Map panel |
| `js/auth.js`, `js/cloud.js`, `js/authui.js`, `js/config.js` | Sign-in (Firebase or demo), saved projects, sign-in dialog |
| `js/home.js`, `js/dashboard.js` | Home page and dashboard scripts |

To add an asset, call `def('my_asset', {...})` in `assets.js` with a `build(o, P)` function and add a preset to `PALETTE`.
