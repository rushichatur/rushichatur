// Renders small isometric previews of palette items for the asset library.

import { presetObject } from './scene.js';
import { Renderer, Camera, boxOf, boxCorners } from './render.js';
import { ASSETS } from './assets.js';

const cache = new Map();

export function thumbCanvas(presetId, size = 72, mode = 'iso', style = 'soft') {
  const key = `${presetId}|${size}|${mode}|${style}`;
  if (cache.has(key)) return cache.get(key);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(size * dpr);
  const o = presetObject(presetId);
  const a = ASSETS[o.type];
  if (a.world) {
    o.pts = a.poly ? [[-4, -3], [4, -3], [5, 2], [-1, 4], [-5, 1]] : [[-5, 2], [0, -2], [5, 2]];
  }
  const scene = { meta: { ground: 'grass', venue: { w: 1, d: 1 } }, objects: [o] };
  const cam = new Camera(); cam.mode = mode;
  const b = boxOf(o);
  const pts = [...boxCorners(b, 0), ...boxCorners(b, Math.max(b.h, 0.1))];
  cam.fit(pts, size, size, size * 0.1);
  const r = new Renderer(cv);
  r.draw(scene, cam, { style, bg: false, venue: false, tags: false, dpr });
  cache.set(key, cv);
  return cv;
}
