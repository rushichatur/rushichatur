# Zen Monkey

A 3D monkey built entirely in code with Three.js. Its head follows a banana cursor.

## Run it
Open it through any local web server (opening the file directly won't load the 3D modules):

```bash
cd monkey && python3 -m http.server 8000
```
Then visit http://localhost:8000

## Files
- `index.html` – page and banana cursor
- `style.css` – split dark/light background
- `monkey.js` – builds the monkey (head, face, headphones, body, arms, crossed legs, tail) and handles head-follow

The **Download 3D model (.glb)** button exports the monkey so you can open it in Blender, Spline, etc.
