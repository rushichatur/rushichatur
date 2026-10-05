# Venuely – event layout studio

A zero-build web app for planning event layouts (weddings, concerts, conferences, festivals, parties) in
**flat 2D plan view** or **isometric view**. Everything is modelled once and drawn in both views.

## Run it

It is plain HTML + ES modules, so any static server works:

```bash
cd venuely
python3 -m http.server 8000      # then open http://localhost:8000
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
- **Views**: 2D plan ↔ isometric, rotate the isometric view in 90° steps, outline or soft drawing style, several ground themes.
- **Editing**: select / multi-select, move, rotate, snap, align & distribute, duplicate, copy / paste, layers panel (lock / hide), undo / redo.
- **Summary tab**: bill of quantities plus total seat count.
- **Export**: PNG, print / PDF, save & open `.json` plans.

## Shortcuts

`2` / `3` view · `Q` / `E` rotate view · `Space`+drag pan · scroll zoom · `R` rotate · `Ctrl+D` duplicate ·
`Ctrl+C/V` copy/paste · arrows nudge · `[` `]` order · `Del` delete · `Ctrl+Z` undo · `G` grid · `F` frame selection.

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

To add an asset, call `def('my_asset', {...})` in `assets.js` with a `build(o, P)` function and add a preset to `PALETTE`.
