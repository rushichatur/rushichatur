import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Model exported from winkmonkey.blend (mesh + armature only)
const MODEL_URL = window.MONKEY_URL || 'winkmonkey.glb';

// ---------- Renderer, scene, camera ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
const LOOK_AT = new THREE.Vector3(0, 1.7, 0);

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.7));

const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(3, 7, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -4, right: 4, top: 5, bottom: -3 });
key.shadow.radius = 6;
key.shadow.bias = -0.0005;
scene.add(key);

// Rim lights so the black fur stands out on the dark background
const rim = new THREE.DirectionalLight(0xffffff, 2.5);
rim.position.set(-4, 5, -6);
scene.add(rim);
const rim2 = new THREE.DirectionalLight(0xffffff, 1.5);
rim2.position.set(5, 3, -5);
scene.add(rim2);

// Ground that only shows the shadow
const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.22 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------- Load the monkey ----------
const MONKEY_HEIGHT = 3.6;
let headBone = null, spineBone = null;
let headRestWorld = null, spineRestWorld = null;

function onModel(gltf) {
  const model = gltf.scene;

  // The model faces -Z after export; turn it to face the camera (+Z)
  model.rotation.y = Math.PI;

  // Scale to a fixed height and stand it on the ground
  // (pose the skeleton first so skinned bounds are measured correctly)
  model.updateMatrixWorld(true);
  model.traverse(o => { if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); } });
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  model.scale.setScalar(MONKEY_HEIGHT / size.y);
  model.updateMatrixWorld(true);
  model.traverse(o => { if (o.isSkinnedMesh) o.computeBoundingBox(); });
  box.setFromObject(model);
  const centre = box.getCenter(new THREE.Vector3());
  model.position.x -= centre.x;
  model.position.z -= centre.z - 0.4; // keep the body centred; tail goes backwards
  model.position.y -= box.min.y;

  model.traverse(o => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // skinned meshes can be culled wrongly when bones move
    }
  });

  scene.add(model);
  model.updateMatrixWorld(true);

  headBone = model.getObjectByName('head');
  spineBone = model.getObjectByName('spine_3');
  if (headBone) headRestWorld = headBone.getWorldQuaternion(new THREE.Quaternion());
  if (spineBone) spineRestWorld = spineBone.getWorldQuaternion(new THREE.Quaternion());

  document.body.classList.add('loaded');
}

function onModelError(err) {
  console.error('Could not load the monkey model', err);
  document.getElementById('status').textContent = 'Could not load the monkey model.';
}

const loader = new GLTFLoader();
if (window.MONKEY_B64) {
  // Model embedded in the page as base64 (used by the single-file preview)
  const bytes = Uint8Array.from(atob(window.MONKEY_B64), c => c.charCodeAt(0));
  loader.parse(bytes.buffer, '', onModel, onModelError);
} else {
  loader.load(MODEL_URL, onModel, undefined, onModelError);
}

// ---------- Banana cursor ----------
const banana = document.getElementById('banana');
const pointer = new THREE.Vector2(0, 0);
let lastMove = -Infinity;

function onMove(x, y) {
  banana.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  pointer.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  lastMove = performance.now();
}
window.addEventListener('pointermove', e => onMove(e.clientX, e.clientY));
window.addEventListener('pointerdown', e => onMove(e.clientX, e.clientY));

// ---------- Head follow ----------
const raycaster = new THREE.Raycaster();
const lookPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -2.5); // a plane in front of the monkey
const target = new THREE.Vector3();
const headPos = new THREE.Vector3();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const qTurn = new THREE.Quaternion();
const qParent = new THREE.Quaternion();
let yaw = 0, pitch = 0;

// Rotate a bone so its world rotation = turn * restWorld, whatever its parents are doing
function aimBone(bone, restWorld, yawAmt, pitchAmt) {
  euler.set(-pitchAmt, yawAmt, 0);
  qTurn.setFromEuler(euler);
  bone.parent.getWorldQuaternion(qParent);
  bone.quaternion.copy(qParent.invert().multiply(qTurn.multiply(restWorld)));
  bone.updateMatrixWorld(true);
}

function updateLook(dt) {
  if (!headBone) return;
  let tYaw = 0, tPitch = 0;
  if (performance.now() - lastMove < 3000) {
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(lookPlane, target)) {
      headBone.getWorldPosition(headPos);
      headPos.y += 0.5; // roughly eye height above the neck joint
      const d = target.sub(headPos);
      tYaw = Math.atan2(d.x, d.z);
      tPitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    }
  }
  tYaw = THREE.MathUtils.clamp(tYaw, -0.8, 0.8);
  tPitch = THREE.MathUtils.clamp(tPitch, -0.5, 0.55);

  const k = 1 - Math.exp(-dt * 6); // smooth follow
  yaw += (tYaw - yaw) * k;
  pitch += (tPitch - pitch) * k;

  if (spineBone) aimBone(spineBone, spineRestWorld, yaw * 0.25, pitch * 0.1);
  aimBone(headBone, headRestWorld, yaw * 0.8, pitch);
}

// ---------- Layout ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const dist = w / h < 0.8 ? 14 : 10; // pull back on narrow screens
  camera.position.set(0, 2.3, dist);
  camera.lookAt(LOOK_AT);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
onMove(window.innerWidth / 2, window.innerHeight * 0.3);
lastMove = -Infinity;

// ---------- Loop ----------
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  updateLook(dt);
  renderer.render(scene, camera);
});

// Handy for testing in the console
window.__monkey = { setLook: (x, y) => onMove(x, y) };
