// Home page: renders the live plans with the same engine the app uses.

import { Scene } from './scene.js';
import { Renderer, Camera } from './render.js';
import { TEMPLATES } from './templates.js';
import { mountAccount } from './authui.js';
import { icon } from './icons.js';

document.querySelectorAll('[data-i]').forEach((el) => { el.innerHTML = icon(el.dataset.i); });
mountAccount(document.getElementById('acct'));

const nav = document.getElementById('nav');
const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
onScroll(); window.addEventListener('scroll', onScroll, { passive: true });

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const renderers = new WeakMap();
const sceneCache = new Map();

function sceneOf(id) {
  if (!sceneCache.has(id)) { const s = new Scene(); TEMPLATES.find((t) => t.id === id).build(s); sceneCache.set(id, s); }
  return sceneCache.get(id);
}

/** Draw a scene into a canvas, fitted to the venue. Yaw sways around the venue centre. */
function paint(cv, scene, { mode = 'iso', yaw = 0, margin = 14, fitYaw = yaw, tags = false } = {}) {
  const r = cv.getBoundingClientRect();
  if (r.width < 10) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  let rd = renderers.get(cv); if (!rd) { rd = new Renderer(cv); renderers.set(cv, rd); }
  const v = scene.meta.venue, cam = new Camera();
  cam.mode = mode;
  cam.yaw = fitYaw;
  cam.fit([[0, 0, 0], [v.w, 0, 0], [v.w, v.d, 0], [0, v.d, 0], [0, 0, 9], [v.w, v.d, 9]], r.width, r.height, margin);
  if (yaw !== fitYaw) {
    cam.yaw = yaw;
    const [sx, sy] = cam.project(v.w / 2, v.d / 2, 0);
    const [tx, ty] = (() => { const c = Object.assign(new Camera(), cam); c.yaw = fitYaw; return c.project(v.w / 2, v.d / 2, 0); })();
    cam.px += tx - sx; cam.py += ty - sy;
  }
  rd.draw(scene, cam, { style: 'soft', grid: false, tags, dpr, attrib: false, bg: false });
}

// ---- hero: concert plan with a slow sway --------------------------------------------
const heroCv = document.getElementById('heroCv');
const heroScene = sceneOf('concert');
let heroVisible = true, heroT = 0, last = 0;
function heroFrame(ts) {
  requestAnimationFrame(heroFrame);
  if (!heroVisible || ts - last < 40) return;
  last = ts;
  heroT = ts / 1000;
  paint(heroCv, heroScene, { mode: 'iso', yaw: reduced ? 0 : 9 * Math.sin(heroT / 2.6), fitYaw: 0, margin: 34 });
}
new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; }).observe(heroCv);
requestAnimationFrame(heroFrame);

// ---- two views mock -----------------------------------------------------------------
const mockMain = document.getElementById('mockMain'), mockMini = document.getElementById('mockMini');
const wedding = sceneOf('wedding');
const paintMock = () => { paint(mockMain, wedding, { mode: '2d', margin: 26, tags: true }); paint(mockMini, wedding, { mode: 'iso', margin: 8 }); };

// ---- template gallery ---------------------------------------------------------------
const list = document.getElementById('tplList');
const cards = TEMPLATES.map((t) => {
  const a = document.createElement('a');
  a.className = 'tpl-card'; a.href = `app.html?template=${t.id}`;
  a.innerHTML = `<canvas aria-hidden="true"></canvas><div class="meta"><b>${t.name}</b><span>${t.desc}</span><em>Use this template →</em></div>`;
  list.append(a);
  return { t, cv: a.querySelector('canvas') };
});
const paintCards = () => { for (const c of cards) if (c.shown) paint(c.cv, sceneOf(c.t.id), { mode: 'iso', margin: 12 }); };
const io = new IntersectionObserver((es) => {
  for (const e of es) if (e.isIntersecting) { const c = cards.find((x) => x.cv === e.target); if (c && !c.shown) { c.shown = true; paint(c.cv, sceneOf(c.t.id), { mode: 'iso', margin: 12 }); } }
}, { rootMargin: '200px' });
cards.forEach((c) => io.observe(c.cv));

let rt;
window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { paintMock(); paintCards(); }, 120); });
new IntersectionObserver(([e]) => { if (e.isIntersecting) paintMock(); }, { rootMargin: '200px' }).observe(mockMain);
