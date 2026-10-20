# 2D Side-Scrolling Portfolio

A Mario-style portfolio: the character walks left ↔ right as you scroll (or press **W / S**, arrows, A / D; **Space** jumps; swipe or on-screen buttons on phones).

## The world, left to right
| Zone | What happens |
|---|---|
| Hello | Name, roles, intro |
| Skills | "?" blocks — the character jumps and bumps them to reveal each skill |
| Parkour | Crates, pipes and logs to jump over (auto-jumps while scrolling) |
| 3D Work | Billboards with your 3D projects |
| Process | The character dives into a lake and swims past your design-process bubbles |
| UI/UX | Phone mock-ups of your case studies |
| Designs | Posters hanging on a rope |
| Journey | The character hops in a jeep and drives over hills (Hill Climb style) past your experience signs |
| Premium | Suits up in a red-gold jet suit and flies over a city, through rings, past premium projects |
| Contact | Night scene, contact card, flag pole and castle at the end |

Clicking a card opens a popup with details and a link. **List view** (bottom right) shows everything as a normal page for recruiters in a hurry.

## Edit your content
Everything lives in **`js/data.js`** — name, links, skills, projects, experience. Add or remove items and the world resizes itself.
To use real images, put them in an `assets/` folder and set `image: 'assets/my-render.jpg'` on any project.

## Run locally
Open `index.html` directly, or serve the folder: `python3 -m http.server` → http://localhost:8000

## Publish free on GitHub Pages
Repo **Settings → Pages → Source: Deploy from a branch** → pick the branch and `/ (root)`.
