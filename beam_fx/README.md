# Beam FX for Blender

Animated **Reveal**, **Scan** and **Hologram** effects for any object, with one click.
Works in Cycles and EEVEE, Blender 4.2 and newer (tested on 5.2).

| Effect | What it does |
| --- | --- |
| **Reveal** | The object builds up along an axis: a glowing wireframe leads, the real material follows behind a bright build line. |
| **Scan** | A glowing band with scan lines sweeps across the object. Optional *Reveal Object* makes the object exist only where the band has passed. |
| **Hologram** | Turns the object into a flickering, rim-lit hologram with scrolling scan lines that materializes along an axis. |

## Install

1. Download `dist/beam_fx-<version>.zip` (or run `python3 build.py` to make it).
2. Blender → *Edit ▸ Preferences ▸ Get Extensions* → ▾ menu (top right) → **Install from Disk…** → pick the zip.
3. Open the 3D Viewport sidebar (**N**) → **FX** tab → **Beam FX**.

## Use

1. Select one or more objects (mesh, curve, text, surface, metaball).
2. Pick an effect, frames, direction (*Beam In* / *Beam Out*), easing and axis.
3. Click **Apply to Selected**. Scrub the timeline.
   - With several objects selected, open the *Adjust Last Operation* panel and set **Stagger** to delay each object in turn.
4. Tweak colors and sizes under **Look**; changes update live.
5. Optional: **Glow ▸ Add Glow** adds a compositor bloom so the emission glows.
6. **✕** removes the effect and restores the original material.

## How it works

- A node group (`BFX_Reveal_v1`, `BFX_Scan_v1`, `BFX_Hologram_v1`) is inserted between each material's
  surface shader and its output. Your original shader stays untouched and is reconnected on removal.
- Each object gets custom properties: `bfx_progress` (keyframed 0 → 1), `bfx_min`/`bfx_max` (object bounds
  along the axis) and, for Hologram, `bfx_time` (driven by `frame / fps`, no Python auto-run needed).
  Shaders read these per object, so objects sharing a material still animate independently.
- Objects without materials get a plain `BFX Base` material.
- After changing an object's shape or modifiers, click **Refit to Object**.

## Notes

- Materials shared between objects use the effect and look of the last object applied.
- *Wire Style ▸ Mesh Edges* uses Blender's Wireframe shader node; if it doesn't show in your EEVEE version, switch to **Grid**.
- EEVEE materials are switched to *Dithered* render mode so transparency works.
