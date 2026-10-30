# Wink Monkey

A rigged 3D monkey (from `winkmonkey.blend`) shown with Three.js. Its head bone turns to follow a banana cursor.

## Run it
Open it through any local web server (opening the file directly won't load the 3D modules):

```bash
cd monkey && python3 -m http.server 8000
```
Then visit http://localhost:8000

## Files
- `index.html` – page and banana cursor
- `style.css` – split dark/light background
- `monkey.js` – loads `winkmonkey.glb` and turns the `head` bone (and a little of `spine_3`) toward the banana
- `winkmonkey.glb` – the monkey and its skeleton, exported from the Blender file

To update the model: re-export from Blender with File → Export → glTF 2.0 (.glb), selecting only the monkey mesh and its armature, and save over `winkmonkey.glb`.
