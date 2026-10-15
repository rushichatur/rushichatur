import { Scene } from './scene.js';
import { Editor } from './editor.js';
import { UI } from './ui.js';
import { auth } from './auth.js';
import { cloud } from './cloud.js';
import { openAuthDialog } from './authui.js';

const scene = new Scene();
const editor = new Editor(document.getElementById('cv'), scene);
const ui = new UI(editor, scene);
window.venuely = { scene, editor, ui, auth, cloud }; // handy for debugging in the console

const params = new URLSearchParams(location.search);
const tpl = params.get('template');
const pid = params.get('p');

async function loadProject() {
  try {
    const p = await cloud.get(pid);
    if (!p) { ui.loadingProject = false; ui.toast('That project was not found'); history.replaceState(null, '', location.pathname); ui.openModal(); return; }
    ui.openProject(p);
  } catch (e) { ui.loadingProject = false; ui.toast(e.message || 'Could not open the project'); }
}

if (pid) {
  ui.loadingProject = true;
  ui.toast('Opening your project…');
  auth.init().then(() => {
    if (auth.user) loadProject();
    else openAuthDialog({ reason: 'Sign in to open your saved project.', onSuccess: loadProject, onCancel: () => { ui.loadingProject = false; ui.openModal(); } });
  });
} else if (tpl) {
  ui.applyTemplate(tpl, { silent: true });
} else if (params.get('new')) {
  ui.openModal();
} else if (scene.restoreSaved()) {
  if (scene.meta.projectId) ui.project = { id: scene.meta.projectId };
  editor.fitView();
  ui.syncView(); ui.syncHistory();
} else {
  ui.openModal();
}

if (params.get('mode') === 'iso') editor.setMode('iso');
if (params.get('yaw')) { editor.cam.yaw = +params.get('yaw'); editor.fitView(); }
if (params.get('style')) { scene.meta.style = params.get('style'); ui.syncView(); }
editor.invalidate();
