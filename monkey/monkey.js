import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

// ---------- Renderer, scene, camera ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
const LOOK_AT = new THREE.Vector3(0, 1.6, 0);

// ---------- Lights ----------
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.6));

const key = new THREE.DirectionalLight(0xffffff, 2.2);
key.position.set(3, 7, 6);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -4; key.shadow.camera.right = 4;
key.shadow.camera.top = 5; key.shadow.camera.bottom = -3;
key.shadow.radius = 6;
key.shadow.bias = -0.0005;
scene.add(key);

// Rim light from behind so the black monkey stands out on the dark background
const rim = new THREE.DirectionalLight(0xffffff, 2.5);
rim.position.set(-4, 5, -6);
scene.add(rim);
const rim2 = new THREE.DirectionalLight(0xffffff, 1.5);
rim2.position.set(5, 3, -5);
scene.add(rim2);

// Ground that only shows the shadow
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(30, 30),
  new THREE.ShadowMaterial({ opacity: 0.22 })
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------- Materials ----------
const black = new THREE.MeshPhysicalMaterial({
  color: 0x161616, roughness: 0.62, clearcoat: 0.12, clearcoatRoughness: 0.7,
});
const cream = new THREE.MeshPhysicalMaterial({
  color: 0xf0e8d6, roughness: 0.7, clearcoat: 0.05,
});
const ink = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.6 });
const phones = new THREE.MeshPhysicalMaterial({
  color: 0x1e1e1e, roughness: 0.3, metalness: 0.25, clearcoat: 0.6,
});

// ---------- Helpers ----------
function mesh(geo, mat, { pos, rot, scale } = {}) {
  const m = new THREE.Mesh(geo, mat);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function sphere(r, mat, opts) {
  return mesh(new THREE.SphereGeometry(r, 32, 24), mat, opts);
}

// A tube through the given points whose radius goes from r0 to r1 (rounded ends)
function taperedTube(points, r0, r1, mat) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const tubular = 64, radial = 20;
  const geo = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.floor(i / (radial + 1)) / tubular;
    const c = curve.getPointAt(t);
    const r = THREE.MathUtils.lerp(r0, r1, t);
    v.fromBufferAttribute(pos, i).sub(c).multiplyScalar(r).add(c);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const g = new THREE.Group();
  g.add(mesh(geo, mat));
  g.add(sphere(r0, mat, { pos: points[0] }));
  g.add(sphere(r1, mat, { pos: points[points.length - 1] }));
  return g;
}

// ---------- Build the monkey ----------
const monkey = new THREE.Group();
monkey.name = 'ZenMonkey';
scene.add(monkey);

// Torso (lathe = a profile spun around the vertical axis)
const torsoProfile = [
  [0.0, 0.40], [0.52, 0.42], [0.64, 0.70], [0.63, 1.20],
  [0.62, 1.58], [0.50, 1.86], [0.24, 2.02], [0.0, 2.05],
].map(([r, y]) => new THREE.Vector2(r, y));
const torso = mesh(new THREE.LatheGeometry(torsoProfile, 48), black, { scale: [1, 1, 0.8] });
torso.name = 'Torso';
const torsoPivot = new THREE.Group();
torsoPivot.add(torso);
monkey.add(torsoPivot);

// Neck
torsoPivot.add(mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.3, 24), black, { pos: [0, 1.98, 0] }));

// Arms
for (const s of [-1, 1]) {
  const arm = taperedTube(
    [[0.56 * s, 1.68, 0], [0.8 * s, 1.35, 0.03], [0.93 * s, 1.0, 0.16], [1.0 * s, 0.76, 0.42]],
    0.17, 0.12, black
  );
  arm.name = s < 0 ? 'ArmLeft' : 'ArmRight';
  torsoPivot.add(arm);

  // Hand resting palm-up on the knee, thumb and index finger touching (mudra)
  const hand = new THREE.Group();
  hand.name = s < 0 ? 'HandLeft' : 'HandRight';
  hand.position.set(1.02 * s, 0.72, 0.5);
  hand.rotation.y = -0.35 * s;
  hand.scale.setScalar(1.35);
  hand.add(sphere(0.16, cream, { scale: [1.05, 0.55, 1.05] }));
  hand.add(mesh(new THREE.TorusGeometry(0.065, 0.032, 12, 24), cream,
    { pos: [-0.02 * s, 0.1, 0.1], rot: [0.2, 0, 0] }));
  for (let f = 0; f < 3; f++) {
    hand.add(mesh(new THREE.CapsuleGeometry(0.04, 0.1, 6, 12), cream, {
      pos: [(0.06 + f * 0.05) * s, 0.06, 0.13 - f * 0.02],
      rot: [Math.PI / 2 - 0.5, 0, -0.25 * s],
    }));
  }
  torsoPivot.add(hand);
}

// Crossed legs
const legL = taperedTube([[-0.3, 0.45, 0.0], [-0.92, 0.32, 0.32], [-0.4, 0.3, 0.8], [0.2, 0.32, 0.86]], 0.28, 0.17, black);
const legR = taperedTube([[0.3, 0.45, 0.0], [0.92, 0.32, 0.32], [0.4, 0.4, 0.72], [-0.2, 0.42, 0.78]], 0.28, 0.17, black);
legL.name = 'LegLeft'; legR.name = 'LegRight';
monkey.add(legL, legR);

// Feet: cream soles facing forward, toes on top
for (const s of [-1, 1]) {
  const foot = new THREE.Group();
  foot.name = s < 0 ? 'FootLeft' : 'FootRight';
  foot.position.set(0.19 * s, 0.5, 0.98);
  foot.rotation.set(-0.25, 0.18 * s, 0.12 * s);
  foot.add(sphere(0.2, black, { scale: [0.85, 1.15, 0.6] }));
  foot.add(sphere(0.18, cream, { pos: [0, 0.0, 0.07], scale: [0.85, 1.12, 0.45] }));
  for (let t = 0; t < 4; t++) {
    foot.add(sphere(0.045, cream, { pos: [(-0.09 + t * 0.06), 0.22 - Math.abs(t - 1.5) * 0.015, 0.06] }));
  }
  monkey.add(foot);
}

// Tail curling on the floor
const tail = taperedTube(
  [[0.35, 0.4, -0.45], [0.95, 0.12, -0.6], [1.6, 0.08, -0.2], [1.75, 0.08, 0.35], [1.4, 0.08, 0.72], [1.0, 0.08, 0.6]],
  0.08, 0.06, black
);
tail.name = 'Tail';
monkey.add(tail);

// ---------- Head (pivots at the neck so it can turn) ----------
const headPivot = new THREE.Group();
headPivot.name = 'HeadPivot';
headPivot.position.set(0, 2.02, 0);
torsoPivot.add(headPivot);

const head = new THREE.Group();
head.name = 'Head';
head.position.set(0, 0.7, 0);
head.scale.setScalar(1.1);
headPivot.add(head);

head.add(mesh(new RoundedBoxGeometry(1.5, 1.3, 1.12, 6, 0.32), black));

// Cream face mask: two eye patches + muzzle, slightly bulging
const FZ = 0.47;  // depth of the mask centres
const FD = 0.14;  // how far the mask bulges
head.add(sphere(0.33, cream, { pos: [-0.27, 0.1, FZ], scale: [1, 1, FD / 0.33] }));
head.add(sphere(0.33, cream, { pos: [0.27, 0.1, FZ], scale: [1, 1, FD / 0.33] }));
head.add(sphere(1, cream, { pos: [0, -0.22, FZ], scale: [0.6, 0.42, FD] }));

// Closed eyes (smile-shaped arcs) and brows
for (const s of [-1, 1]) {
  head.add(mesh(new THREE.TorusGeometry(0.11, 0.02, 8, 32, Math.PI), ink,
    { pos: [0.27 * s, 0.13, 0.615], rot: [0, 0, Math.PI] }));
  head.add(mesh(new THREE.TorusGeometry(0.09, 0.016, 8, 32, Math.PI * 0.8), ink,
    { pos: [0.27 * s, 0.28, 0.6], rot: [-0.3, 0, Math.PI * 0.1] }));
  // nostrils
  head.add(sphere(0.022, ink, { pos: [0.055 * s, -0.12, 0.605] }));
}
// Little "o" mouth
head.add(sphere(1, ink, { pos: [0, -0.34, 0.6], scale: [0.065, 0.085, 0.04] }));

// Headphones
head.add(mesh(new THREE.TorusGeometry(0.9, 0.055, 16, 64, Math.PI), phones, { pos: [0, -0.05, 0] }));
for (const s of [-1, 1]) {
  head.add(mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.2, 40), phones,
    { pos: [0.83 * s, -0.05, 0], rot: [0, 0, Math.PI / 2] }));
  head.add(mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.12, 40), phones,
    { pos: [0.95 * s, -0.05, 0], rot: [0, 0, Math.PI / 2] }));
  head.add(mesh(new THREE.TorusGeometry(0.255, 0.022, 12, 48), cream,
    { pos: [0.94 * s, -0.05, 0], rot: [0, Math.PI / 2, 0] }));
}

// ---------- Banana cursor + head follow ----------
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

const raycaster = new THREE.Raycaster();
const lookPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -2.5); // plane in front of the monkey
const target = new THREE.Vector3();
const headWorld = new THREE.Vector3();
let yaw = 0, pitch = 0;

function updateLook(dt) {
  let tYaw = 0, tPitch = 0;
  const idle = performance.now() - lastMove > 3000;
  if (!idle) {
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(lookPlane, target)) {
      head.getWorldPosition(headWorld);
      const d = target.clone().sub(headWorld);
      tYaw = Math.atan2(d.x, d.z);
      tPitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    }
  }
  tYaw = THREE.MathUtils.clamp(tYaw, -0.95, 0.95);
  tPitch = THREE.MathUtils.clamp(tPitch, -0.45, 0.55);

  const k = 1 - Math.exp(-dt * 6); // smooth follow
  yaw += (tYaw - yaw) * k;
  pitch += (tPitch - pitch) * k;

  headPivot.rotation.set(-pitch, yaw * 0.8, -yaw * 0.08);
  torsoPivot.rotation.y = yaw * 0.15;
}

// ---------- Layout ----------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // Pull the camera back on narrow screens so the whole monkey fits
  const dist = w / h < 0.8 ? 13.5 : 9.5;
  camera.position.set(0, 2.2, dist);
  camera.lookAt(LOOK_AT);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
onMove(window.innerWidth / 2, window.innerHeight * 0.3);
lastMove = -Infinity;

// ---------- Loop ----------
const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  // gentle breathing
  torso.scale.set(1 + Math.sin(t * 1.6) * 0.008, 1 + Math.sin(t * 1.6) * 0.012, 0.8);
  head.position.y = 0.7 + Math.sin(t * 1.6) * 0.012;
  updateLook(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// ---------- Export as .glb (open it in Blender, Spline, etc.) ----------
document.getElementById('export').addEventListener('click', () => {
  new GLTFExporter().parse(
    monkey,
    glb => {
      const url = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: 'zen-monkey.glb' });
      a.click();
      URL.revokeObjectURL(url);
    },
    err => console.error(err),
    { binary: true }
  );
});

// Handy for testing in the console
window.__monkey = { setLook: (x, y) => onMove(x, y) };
