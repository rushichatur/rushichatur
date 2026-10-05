import { Scene } from './scene.js';
import { Editor } from './editor.js';
import { UI } from './ui.js';

const scene = new Scene();
const editor = new Editor(document.getElementById('cv'), scene);
const ui = new UI(editor, scene);
window.venuely = { scene, editor, ui }; // handy for debugging in the console

const params = new URLSearchParams(location.search);
const tpl = params.get('template');

if (tpl) {
  ui.applyTemplate(tpl, { silent: true });
} else if (scene.restoreSaved()) {
  editor.fitView();
  ui.syncView(); ui.syncHistory();
} else {
  ui.openModal();
}

if (params.get('mode') === '2d') editor.setMode('2d');
if (params.get('yaw')) { editor.cam.yaw = +params.get('yaw'); editor.fitView(); }
if (params.get('style')) { scene.meta.style = params.get('style'); ui.syncView(); }
editor.invalidate();
