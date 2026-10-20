/* Side-scrolling portfolio world.
   Canvas draws the scenery and the character; content cards are HTML
   placed in a "world" layer that moves with the camera. */
(() => {
  'use strict';
  const D = window.PORTFOLIO;
  const $ = (s) => document.querySelector(s);
  const canvas = $('#scene');
  const ctx = canvas.getContext('2d');
  const worldEl = $('#world');

  // ---------- helpers ----------
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function rng(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
  }
  const cache = new Map();
  function rgbOf(h) {
    let c = cache.get(h);
    if (!c) {
      const n = parseInt(h.slice(1), 16);
      c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      cache.set(h, c);
    }
    return c;
  }
  function mix(a, b, t) {
    const A = rgbOf(a), B = rgbOf(b);
    return `rgb(${(A[0] + (B[0] - A[0]) * t) | 0},${(A[1] + (B[1] - A[1]) * t) | 0},${(A[2] + (B[2] - A[2]) * t) | 0})`;
  }
  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function rr(x, y, w, h, r, fill) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  }
  function circle(x, y, r, fill) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
  }
  function line(x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // ---------- world layout ----------
  const zones = [];
  let X = 0;
  function addZone(id, label, icon, width) {
    const z = { id, label, icon, x0: X, x1: X + width };
    z.cx = X + width / 2;
    zones.push(z);
    X += width;
    return z;
  }
  const zIntro = addZone('intro', 'Hello', '👋', 1500);
  const zSkills = addZone('skills', 'Skills', '🧠', 760 + D.skills.length * 230);
  const zJump = addZone('jump', 'Parkour', '🦘', 1900);
  const z3d = addZone('3d', '3D Work', '🧊', 700 + D.projects3d.length * 560);
  const zWater = addZone('water', 'Process', '🌊', 2300);
  const zUi = addZone('uiux', 'UI/UX', '📱', 700 + D.uiux.length * 520);
  const zDesign = addZone('designs', 'Designs', '🎨', 760 + D.designs.length * 330);
  const zDrive = addZone('drive', 'Journey', '🚙', Math.max(4400, 1800 + D.experience.length * 800));
  const zFly = addZone('premium', 'Premium', '🚀', 1700 + D.premium.length * 950);
  const zContact = addZone('contact', 'Contact', '✉️', 1900);
  const WORLD_END = X;

  const LAKE_A = zWater.x0 + 250, LAKE_B = zWater.x1 - 250, LAKE_DEPTH = 300, WATER_Y = 34;
  const CAR_A = zDrive.x0 + 260, CAR_B = zDrive.x1 - 320;
  const HILL_A = CAR_A + 350, HILL_B = CAR_B - 450;
  const FLY_A = zFly.x0 + 300, FLY_B = zFly.x1 - 260;
  const FLAG_X = WORLD_END - 430, CASTLE_X = WORLD_END - 170;
  const GRAV = 0.62, JUMP_V = -13.6;
  const SPEED = { walk: 7, swim: 5, drive: 13, fly: 15 };

  function terrain(x) {
    if (x > LAKE_A && x < LAKE_B) {
      const t = (x - LAKE_A) / (LAKE_B - LAKE_A);
      return LAKE_DEPTH * smooth(0, 0.16, t) * smooth(1, 0.84, t);
    }
    if (x > HILL_A && x < HILL_B) {
      const env = smooth(HILL_A, HILL_A + 600, x) * smooth(HILL_B, HILL_B - 600, x);
      const u = x - HILL_A;
      return -env * (120 + 85 * Math.sin(u * 0.0022 - 1.5) + 42 * Math.sin(u * 0.0058 + 0.7) + 16 * Math.sin(u * 0.0125 + 2));
    }
    return 0;
  }

  const obstacles = [];
  {
    const j = zJump.x0 + 420;
    [
      [0, 70, 62, 'crate'],
      [300, 84, 104, 'pipe'],
      [580, 150, 46, 'log'],
      [880, 72, 62, 'crate'],
      [952, 72, 124, 'crate2'],
      [1024, 72, 62, 'crate'],
      [1300, 84, 90, 'pipe'],
    ].forEach(([dx, w, h, kind]) => obstacles.push({ x: j + dx, w, h, kind }));
  }
  function groundAt(x) {
    let g = terrain(x);
    for (const o of obstacles) if (x >= o.x && x <= o.x + o.w) g = Math.min(g, -o.h);
    return g;
  }
  const footGround = (x) => Math.min(groundAt(x - 12), groundAt(x + 12));

  function swimY(x) {
    const t = (x - LAKE_A) / (LAKE_B - LAKE_A);
    let y = WATER_Y - 2;
    if (t > 0.3 && t < 0.7) y += 100 * Math.sin((Math.PI * (t - 0.3)) / 0.4) ** 2;
    return Math.min(y, terrain(x) - 24);
  }
  const lakeEnv = (x) => smooth(LAKE_A + 80, LAKE_A + 420, x) * smooth(LAKE_B - 80, LAKE_B - 420, x);
  const flyEnv = (x) => smooth(FLY_A, FLY_A + 650, x) * smooth(FLY_B, FLY_B - 650, x);
  const flyY = (x) => -flyEnv(x) * (340 + 110 * Math.sin((x - FLY_A) * 0.0032));
  const carAngleAt = (x) => Math.atan2(terrain(x + 40) - terrain(x - 40), 80);

  let lakeL = LAKE_A, lakeR = LAKE_B;
  while (terrain(lakeL) < WATER_Y && lakeL < LAKE_B) lakeL += 2;
  while (terrain(lakeR) < WATER_Y && lakeR > LAKE_A) lakeR -= 2;

  function modeAt(x) {
    if (x >= CAR_A && x <= CAR_B) return 'drive';
    if (x >= FLY_A && x <= FLY_B) return 'fly';
    if (terrain(x) > WATER_Y + 30) return 'swim';
    return 'walk';
  }
  const zoneAt = (x) => zones.find((z) => x < z.x1) || zones[zones.length - 1];

  // ---------- viewport ----------
  let W, H, DPR, S, VW, VH, GB;
  const cam = { x: 0, y: 0 };

  // ---------- DOM content ----------
  const placed = [];
  function place(node, x, y, base) {
    worldEl.appendChild(node);
    const p = { node, x, y, base: base || 'terrain' };
    placed.push(p);
    return p;
  }
  function layoutDOM() {
    for (const p of placed) {
      const b = p.base === 'terrain' ? terrain(p.x) : p.base === 'fly' ? flyY(p.x) : 0;
      p.node.style.left = p.x + 'px';
      p.node.style.top = GB + b + p.y + 'px';
    }
    hero.style.width = Math.min(640, VW - 70) + 'px';
    hero.classList.toggle('narrow', VW < 640);
  }
  function thumb(item) {
    if (item.image) return `<img src="${esc(item.image)}" alt="${esc(item.title)}" loading="lazy">`;
    const [a, b] = item.colors || ['#5eead4', '#3b82f6'];
    return `<div class="gen" style="--a:${esc(a)};--b:${esc(b)}"><span>${esc(item.emoji || '✨')}</span></div>`;
  }
  const tagsHtml = (t) => (t || []).slice(0, 3).map((x) => `<span>${esc(x)}</span>`).join('');
  function clickable(node, item, kind) {
    node.addEventListener('click', () => openModal(item, kind));
    node.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(item, kind); }
    });
  }

  // Hero
  const hero = el('div', 'hero anchor-bl');
  hero.innerHTML = `
    <span class="hello">👋 Hi, I'm</span>
    <h1>${esc(D.name)}</h1>
    <div class="roles">${(D.role || []).map((r, i) => `<span class="r${i % 4}">${esc(r)}</span>`).join('')}</div>
    <p>${esc(D.tagline)}</p>
    <div class="hero-cta"><button class="btn" id="startBtn">Start the walk →</button><button class="btn ghost" id="heroList">List view</button></div>`;
  place(hero, 50, -150);

  const signpost = el('div', 'signpost anchor-b', `<div class="sp-board">Skills ahead →</div><div class="sp-post"></div>`);
  place(signpost, zIntro.x1 - 260, 0);

  function zoneTitle(z, title, sub, x, y) {
    const n = el('div', 'zt anchor-b');
    n.innerHTML = `<span class="zt-icon">${z.icon}</span><h2>${esc(title)}</h2>${sub ? `<p>${esc(sub)}</p>` : ''}`;
    place(n, x, y == null ? -340 : y);
  }
  zoneTitle(zSkills, 'My Skills', 'Jump into the blocks to reveal them', zSkills.x0 + 220);
  zoneTitle(zJump, 'Parkour Zone', 'Hop over the obstacles', zJump.x0 + 200);
  zoneTitle(z3d, '3D Projects', 'Models, renders & real-time scenes', z3d.x0 + 230);
  zoneTitle(zWater, 'Dive into my Process', 'How I design, step by step', zWater.x0 + 130);
  zoneTitle(zUi, 'UI/UX Case Studies', 'Research → wireframes → prototypes', zUi.x0 + 240);
  zoneTitle(zDesign, 'Design Gallery', 'Posters, branding & visuals', zDesign.x0 + 230);
  zoneTitle(zDrive, 'The Journey', 'Hop in — let’s drive through my story', zDrive.x0 + 120);
  zoneTitle(zFly, 'Premium Projects', 'Suit up. These ones fly.', zFly.x0 + 110);
  zoneTitle(zContact, 'Say hello', null, zContact.x0 + 260);

  // Skill blocks
  const blocks = D.skills.map((s, i) => {
    const x = zSkills.x0 + 560 + i * 230;
    const n = el('div', 'qb anchor-b');
    n.innerHTML = `<div class="qb-label"><b>${esc(s.icon)} ${esc(s.name)}</b><span class="bar"><i style="width:${clamp(+s.level || 0, 0, 100)}%"></i></span></div>
      <div class="qb-box" role="button" tabindex="0" aria-label="Reveal skill: ${esc(s.name)}"><span class="q">?</span><span class="ic">${esc(s.icon)}</span></div>`;
    const b = { x, node: n, hit: false };
    n.querySelector('.qb-box').addEventListener('click', () => hitBlock(b));
    place(n, x, -190);
    return b;
  });

  // 3D billboards
  D.projects3d.forEach((p, i) => {
    const n = el('div', 'bb anchor-b');
    n.innerHTML = `<div class="bb-card" tabindex="0" role="button" aria-label="Open ${esc(p.title)}">
        <div class="bb-thumb">${thumb(p)}<em class="pill">3D</em></div>
        <div class="bb-body"><h3>${esc(p.title)}</h3><p>${esc(p.short || p.description)}</p><div class="tags">${tagsHtml(p.tags)}</div></div>
      </div><div class="bb-posts"><i></i><i></i></div>`;
    clickable(n.querySelector('.bb-card'), p, '3D Project');
    place(n, z3d.x0 + 640 + i * 560, 0);
  });

  // Process bubbles (under water)
  D.process.forEach((p, i) => {
    const n = el('div', 'bubble anchor-t');
    n.style.animationDelay = `${-i * 1.3}s`;
    n.innerHTML = `<div><span class="b-ic">${esc(p.icon)}</span><small>Step ${i + 1}</small><b>${esc(p.title)}</b><p>${esc(p.text)}</p></div>`;
    const span = (LAKE_B - LAKE_A) * 0.5;
    const x = LAKE_A + (LAKE_B - LAKE_A) * 0.25 + (D.process.length > 1 ? (span * i) / (D.process.length - 1) : span / 2);
    place(n, x, 150, 'abs');
  });

  // UI/UX phones
  D.uiux.forEach((p, i) => {
    const n = el('div', 'phone anchor-b');
    n.innerHTML = `<div class="phone-frame" tabindex="0" role="button" aria-label="Open ${esc(p.title)}">
        <div class="phone-screen"><div class="notch"></div><div class="ph-thumb">${thumb(p)}</div>
          <div class="ph-body"><h3>${esc(p.title)}</h3><p>${esc(p.short || p.description)}</p><div class="tags">${tagsHtml(p.tags)}</div></div>
        </div></div><div class="phone-stand"></div>`;
    clickable(n.querySelector('.phone-frame'), p, 'UI/UX Case Study');
    place(n, zUi.x0 + 660 + i * 520, 0);
  });

  // Design posters on a rope
  const posterXs = [];
  D.designs.forEach((p, i) => {
    const x = zDesign.x0 + 620 + i * 330;
    posterXs.push(x);
    const n = el('div', 'poster anchor-t');
    n.innerHTML = `<div class="poster-in" tabindex="0" role="button" aria-label="Open ${esc(p.title)}" style="animation-delay:${-i * 0.7}s">
        <span class="pin"></span><div class="poster-img">${thumb(p)}</div>
        <div class="poster-cap"><b>${esc(p.title)}</b><span>${esc(p.type || '')}</span></div></div>`;
    clickable(n.querySelector('.poster-in'), p, p.type || 'Design');
    place(n, x, -418);
  });
  const ROPE_A = zDesign.x0 + 430, ROPE_B = (posterXs[posterXs.length - 1] || zDesign.x0 + 600) + 190;

  // Experience road signs on the hills
  D.experience.forEach((e, i) => {
    const n = el('div', 'sign anchor-b');
    n.innerHTML = `<div class="sign-board"><span class="year">${esc(e.year)}</span><b>${esc(e.title)}</b><small>${esc(e.place)}</small><p>${esc(e.text)}</p></div><div class="sign-post"></div>`;
    const span = HILL_B - HILL_A - 500;
    const x = HILL_A + 250 + (D.experience.length > 1 ? (span * i) / (D.experience.length - 1) : span / 2);
    place(n, x, 0);
  });

  // Premium cards in the sky
  D.premium.forEach((p, i) => {
    const n = el('div', 'pc anchor-t');
    n.innerHTML = `<div class="pc-card" tabindex="0" role="button" aria-label="Open ${esc(p.title)}">
        <span class="ribbon">★ Premium</span><div class="pc-thumb">${thumb(p)}</div>
        <h3>${esc(p.title)}</h3><p>${esc(p.short || p.description)}</p><div class="tags">${tagsHtml(p.tags)}</div></div>`;
    clickable(n.querySelector('.pc-card'), p, 'Premium Project');
    place(n, FLY_A + 1000 + i * 950, 80, 'fly');
  });

  // Contact
  {
    const L = D.links || {};
    const n = el('div', 'contact anchor-b');
    n.innerHTML = `<div class="contact-card"><span class="wave">✉️</span><h2>${esc(D.contact.title)}</h2><p>${esc(D.contact.text)}</p>
      <div class="links">
        ${L.email ? `<a class="lk mail" href="${esc(L.email)}">Email</a>` : ''}
        ${L.linkedin ? `<a class="lk in" href="${esc(L.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ''}
        ${L.github ? `<a class="lk gh" href="${esc(L.github)}" target="_blank" rel="noopener">GitHub</a>` : ''}
        ${L.resume ? `<a class="lk cv" href="${esc(L.resume)}" target="_blank" rel="noopener">Résumé</a>` : ''}
      </div></div>`;
    place(n, zContact.x0 + 820, -40);
  }

  // ---------- collectibles & scenery ----------
  const coins = [];
  const coin = (x, y) => coins.push({ x, y, taken: false });
  for (let i = 0; i < 5; i++) coin(820 + i * 60, -40 - Math.sin((i / 4) * Math.PI) * 60);
  for (const o of obstacles) coin(o.x + o.w / 2, -o.h - 70);
  for (let i = 0; i < D.projects3d.length; i++) for (let k = 0; k < 3; k++) coin(z3d.x0 + 900 + i * 560 + k * 50, -60);
  for (let x = LAKE_A + 420; x < LAKE_B - 420; x += 110) coin(x, swimY(x));
  for (let i = 0; i < D.uiux.length; i++) for (let k = 0; k < 3; k++) coin(zUi.x0 + 880 + i * 520 + k * 50, -60);
  for (let x = HILL_A + 120; x < HILL_B - 120; x += 150) coin(x, terrain(x) - 60);
  const rings = [];
  for (let x = FLY_A + 760; x < FLY_B - 700; x += 420) rings.push({ x, y: flyY(x) - 50, passed: false });
  for (let x = FLY_A + 700; x < FLY_B - 700; x += 105) {
    if (rings.some((r) => Math.abs(r.x - x) < 60)) continue;
    coin(x, flyY(x) - 50);
  }

  const decor = [];
  {
    const R = rng(11);
    for (let x = 30; x < WORLD_END; x += 70 + R() * 130) {
      const z = zoneAt(x);
      const r = R();
      if (x > LAKE_A - 60 && x < LAKE_B + 60) {
        if (terrain(x) < 22) decor.push({ x, k: 'reed', s: 0.8 + R() * 0.4 });
        continue;
      }
      if (obstacles.some((o) => x > o.x - 30 && x < o.x + o.w + 30)) continue;
      if (z.id === 'premium') {
        if (x > FLY_A + 250 && x < FLY_B - 250) decor.push({ x, k: 'building', h: 110 + R() * 250, w: 70 + R() * 70, c: (R() * 3) | 0 });
        else decor.push({ x, k: 'bush', s: 0.8, c: 2 });
        continue;
      }
      if (z.id === 'contact') {
        if (x > FLAG_X - 80) continue;
        decor.push({ x, k: r < 0.35 ? 'lamp' : r < 0.75 ? 'bush' : 'flower', s: 0.8 + R() * 0.4, c: (R() * 4) | 0 });
        continue;
      }
      if (z.id === 'drive') {
        if (Math.abs(x - CAR_A) < 120 || Math.abs(x - CAR_B) < 160) continue;
        decor.push({ x, k: r < 0.35 ? 'rock' : r < 0.6 ? 'pine' : r < 0.8 ? 'bush' : 'flower', s: 0.7 + R() * 0.5, c: (R() * 4) | 0 });
        continue;
      }
      decor.push({ x, k: r < 0.3 ? 'tree' : r < 0.48 ? 'pine' : r < 0.7 ? 'bush' : r < 0.9 ? 'flower' : 'mushroom', s: 0.75 + R() * 0.5, c: (R() * 4) | 0 });
    }
  }
  const clouds = [];
  {
    const R = rng(5);
    for (let x = -200; x < WORLD_END * 0.25 + 3000; x += 260 + R() * 420) clouds.push({ x, y: 0.06 + R() * 0.3, s: 0.6 + R() * 0.8, v: 0.05 + R() * 0.15 });
  }
  const stars = [];
  {
    const R = rng(3);
    for (let i = 0; i < 170; i++) stars.push({ x: R(), y: R() * 0.75, s: 0.6 + R() * 1.6, p: R() * TAU });
  }
  const rocks = [];
  {
    const R = rng(9);
    let side = 1;
    for (let x = FLY_A + 900; x < FLY_B - 800; x += 420 + R() * 300) {
      rocks.push({ x, y: flyY(x) - 50 - side * (210 + R() * 70), r: 22 + R() * 30, rot: R() * TAU, v: (R() - 0.5) * 0.02, pts: Array.from({ length: 8 }, () => 0.75 + R() * 0.35) });
      side = -side;
    }
  }
  const fish = Array.from({ length: 7 }, (_, i) => ({ p: i * 1.7, y: 90 + (i % 4) * 45, c: ['#ff8fab', '#ffd166', '#f4a261', '#a0e7e5'][i % 4], sp: 0.25 + (i % 3) * 0.08 }));

  // ---------- player ----------
  const P = { x: 260, y: 0, vx: 0, vy: 0, dir: 1, grounded: true, mode: 'walk', phase: 0, tilt: 0, swimTilt: 0, wheel: 0, carAngle: 0, susp: 0, suspV: 0, blink: 0, flash: 0 };
  let targetX = P.x;
  let coinCount = 0;
  let traveled = 0;
  let flagY = 0, flagDone = false;
  let T = 0;

  // ---------- particles ----------
  const parts = [];
  function emit(x, y, n, o) {
    for (let i = 0; i < n; i++) {
      if (parts.length > 700) parts.shift();
      const a = o.angle != null ? o.angle + (Math.random() - 0.5) * (o.cone || TAU) : Math.random() * TAU;
      const sp = (o.speed || 2) * (0.4 + Math.random() * 0.8);
      parts.push({
        x, y,
        vx: Math.cos(a) * sp + (o.vx || 0),
        vy: Math.sin(a) * sp + (o.vy || 0),
        life: 1,
        decay: (o.decay || 0.03) * (0.7 + Math.random() * 0.6),
        size: (o.size || 4) * (0.6 + Math.random() * 0.8),
        color: o.colors[(Math.random() * o.colors.length) | 0],
        g: o.g == null ? 0.15 : o.g,
        kind: o.kind || 'dot',
        rot: Math.random() * TAU,
      });
    }
  }
  const poof = (x, y) => emit(x, y, 26, { colors: ['#ffffff', '#c7f9ff', '#fff3b0'], speed: 4, size: 9, decay: 0.035, g: -0.02, kind: 'puff' });
  const splash = (x) => emit(x, WATER_Y, 22, { colors: ['#ffffff', '#bdf3ff', '#7fe0f5'], speed: 5, angle: -Math.PI / 2, cone: 1.6, size: 4, decay: 0.025, g: 0.3 });
  const sparkle = (x, y, colors) => emit(x, y, 14, { colors: colors || ['#ffd93d', '#fff6bf', '#ffffff'], speed: 3.5, size: 3.5, decay: 0.04, g: 0.05, kind: 'star' });

  // ---------- input ----------
  const keys = { f: false, b: false };
  let touchDir = 0;
  const anyOverlay = () => !modal.hidden || !listView.hidden;
  const nudge = (d) => { targetX = clamp(targetX + d, 60, WORLD_END - 140); };
  addEventListener('wheel', (e) => {
    if (anyOverlay()) return;
    e.preventDefault();
    const k = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 600 : 1;
    const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * k;
    nudge(clamp(d, -240, 240) * 1.15);
  }, { passive: false });
  addEventListener('keydown', (e) => {
    if (anyOverlay()) { if (e.key === 'Escape') closeOverlays(); return; }
    const k = e.key.toLowerCase();
    if (['w', 'd', 'arrowright'].includes(k)) { keys.f = true; e.preventDefault(); }
    else if (['s', 'a', 'arrowleft'].includes(k)) { keys.b = true; e.preventDefault(); }
    else if (k === ' ' || k === 'arrowup') {
      if (e.target.closest && e.target.closest('[role="button"],button,a')) return;
      e.preventDefault(); jump();
    } else if (k === 'pagedown') { nudge(900); e.preventDefault(); }
    else if (k === 'pageup') { nudge(-900); e.preventDefault(); }
  });
  addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (['w', 'd', 'arrowright'].includes(k)) keys.f = false;
    if (['s', 'a', 'arrowleft'].includes(k)) keys.b = false;
  });
  addEventListener('blur', () => { keys.f = keys.b = false; touchDir = 0; });
  let tx = null, ty = null;
  addEventListener('touchstart', (e) => {
    if (anyOverlay() || e.target.closest('.touch-ctrls')) return;
    tx = e.touches[0].clientX; ty = e.touches[0].clientY;
  }, { passive: true });
  addEventListener('touchmove', (e) => {
    if (anyOverlay() || tx == null) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx = t.clientX - tx, dy = t.clientY - ty;
    tx = t.clientX; ty = t.clientY;
    nudge(-(Math.abs(dx) > Math.abs(dy) ? dx : dy) * 2.6);
  }, { passive: false });
  addEventListener('touchend', () => { tx = ty = null; });
  document.querySelectorAll('#touchCtrls [data-dir]').forEach((b) => {
    const d = +b.dataset.dir;
    const on = (e) => { e.preventDefault(); touchDir = d; };
    const off = () => { touchDir = 0; };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('pointercancel', off);
  });
  document.querySelector('#touchCtrls [data-jump]').addEventListener('pointerdown', (e) => { e.preventDefault(); jump(); });

  function jump() {
    if (P.mode === 'walk' && P.grounded) {
      P.vy = JUMP_V;
      P.grounded = false;
      emit(P.x, P.y, 8, { colors: ['#ffffff', '#e8f5e9'], speed: 2, angle: -Math.PI / 2, cone: 2.5, size: 5, decay: 0.05, g: 0, kind: 'puff' });
    }
  }

  function hitBlock(b) {
    if (b.hit) return;
    b.hit = true;
    b.node.classList.add('hit');
    sparkle(b.x, terrain(b.x) - 220, ['#5eead4', '#ffd93d', '#ffffff', '#ff8fab']);
    coinCount++;
    bumpCoins();
  }

  function teleport(x) {
    x = clamp(x, 60, WORLD_END - 140);
    P.x = targetX = x;
    P.vx = P.vy = 0;
    P.mode = modeAt(x);
    P.y = P.mode === 'walk' ? footGround(x) : P.mode === 'swim' ? swimY(x) : P.mode === 'drive' ? terrain(x) : flyY(x);
    P.grounded = true;
    P.carAngle = carAngleAt(x);
    P.tilt = 0;
    snapCam();
  }

  // ---------- update ----------
  function onModeChange(from, to) {
    P.mode = to;
    if (to === 'swim' || from === 'swim') splash(P.x);
    else poof(P.x, P.y - 50);
    if (to === 'walk') { P.vy = 0; P.grounded = false; }
    if (to === 'drive') { P.carAngle = carAngleAt(P.x); P.y = terrain(P.x); }
    if (to === 'fly' || from === 'fly') P.flash = 1;
  }

  function update(dt) {
    const held = (keys.f ? 1 : 0) - (keys.b ? 1 : 0) + touchDir;
    if (held) targetX = clamp(P.x + Math.sign(held) * 240, 60, WORLD_END - 140);
    const lead = 1400;
    targetX = clamp(targetX, P.x - lead, P.x + lead);

    const mode = modeAt(P.x);
    if (mode !== P.mode) onModeChange(P.mode, mode);
    const maxV = SPEED[mode];
    const diff = targetX - P.x;
    const desired = Math.abs(diff) < 2 ? 0 : clamp(diff * 0.07, -maxV, maxV);
    const acc = mode === 'drive' ? 0.07 : mode === 'fly' ? 0.08 : 0.2;
    P.vx += (desired - P.vx) * Math.min(1, acc * dt);
    if (Math.abs(P.vx) > 0.25) P.dir = Math.sign(P.vx);
    const x0 = P.x;

    if (mode === 'walk') {
      let nx = P.x + P.vx * dt;
      if (footGround(nx) < P.y - 8) {
        if (P.grounded && Math.abs(P.vx) > 0.3) jump();
        nx = P.x;
      }
      P.x = nx;
      P.vy += GRAV * dt;
      P.y += P.vy * dt;
      const g = footGround(P.x);
      if (P.y >= g) {
        if (!P.grounded && P.vy > 5) emit(P.x, g, 8, { colors: ['#ffffff', '#f1f5f9'], speed: 2, angle: -Math.PI / 2, cone: 3, size: 5, decay: 0.05, g: 0, kind: 'puff' });
        P.y = g; P.vy = 0; P.grounded = true;
      } else if (P.grounded && g - P.y < 16 && P.vy >= 0) {
        P.y = g; P.vy = 0;
      } else P.grounded = false;
      P.phase += Math.abs(P.vx) * 0.085 * dt;

      for (const b of blocks) {
        if (b.hit) continue;
        const ahead = (b.x - P.x) * P.dir;
        if (P.grounded && Math.abs(P.vx) > 0.6 && ahead > 18 && ahead < 54) jump();
        const bottom = terrain(b.x) - 190;
        if (Math.abs(P.x - b.x) < 42 && P.vy < 0 && P.y - 106 <= bottom) {
          P.vy = 1.5;
          P.y = bottom + 106;
          hitBlock(b);
        }
      }
    } else if (mode === 'swim') {
      P.x += P.vx * dt;
      const ty = swimY(P.x) + Math.sin(T * 3) * 2.5;
      const ny = lerp(P.y, ty, Math.min(1, 0.1 * dt));
      P.swimTilt = lerp(P.swimTilt, clamp((ny - P.y) * 0.25 * P.dir, -0.5, 0.5), 0.1);
      P.y = ny;
      P.phase += (0.05 + Math.abs(P.vx) * 0.05) * dt;
      if (Math.random() < 0.06 * dt && P.y > WATER_Y + 8) emit(P.x + P.dir * 30, P.y - 6, 1, { colors: ['#ffffff'], speed: 0.4, angle: -Math.PI / 2, cone: 0.6, size: 4, decay: 0.008, g: -0.03, kind: 'bubble' });
      if (Math.abs(P.vx) > 1.5 && Math.abs(P.y - (WATER_Y - 2)) < 6 && Math.random() < 0.25 * dt) emit(P.x - P.dir * 30, WATER_Y, 2, { colors: ['#ffffff', '#c9f6ff'], speed: 2, angle: -Math.PI / 2, cone: 1.2, size: 3, decay: 0.05, g: 0.2 });
    } else if (mode === 'drive') {
      P.x += P.vx * dt;
      P.y = terrain(P.x);
      const a = carAngleAt(P.x);
      P.suspV += ((a - P.carAngle) * 60 - P.susp * 0.25 - P.suspV * 0.2) * dt;
      P.susp = clamp(P.susp + P.suspV * dt * 0.5, -7, 7);
      P.carAngle = lerp(P.carAngle, a, Math.min(1, 0.25 * dt));
      P.wheel += (P.vx * dt) / 20;
      if (Math.abs(P.vx) > 3 && Math.random() < 0.5 * dt) {
        const c = Math.cos(P.carAngle), s = Math.sin(P.carAngle);
        const bx = P.x - P.dir * 40 * c, by = P.y - P.dir * 40 * s;
        emit(bx, by, 1, { colors: ['#f6d7a7', '#e9c18b', '#ffffff'], speed: 1.5, angle: P.dir > 0 ? Math.PI + 0.4 : -0.4, cone: 0.8, size: 6, decay: 0.03, g: -0.02, kind: 'puff' });
      }
    } else if (mode === 'fly') {
      P.x += P.vx * dt;
      const env = flyEnv(P.x);
      const ty = flyY(P.x) + Math.sin(T * 2.2) * 6 * env;
      P.y = lerp(P.y, ty, Math.min(1, 0.12 * dt));
      const want = clamp(Math.abs(P.vx) / 10, 0, 1) * 1.3 * smooth(0, 0.25, env);
      P.tilt = lerp(P.tilt, want, Math.min(1, 0.06 * dt));
      // jet flames
      const cx = P.x, cy = P.y - 50;
      const sx = Math.sin(P.tilt) * P.dir, cy2 = Math.cos(P.tilt);
      const bx = cx - sx * 52, by = cy + cy2 * 52;
      const ang = Math.atan2(cy2, -sx);
      emit(bx, by, 2, { colors: ['#ffd166', '#ff9f1c', '#fff3b0', '#ff6b6b'], speed: 3 + Math.abs(P.vx) * 0.2, angle: ang, cone: 0.5, size: 6, decay: 0.07, g: 0, kind: 'flame' });
      for (const r of rings) {
        if (!r.passed && Math.abs(P.x - r.x) < 14) { r.passed = true; sparkle(r.x, r.y, ['#5eead4', '#ffffff', '#ffd93d']); }
      }
    }
    P.flash = Math.max(0, P.flash - 0.04 * dt);
    traveled += Math.abs(P.x - x0);

    // coins
    const cy = P.mode === 'swim' ? P.y : P.y - (P.mode === 'drive' ? 45 : 50);
    for (const c of coins) {
      if (c.taken || Math.abs(c.x - P.x) > 50) continue;
      if (Math.hypot(c.x - P.x, c.y - cy) < 48) {
        c.taken = true;
        coinCount++;
        sparkle(c.x, c.y);
        bumpCoins();
      }
    }
    // flag
    if (!flagDone && P.x > FLAG_X - 20) {
      flagDone = true;
      for (let i = 0; i < 5; i++) emit(FLAG_X + (Math.random() - 0.5) * 300, -320, 30, { colors: ['#ff6b6b', '#ffd93d', '#5eead4', '#a78bfa', '#4d96ff'], speed: 4, size: 6, decay: 0.008, g: 0.08, kind: 'confetti' });
      showToast('🎉 Thanks for visiting!');
    }
    flagY = lerp(flagY, flagDone ? 1 : 0, 0.03 * dt);

    // particles
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.rot += 0.1 * dt;
      p.life -= p.decay * dt;
      if (p.kind === 'bubble' && p.y < WATER_Y) p.life = 0;
      if (p.life <= 0) parts.splice(i, 1);
    }
    for (const r of rocks) r.rot += r.v * dt;

    // camera
    const lookAhead = P.mode === 'drive' || P.mode === 'fly' ? 0.32 : 0.38;
    const tcx = clamp(P.x - VW * lookAhead, 0, Math.max(0, WORLD_END - VW));
    const focus = P.mode === 'swim' ? P.y : P.y - 50;
    const tcy = Math.min(GB + focus - VH * 0.45, 280 * lakeEnv(P.x));
    cam.x = lerp(cam.x, tcx, Math.min(1, 0.1 * dt));
    cam.y = lerp(cam.y, tcy, Math.min(1, 0.07 * dt));
  }
  function snapCam() {
    const lookAhead = P.mode === 'drive' || P.mode === 'fly' ? 0.32 : 0.38;
    cam.x = clamp(P.x - VW * lookAhead, 0, Math.max(0, WORLD_END - VW));
    const focus = P.mode === 'swim' ? P.y : P.y - 50;
    cam.y = Math.min(GB + focus - VH * 0.45, 280 * lakeEnv(P.x));
  }

  // ---------- sky palette ----------
  const SKY = {
    intro: ['#7cd5ff', '#e6fbff', 0],
    skills: ['#79e2c5', '#f0fff7', 0],
    jump: ['#8fd9ff', '#f2fbff', 0],
    '3d': ['#b6a4ff', '#fbf3ff', 0],
    water: ['#69dbe6', '#eafffd', 0],
    uiux: ['#ffc59e', '#fff6e8', 0],
    designs: ['#ffadc9', '#fff1f6', 0],
    drive: ['#ff9f7f', '#ffe6b5', 0.05],
    premium: ['#251d5c', '#ff8aa9', 0.65],
    contact: ['#0e1436', '#2b3c7c', 1],
  };
  const skyStops = zones.map((z) => ({ x: z.cx, top: SKY[z.id][0], bot: SKY[z.id][1], night: SKY[z.id][2] }));
  function skyAt(x) {
    if (x <= skyStops[0].x) return { ...skyStops[0], t: 0, a: skyStops[0], b: skyStops[0] };
    for (let i = 0; i < skyStops.length - 1; i++) {
      const a = skyStops[i], b = skyStops[i + 1];
      if (x <= b.x) {
        const t = smooth(a.x, b.x, x);
        return { top: mix(a.top, b.top, t), bot: mix(a.bot, b.bot, t), night: lerp(a.night, b.night, t), a, b, t };
      }
    }
    const l = skyStops[skyStops.length - 1];
    return { top: l.top, bot: l.bot, night: l.night, a: l, b: l, t: 0 };
  }

  // ---------- drawing: background ----------
  let NIGHT = 0;
  function drawBackground() {
    const sk = skyAt(cam.x + VW / 2);
    NIGHT = sk.night;
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, sk.top);
    g.addColorStop(1, sk.bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);

    // stars
    if (NIGHT > 0.05) {
      for (const s of stars) {
        const a = NIGHT * (0.5 + 0.5 * Math.sin(T * 2 + s.p));
        const sx = (((s.x * VW * 1.3 - cam.x * 0.02) % (VW * 1.3)) + VW * 1.3) % (VW * 1.3);
        ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
        ctx.fillRect(sx, s.y * VH - cam.y * 0.05, s.s, s.s);
      }
    }
    // sun / moon
    const set = smooth(zDesign.cx, zFly.cx, cam.x + VW / 2);
    const sunX = VW * 0.8, sunY = VH * (0.17 + set * 0.42) - cam.y * 0.05;
    if (NIGHT < 0.6) {
      const a = 1 - smooth(0.3, 0.6, NIGHT);
      ctx.globalAlpha = a;
      const sg = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 130);
      sg.addColorStop(0, 'rgba(255,248,200,0.9)');
      sg.addColorStop(1, 'rgba(255,248,200,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(sunX - 130, sunY - 130, 260, 260);
      circle(sunX, sunY, 44, mix('#fff3b0', '#ffb36b', set));
      ctx.globalAlpha = 1;
    }
    if (NIGHT > 0.5) {
      const a = smooth(0.5, 0.9, NIGHT);
      ctx.globalAlpha = a;
      const mx = VW * 0.78, my = VH * 0.16 - cam.y * 0.05;
      const mg = ctx.createRadialGradient(mx, my, 10, mx, my, 110);
      mg.addColorStop(0, 'rgba(220,235,255,0.5)');
      mg.addColorStop(1, 'rgba(220,235,255,0)');
      ctx.fillStyle = mg;
      ctx.fillRect(mx - 110, my - 110, 220, 220);
      circle(mx, my, 34, '#f4f7ff');
      circle(mx - 10, my - 6, 6, '#dfe6f7');
      circle(mx + 12, my + 9, 4, '#dfe6f7');
      ctx.globalAlpha = 1;
    }

    // far mountains
    const farCol = mix(rgbHex(sk.top), '#1d2a5a', 0.25 + NIGHT * 0.3);
    layer(0.12, 0.25, farCol, (wx) => 170 + 70 * Math.sin(wx * 0.0035) + 45 * Math.sin(wx * 0.0091 + 1) + 18 * Math.sin(wx * 0.021), 70);
    // clouds
    const cAlpha = 0.92 - NIGHT * 0.65;
    for (const c of clouds) {
      const sx = c.x - cam.x * 0.25 + T * 12 * c.v * 10;
      const wrap = WORLD_END * 0.25 + 3200;
      const xx = ((sx % wrap) + wrap) % wrap - 200;
      if (xx < -200 || xx > VW + 200) continue;
      drawCloud(xx, c.y * VH - cam.y * 0.2, c.s, cAlpha);
    }
    // mid hills
    const midCol = mix('#5fd3a0', '#1c4d5e', NIGHT * 0.85);
    layer(0.35, 0.5, midCol, (wx) => 90 + 40 * Math.sin(wx * 0.006) + 26 * Math.sin(wx * 0.015 + 2), 20, true);
  }
  function rgbHex(rgbStr) {
    if (rgbStr[0] === '#') return rgbStr;
    const m = rgbStr.match(/\d+/g);
    if (!m) return rgbStr;
    return '#' + m.slice(0, 3).map((v) => (+v).toString(16).padStart(2, '0')).join('');
  }
  function layer(px, py, color, hfn, lift, trees) {
    const base = GB - cam.y * py + lift;
    ctx.beginPath();
    ctx.moveTo(0, VH);
    for (let sx = -10; sx <= VW + 20; sx += 14) {
      const wx = sx + cam.x * px;
      ctx.lineTo(sx, base - hfn(wx));
    }
    ctx.lineTo(VW + 20, VH);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (trees) {
      const step = 90;
      const start = Math.floor((cam.x * px) / step) * step;
      for (let wx = start; wx < cam.x * px + VW + step; wx += step) {
        const h = Math.sin(wx * 12.9898) * 43758.5453;
        const f = h - Math.floor(h);
        if (f < 0.45) continue;
        const sx = wx - cam.x * px + f * 30;
        const y = base - hfn(wx + f * 30);
        ctx.fillStyle = mix('#3cbf88', '#163f4d', NIGHT * 0.85);
        ctx.beginPath();
        ctx.moveTo(sx, y - 34 - f * 20);
        ctx.lineTo(sx + 12, y + 4);
        ctx.lineTo(sx - 12, y + 4);
        ctx.fill();
      }
    }
  }
  function drawCloud(x, y, s, a) {
    ctx.globalAlpha = Math.max(0, a);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, 26 * s, 0, TAU);
    ctx.arc(x + 30 * s, y - 14 * s, 32 * s, 0, TAU);
    ctx.arc(x + 64 * s, y, 24 * s, 0, TAU);
    ctx.arc(x + 32 * s, y + 8 * s, 26 * s, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ---------- drawing: world ----------
  function soilColors() {
    return {
      grass: mix('#4fd18b', '#1e7466', NIGHT * 0.8),
      grassHi: mix('#9af0b9', '#3aa58e', NIGHT * 0.8),
      soil: mix('#ffd08a', '#3d3a6b', NIGHT * 0.8),
      soil2: mix('#f7b96b', '#332f5c', NIGHT * 0.8),
      sand: mix('#ffe7b0', '#4a4778', NIGHT * 0.8),
    };
  }
  function drawTerrain() {
    const c = soilColors();
    const x0 = Math.floor((cam.x - 40) / 8) * 8, x1 = cam.x + VW + 40;
    const bottom = VH - GB + cam.y + 60;
    ctx.beginPath();
    ctx.moveTo(x0, bottom);
    for (let x = x0; x <= x1; x += 8) ctx.lineTo(x, terrain(x));
    ctx.lineTo(x1, bottom);
    ctx.closePath();
    ctx.fillStyle = c.soil;
    ctx.fill();
    // strata band
    ctx.beginPath();
    ctx.moveTo(x0, bottom);
    for (let x = x0; x <= x1; x += 8) ctx.lineTo(x, terrain(x) + 46 + Math.sin(x * 0.02) * 6);
    ctx.lineTo(x1, bottom);
    ctx.closePath();
    ctx.fillStyle = c.soil2;
    ctx.fill();
    // pebbles
    ctx.fillStyle = mix('#e9a55a', '#2a2750', NIGHT * 0.8);
    for (let i = Math.floor(x0 / 38); i * 38 < x1; i++) {
      const h = Math.sin(i * 91.7) * 1000;
      const f = h - Math.floor(h);
      const px = i * 38 + f * 20;
      ctx.beginPath();
      ctx.ellipse(px, terrain(px) + 70 + f * 110, 5 + f * 5, 3 + f * 3, 0, 0, TAU);
      ctx.fill();
    }
    // lake sand
    if (lakeR > x0 && lakeL < x1) {
      ctx.strokeStyle = c.sand;
      ctx.lineWidth = 18;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let x = Math.max(x0, lakeL - 30); x <= Math.min(x1, lakeR + 30); x += 8) ctx.lineTo(x, terrain(x) + 6);
      ctx.stroke();
    }
    // grass
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (const [w, col, off] of [[16, c.grass, 4], [5, c.grassHi, -2]]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      let pen = false;
      for (let x = x0; x <= x1; x += 8) {
        const y = terrain(x);
        if (y > WATER_Y - 6) { pen = false; continue; }
        if (!pen) { ctx.moveTo(x, y + off); pen = true; } else ctx.lineTo(x, y + off);
      }
      ctx.stroke();
    }
    // tufts
    ctx.fillStyle = c.grass;
    for (let i = Math.floor(x0 / 26); i * 26 < x1; i++) {
      const x = i * 26;
      const y = terrain(x);
      if (y > WATER_Y - 6) continue;
      const h = 5 + (Math.abs(Math.sin(i * 3.1)) * 7);
      ctx.beginPath();
      ctx.moveTo(x - 4, y);
      ctx.lineTo(x - 1, y - h);
      ctx.lineTo(x + 1, y);
      ctx.lineTo(x + 4, y - h * 0.7);
      ctx.lineTo(x + 6, y);
      ctx.fill();
    }
  }

  const TREE_COLS = ['#34d399', '#5eead4', '#86efac', '#2dd4bf'];
  const FLOWER_COLS = ['#ff6b6b', '#ffd93d', '#a78bfa', '#ff8fab'];
  function drawDecor() {
    const x0 = cam.x - 200, x1 = cam.x + VW + 200;
    const dn = NIGHT * 0.75;
    for (const d of decor) {
      if (d.x < x0 || d.x > x1) continue;
      const y = terrain(d.x);
      const s = d.s || 1;
      switch (d.k) {
        case 'tree': {
          ctx.fillStyle = mix('#a0663d', '#3b2f4f', dn);
          rr(d.x - 6 * s, y - 70 * s, 12 * s, 72 * s, 4);
          ctx.fill();
          const col = mix(TREE_COLS[d.c], '#1a4a52', dn);
          circle(d.x, y - 92 * s, 36 * s, col);
          circle(d.x - 24 * s, y - 70 * s, 24 * s, col);
          circle(d.x + 24 * s, y - 72 * s, 26 * s, col);
          circle(d.x - 10 * s, y - 104 * s, 14 * s, 'rgba(255,255,255,0.22)');
          break;
        }
        case 'pine': {
          ctx.fillStyle = mix('#a0663d', '#3b2f4f', dn);
          ctx.fillRect(d.x - 5 * s, y - 24 * s, 10 * s, 26 * s);
          ctx.fillStyle = mix('#22c58b', '#174a4f', dn);
          for (let k = 0; k < 3; k++) {
            ctx.beginPath();
            ctx.moveTo(d.x, y - (110 - k * 26) * s);
            ctx.lineTo(d.x + (26 + k * 8) * s, y - (50 - k * 18) * s - 10 * s);
            ctx.lineTo(d.x - (26 + k * 8) * s, y - (50 - k * 18) * s - 10 * s);
            ctx.fill();
          }
          break;
        }
        case 'bush': {
          const col = mix(TREE_COLS[(d.c + 1) % 4], '#1a4a52', dn);
          circle(d.x - 14 * s, y - 10 * s, 16 * s, col);
          circle(d.x + 6 * s, y - 16 * s, 20 * s, col);
          circle(d.x + 24 * s, y - 8 * s, 13 * s, col);
          break;
        }
        case 'flower': {
          ctx.strokeStyle = mix('#2fb67c', '#174a4f', dn);
          ctx.lineWidth = 3;
          for (let k = -1; k <= 1; k++) {
            const fx = d.x + k * 12, fh = 22 + Math.abs(k) * -5;
            line(fx, y, fx + Math.sin(T * 2 + d.x + k) * 2, y - fh);
            const col = mix(FLOWER_COLS[(d.c + k + 4) % 4], '#3b3561', dn);
            for (let p = 0; p < 5; p++) circle(fx + Math.cos((p / 5) * TAU) * 5, y - fh + Math.sin((p / 5) * TAU) * 5, 4, col);
            circle(fx, y - fh, 3, '#fff6bf');
          }
          break;
        }
        case 'mushroom': {
          rr(d.x - 6, y - 18, 12, 18, 4, '#fff3e0');
          ctx.beginPath();
          ctx.ellipse(d.x, y - 18, 20, 14, 0, Math.PI, TAU);
          ctx.fillStyle = mix('#ff6b6b', '#5b2a4f', dn);
          ctx.fill();
          circle(d.x - 8, y - 24, 3.5, '#fff');
          circle(d.x + 6, y - 27, 3, '#fff');
          break;
        }
        case 'rock': {
          ctx.fillStyle = mix('#b8c0d9', '#3a3f63', dn);
          ctx.beginPath();
          ctx.ellipse(d.x, y, 26 * s, 18 * s, 0, Math.PI, TAU);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.beginPath();
          ctx.ellipse(d.x - 8 * s, y - 10 * s, 8 * s, 4 * s, -0.3, 0, TAU);
          ctx.fill();
          break;
        }
        case 'reed': {
          ctx.strokeStyle = mix('#2fb67c', '#174a4f', dn);
          ctx.lineWidth = 3;
          for (let k = 0; k < 4; k++) {
            const sw = Math.sin(T * 1.5 + d.x * 0.1 + k) * 4;
            ctx.beginPath();
            ctx.moveTo(d.x + k * 6, y);
            ctx.quadraticCurveTo(d.x + k * 6, y - 30 * s, d.x + k * 6 + sw, y - (46 + k * 6) * s);
            ctx.stroke();
          }
          rr(d.x + 4, y - 50 * s, 6, 16, 3, mix('#a0663d', '#3b2f4f', dn));
          break;
        }
        case 'building': {
          const cols = ['#3b3f8f', '#4c3d8f', '#2f4f8f'];
          const bx = d.x - d.w / 2;
          rr(bx, y - d.h, d.w, d.h, [8, 8, 0, 0], cols[d.c]);
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(bx, y - d.h, 8, d.h);
          for (let wy = y - d.h + 16; wy < y - 20; wy += 22) {
            for (let wx = bx + 12; wx < bx + d.w - 14; wx += 18) {
              const h = Math.sin(wx * 7.1 + wy * 3.3) * 1000;
              const f = h - Math.floor(h);
              ctx.fillStyle = f > 0.55 ? (f > 0.8 ? '#7ef9ff' : '#ffe08a') : 'rgba(255,255,255,0.1)';
              ctx.fillRect(wx, wy, 9, 11);
            }
          }
          if (d.c === 1) {
            ctx.strokeStyle = '#c4b5fd';
            ctx.lineWidth = 2;
            line(d.x, y - d.h, d.x, y - d.h - 26);
            circle(d.x, y - d.h - 26, 3, Math.sin(T * 4 + d.x) > 0 ? '#ff6b6b' : '#5b2a4f');
          }
          break;
        }
        case 'lamp': {
          ctx.strokeStyle = '#2b2d42';
          ctx.lineWidth = 5;
          line(d.x, y, d.x, y - 110);
          const lg = ctx.createRadialGradient(d.x, y - 112, 2, d.x, y - 112, 70);
          lg.addColorStop(0, 'rgba(255,230,150,0.75)');
          lg.addColorStop(1, 'rgba(255,230,150,0)');
          ctx.fillStyle = lg;
          ctx.fillRect(d.x - 70, y - 182, 140, 140);
          rr(d.x - 9, y - 124, 18, 16, 5, '#ffe9a8');
          break;
        }
      }
    }
  }

  function drawObstacles() {
    for (const o of obstacles) {
      if (o.x + o.w < cam.x - 50 || o.x > cam.x + VW + 50) continue;
      if (o.kind === 'crate' || o.kind === 'crate2') {
        const n = o.kind === 'crate2' ? 2 : 1;
        const h = o.h / n;
        for (let k = 0; k < n; k++) crate(o.x, -h * (k + 1), o.w, h);
      } else if (o.kind === 'pipe') {
        const g = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0);
        g.addColorStop(0, '#26b5a8');
        g.addColorStop(0.35, '#7af0e4');
        g.addColorStop(1, '#1a8f86');
        rr(o.x + 6, -o.h + 26, o.w - 12, o.h - 24, 0, g);
        rr(o.x, -o.h, o.w, 30, 8, g);
        ctx.strokeStyle = '#13756e';
        ctx.lineWidth = 3;
        ctx.strokeRect(o.x + 1.5, -o.h + 1.5, o.w - 3, 27);
      } else if (o.kind === 'log') {
        rr(o.x, -o.h, o.w, o.h, o.h / 2, '#c67c45');
        ctx.fillStyle = '#e09a5f';
        ctx.fillRect(o.x + 20, -o.h + 8, o.w - 40, 6);
        ctx.beginPath();
        ctx.ellipse(o.x + o.w - o.h / 2, -o.h / 2, o.h / 2 - 2, o.h / 2 - 2, 0, 0, TAU);
        ctx.fillStyle = '#f2c08b';
        ctx.fill();
        ctx.strokeStyle = '#c67c45';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(o.x + o.w - o.h / 2, -o.h / 2, o.h / 4, o.h / 4, 0, 0, TAU);
        ctx.stroke();
      }
    }
  }
  function crate(x, y, w, h) {
    rr(x, y, w, h, 6, '#f4a95d');
    ctx.strokeStyle = '#b8682b';
    ctx.lineWidth = 4;
    ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
    line(x + 6, y + 6, x + w - 6, y + h - 6);
    line(x + w - 6, y + 6, x + 6, y + h - 6);
  }

  function drawCoins() {
    for (const c of coins) {
      if (c.taken || c.x < cam.x - 40 || c.x > cam.x + VW + 40) continue;
      const w = Math.abs(Math.cos(T * 3 + c.x * 0.01));
      const y = c.y + Math.sin(T * 3 + c.x) * 3;
      ctx.beginPath();
      ctx.ellipse(c.x, y, 3 + 11 * w, 14, 0, 0, TAU);
      ctx.fillStyle = '#ffd93d';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#f2a900';
      ctx.stroke();
      if (w > 0.4) {
        ctx.fillStyle = '#fff6bf';
        ctx.fillRect(c.x - 2 * w, y - 7, 4 * w, 14);
      }
    }
  }

  function drawRope() {
    if (ROPE_B < cam.x - 100 || ROPE_A > cam.x + VW + 100) return;
    const y = -425;
    for (const px of [ROPE_A, ROPE_B]) {
      ctx.fillStyle = mix('#8a5a3b', '#3b2f4f', NIGHT);
      rr(px - 7, y - 10, 14, 10 - y, 4);
      ctx.fill();
      circle(px, y - 12, 10, '#ff6b6b');
    }
    ctx.strokeStyle = '#6b4a3a';
    ctx.lineWidth = 3;
    const pts = [ROPE_A, ...posterXs, ROPE_B];
    ctx.beginPath();
    ctx.moveTo(pts[0], y);
    for (let i = 1; i < pts.length; i++) ctx.quadraticCurveTo((pts[i - 1] + pts[i]) / 2, y + 30, pts[i], y);
    ctx.stroke();
    // little lights hanging on the rope
    for (let i = 0; i < pts.length - 1; i++) {
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        circle(lerp(pts[i], pts[i + 1], t), y + 60 * t * (1 - t) + 5, 5, FLOWER_COLS[(i + k) % 4]);
      }
    }
  }

  function drawCarStuff() {
    if (CAR_B + 200 < cam.x - 300 || CAR_A - 200 > cam.x + VW + 300) return;
    // garage at the end of the drive
    const gx = CAR_B + 40;
    rr(gx - 90, -150, 220, 150, [16, 16, 0, 0], mix('#ffcf99', '#3d3a6b', NIGHT));
    ctx.fillStyle = mix('#ff6b6b', '#5b2a4f', NIGHT);
    ctx.beginPath();
    ctx.moveTo(gx - 110, -140);
    ctx.lineTo(gx + 20, -200);
    ctx.lineTo(gx + 150, -140);
    ctx.fill();
    rr(gx - 50, -110, 140, 110, [10, 10, 0, 0], '#2b2d42');
    ctx.fillStyle = '#3d405b';
    for (let k = 0; k < 5; k++) ctx.fillRect(gx - 44, -100 + k * 20, 128, 10);
    // start flag for the drive
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 4;
    line(CAR_A - 90, 0, CAR_A - 90, -120);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#2b2d42' : '#ffffff';
      ctx.fillRect(CAR_A - 88 + c * 12, -120 + r * 12 + Math.sin(T * 4 + c) * 2, 12, 12);
    }
    if (P.mode !== 'drive') {
      const parked = P.x < CAR_A ? CAR_A : CAR_B;
      drawCar(parked, terrain(parked), 0, 0, 0, false);
    }
  }

  function drawPads() {
    if (FLY_B + 200 < cam.x - 200 || FLY_A - 200 > cam.x + VW + 200) return;
    for (const [px, label] of [[FLY_A, 'LAUNCH'], [FLY_B, 'LAND']]) {
      if (px < cam.x - 200 || px > cam.x + VW + 200) continue;
      rr(px - 80, -16, 160, 16, 6, '#3d405b');
      ctx.fillStyle = `rgba(94,234,212,${0.5 + 0.4 * Math.sin(T * 4)})`;
      ctx.fillRect(px - 70, -20, 140, 4);
      ctx.fillStyle = '#ffd93d';
      ctx.font = '700 11px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, px, -4);
    }
  }

  function drawRings(front) {
    for (const r of rings) {
      if (r.x < cam.x - 120 || r.x > cam.x + VW + 120) continue;
      const pulse = 1 + Math.sin(T * 3 + r.x) * 0.03;
      const col = r.passed ? '#5eead4' : '#ffd93d';
      ctx.lineWidth = 9;
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      if (front) ctx.ellipse(r.x, r.y, 18 * pulse, 82 * pulse, 0, -Math.PI / 2, Math.PI / 2);
      else ctx.ellipse(r.x, r.y, 18 * pulse, 82 * pulse, 0, Math.PI / 2, Math.PI * 1.5);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  function drawRocks() {
    for (const r of rocks) {
      if (r.x < cam.x - 100 || r.x > cam.x + VW + 100) continue;
      ctx.save();
      ctx.translate(r.x, r.y + Math.sin(T + r.x) * 8);
      ctx.rotate(r.rot);
      ctx.beginPath();
      r.pts.forEach((k, i) => {
        const a = (i / r.pts.length) * TAU;
        ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r.r * k, Math.sin(a) * r.r * k);
      });
      ctx.closePath();
      ctx.fillStyle = '#6d5fb0';
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(-r.r * 0.25, -r.r * 0.25, r.r * 0.3, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#5a4c9c';
      ctx.beginPath();
      ctx.arc(r.r * 0.3, r.r * 0.2, r.r * 0.18, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawUnderwater() {
    if (lakeR < cam.x - 50 || lakeL > cam.x + VW + 50) return;
    // seaweed
    for (let x = lakeL + 40; x < lakeR - 40; x += 64) {
      const y = terrain(x);
      if (y < WATER_Y + 60) continue;
      ctx.strokeStyle = (x / 64) % 2 < 1 ? '#2bb673' : '#57d38c';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const h = 60 + ((x * 7) % 50);
      for (let k = 1; k <= 6; k++) ctx.lineTo(x + Math.sin(T * 1.6 + k * 0.8 + x) * 7, y - (h * k) / 6);
      ctx.stroke();
    }
    // fish
    const mid = (lakeL + lakeR) / 2, half = (lakeR - lakeL) / 2 - 160;
    for (const f of fish) {
      const fx = mid + Math.sin(T * f.sp + f.p) * half;
      const dir = Math.cos(T * f.sp + f.p) >= 0 ? 1 : -1;
      const fy = f.y + Math.sin(T * 2 + f.p) * 8;
      if (terrain(fx) < fy + 20) continue;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.scale(dir, 1);
      ctx.fillStyle = f.c;
      ctx.beginPath();
      ctx.ellipse(0, 0, 16, 9, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-12, 0);
      ctx.lineTo(-24, -8 + Math.sin(T * 10 + f.p) * 2);
      ctx.lineTo(-24, 8 + Math.sin(T * 10 + f.p) * 2);
      ctx.fill();
      circle(8, -2, 2.5, '#1d2142');
      ctx.restore();
    }
  }

  function drawWater() {
    if (lakeR < cam.x - 50 || lakeL > cam.x + VW + 50) return;
    const a = Math.max(lakeL - 4, cam.x - 20), b = Math.min(lakeR + 4, cam.x + VW + 20);
    ctx.beginPath();
    ctx.moveTo(a, WATER_Y);
    for (let x = a; x <= b; x += 8) ctx.lineTo(x, WATER_Y + Math.sin(x * 0.03 + T * 2.2) * 2.5);
    for (let x = b; x >= a; x -= 8) ctx.lineTo(x, Math.max(WATER_Y, terrain(x) + 2));
    ctx.closePath();
    const g = ctx.createLinearGradient(0, WATER_Y, 0, WATER_Y + LAKE_DEPTH);
    g.addColorStop(0, 'rgba(72,214,232,0.55)');
    g.addColorStop(1, 'rgba(20,110,160,0.78)');
    ctx.fillStyle = g;
    ctx.fill();
    // light rays
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (let x = Math.floor(a / 180) * 180; x < b; x += 180) {
      const o = Math.sin(T * 0.6 + x) * 20;
      ctx.beginPath();
      ctx.moveTo(x + o, WATER_Y);
      ctx.lineTo(x + 50 + o, WATER_Y);
      ctx.lineTo(x - 40 + o, WATER_Y + 300);
      ctx.lineTo(x - 110 + o, WATER_Y + 300);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = a; x <= b; x += 8) ctx[x === a ? 'moveTo' : 'lineTo'](x, WATER_Y + Math.sin(x * 0.03 + T * 2.2) * 2.5);
    ctx.stroke();
  }

  function drawEnd() {
    if (FLAG_X < cam.x - 300 && CASTLE_X < cam.x - 300) return;
    if (FLAG_X > cam.x + VW + 300) return;
    // flag pole
    ctx.strokeStyle = '#e9ecef';
    ctx.lineWidth = 7;
    line(FLAG_X, 0, FLAG_X, -320);
    circle(FLAG_X, -326, 9, '#ffd93d');
    rr(FLAG_X - 16, -14, 32, 14, 3, '#3d405b');
    const fy = lerp(-40, -300, flagY);
    ctx.fillStyle = '#5eead4';
    ctx.beginPath();
    ctx.moveTo(FLAG_X, fy - 24);
    ctx.lineTo(FLAG_X + 62 + Math.sin(T * 5) * 4, fy - 10);
    ctx.lineTo(FLAG_X, fy + 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 14px Fredoka, sans-serif';
    ctx.fillText('★', FLAG_X + 18, fy - 4);
    // castle
    const cx = CASTLE_X;
    const wall = mix('#c4b5fd', '#5b4f9c', NIGHT * 0.5);
    rr(cx - 110, -170, 220, 170, 0, wall);
    for (let k = 0; k < 6; k++) rr(cx - 110 + k * 40, -194, 26, 26, 3, wall);
    rr(cx - 40, -260, 80, 100, 0, wall);
    for (let k = 0; k < 3; k++) rr(cx - 40 + k * 30, -280, 20, 22, 3, wall);
    ctx.fillStyle = '#2b2d42';
    ctx.beginPath();
    ctx.moveTo(cx - 30, 0);
    ctx.lineTo(cx - 30, -60);
    ctx.arc(cx, -60, 30, Math.PI, 0);
    ctx.lineTo(cx + 30, 0);
    ctx.fill();
    ctx.fillStyle = '#ffe08a';
    rr(cx - 12, -230, 24, 30, [12, 12, 0, 0]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(29,33,66,0.12)';
    ctx.lineWidth = 2;
    for (let y = -150; y < 0; y += 22) line(cx - 110, y, cx + 110, y);
  }

  // ---------- character ----------
  const SKIN = '#ffd6b0';
  function limb(x, y, a, len, color, w, hand) {
    const ex = x + Math.sin(a) * len, ey = y + Math.cos(a) * len;
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    line(x, y, ex, ey);
    if (hand) circle(ex, ey, 4.6, hand);
  }
  function drawKid(o) {
    // origin at feet, facing right
    const hip = -36;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    limb(-2, -62, o.armB, 24, '#e04f5f', 9, SKIN);
    for (const [a, col] of [[o.legB, '#2f3e8f'], [o.legA, '#3d52c4']]) {
      const fx = Math.sin(a) * 33, fy = hip + Math.cos(a) * 33;
      ctx.strokeStyle = col;
      ctx.lineWidth = 11;
      line(0, hip, fx, fy);
      rr(fx - 7, fy - 4, 17, 9, 4, '#ffffff');
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(fx - 7, fy + 2, 17, 3);
      if (col === '#2f3e8f') rr(-25, -70, 13, 32, 5, '#2ec4b6');
    }
    rr(-14, -72, 28, 40, 11, '#ff6b6b');
    ctx.fillStyle = '#ff8787';
    ctx.fillRect(-10, -48, 20, 3);
    rr(-4, -70, 8, 6, 3, '#ffd93d');
    limb(2, -62, o.armA, 24, '#ff8787', 9, SKIN);
    // head
    circle(3, -88, 17, SKIN);
    ctx.fillStyle = '#3a2b6b';
    ctx.beginPath();
    ctx.arc(1, -92, 18, Math.PI * 0.92, Math.PI * 2.08);
    ctx.quadraticCurveTo(12, -96, 4, -95);
    ctx.quadraticCurveTo(-4, -92, -14, -84);
    ctx.fill();
    circle(-12, -88, 8, '#3a2b6b');
    circle(-2, -86, 3.5, '#f5b98f');
    if (o.goggles) {
      ctx.strokeStyle = '#2ec4b6';
      ctx.lineWidth = 3;
      line(-12, -90, 16, -90);
      rr(7, -95, 13, 10, 4, '#7ef9ff');
    } else {
      const blink = P.blink > 0 ? 0.3 : 1;
      ctx.fillStyle = '#1d2142';
      ctx.beginPath();
      ctx.ellipse(12, -88, 2.3, 3.3 * blink, 0, 0, TAU);
      ctx.fill();
    }
    circle(10, -81, 3.5, 'rgba(255,120,140,0.45)');
    ctx.strokeStyle = '#7a3b3b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(15, -82, 3.5, 0.3, 1.6);
    ctx.stroke();
  }

  function drawCar(x, y, ang, wheel, susp, driver) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(0, 1, 70, 7, 0, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.translate(0, susp);
    // shocks
    ctx.strokeStyle = '#8d99ae';
    ctx.lineWidth = 4;
    line(-40, -20, -36, -36);
    line(40, -20, 36, -36);
    if (driver) {
      ctx.save();
      ctx.translate(-6, -34);
      ctx.scale(0.8, 0.8);
      drawKid({ legA: 1.3, legB: 1.25, armA: 1.7, armB: 1.5 });
      ctx.restore();
    }
    // roll bar
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-34, -56);
    ctx.lineTo(-30, -118);
    ctx.lineTo(4, -118);
    ctx.lineTo(10, -56);
    ctx.stroke();
    // steering wheel
    line(22, -58, 14, -76);
    ctx.lineWidth = 4;
    line(9, -80, 19, -72);
    // body
    ctx.beginPath();
    ctx.moveTo(-62, -26);
    ctx.lineTo(-62, -58);
    ctx.quadraticCurveTo(-62, -62, -56, -62);
    ctx.lineTo(18, -62);
    ctx.lineTo(30, -50);
    ctx.lineTo(60, -48);
    ctx.quadraticCurveTo(68, -46, 68, -38);
    ctx.lineTo(68, -26);
    ctx.quadraticCurveTo(68, -20, 62, -20);
    ctx.lineTo(-56, -20);
    ctx.quadraticCurveTo(-62, -20, -62, -26);
    ctx.fillStyle = '#ffd93d';
    ctx.fill();
    ctx.fillStyle = '#f4b400';
    ctx.fillRect(-62, -32, 130, 8);
    ctx.strokeStyle = 'rgba(29,33,66,0.25)';
    ctx.lineWidth = 2;
    line(-18, -60, -18, -26);
    circle(64, -42, 4.5, '#fffbe0');
    rr(-64, -54, 5, 10, 2, '#ff6b6b');
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 12px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('R', -40, -38);
    ctx.restore();
    // wheels
    for (const wx of [-40, 40]) {
      ctx.save();
      ctx.translate(wx, -20);
      circle(0, 0, 20, '#2b2d42');
      circle(0, 0, 11, '#e9ecef');
      ctx.rotate(wheel);
      ctx.strokeStyle = '#8d99ae';
      ctx.lineWidth = 3;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        line(0, 0, Math.cos(a) * 10, Math.sin(a) * 10);
      }
      circle(0, 0, 3.5, '#ff6b6b');
      ctx.restore();
    }
    ctx.restore();
  }

  function drawSuit() {
    // origin at body centre, upright, facing right
    const RED = '#e63946', DRED = '#b5232f', GOLD = '#ffb703';
    ctx.lineCap = 'round';
    // boot flames (glow)
    const fl = 16 + Math.random() * 10;
    for (const bx of [-5, 6]) {
      const fg = ctx.createLinearGradient(0, 50, 0, 52 + fl);
      fg.addColorStop(0, 'rgba(255,255,220,0.95)');
      fg.addColorStop(0.4, 'rgba(255,183,3,0.8)');
      fg.addColorStop(1, 'rgba(255,90,60,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(bx - 5, 50);
      ctx.quadraticCurveTo(bx, 52 + fl * 1.2, bx + 5, 50);
      ctx.fill();
    }
    // back arm
    limb(-3, -24, 0.25, 30, DRED, 10, null);
    circle(-3 + Math.sin(0.25) * 30, -24 + Math.cos(0.25) * 30, 5.5, GOLD);
    // legs
    rr(-12, 8, 11, 42, 5, DRED);
    rr(1, 8, 11, 42, 5, RED);
    circle(6, 28, 4, GOLD);
    rr(-13, 42, 13, 9, 3, GOLD);
    rr(0, 42, 13, 9, 3, GOLD);
    // torso
    rr(-16, -32, 32, 46, 13, RED);
    rr(-9, -6, 18, 16, 5, GOLD);
    ctx.fillStyle = DRED;
    ctx.fillRect(-1, -6, 2, 16);
    // arc reactor
    ctx.shadowColor = '#7ef9ff';
    ctx.shadowBlur = 18;
    circle(2, -18, 6, '#dffcff');
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#7ef9ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(2, -18, 7.5, 0, TAU);
    ctx.stroke();
    // front arm with repulsor
    limb(3, -24, 0.12, 30, RED, 10, null);
    const hx = 3 + Math.sin(0.12) * 30, hy = -24 + Math.cos(0.12) * 30;
    circle(hx, hy, 5.5, GOLD);
    ctx.shadowColor = '#7ef9ff';
    ctx.shadowBlur = 12;
    circle(hx, hy + 4, 3, '#e8feff');
    ctx.shadowBlur = 0;
    // helmet
    rr(-13, -58, 27, 28, 11, RED);
    rr(-3, -54, 18, 21, [6, 9, 9, 6], GOLD);
    ctx.shadowColor = '#bffcff';
    ctx.shadowBlur = 10;
    ctx.strokeStyle = '#f2feff';
    ctx.lineWidth = 2.6;
    line(4, -46, 9, -45);
    line(11, -45, 14, -46);
    ctx.shadowBlur = 0;
    ctx.fillStyle = DRED;
    ctx.fillRect(4, -38, 10, 1.6);
  }

  function drawPlayer() {
    // shadow
    if (P.mode === 'walk' || P.mode === 'fly') {
      const g = groundAt(P.x);
      const h = Math.max(0, g - P.y);
      const s = Math.max(0.2, 1 - h / 400);
      ctx.fillStyle = `rgba(29,33,66,${(0.18 * s).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(P.x, g, 24 * s, 5 * s, 0, 0, TAU);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(P.x, P.y);
    if (P.mode === 'walk') {
      ctx.scale(P.dir, 1);
      if (P.grounded) {
        const sw = Math.min(1, Math.abs(P.vx) / 3) * 0.55;
        const a = Math.sin(P.phase) * sw;
        const breathe = sw < 0.05 ? Math.sin(T * 2.5) * 1.2 : 0;
        ctx.translate(0, 33 * (1 - Math.cos(a)) + breathe);
        drawKid({ legA: a, legB: -a, armA: -a * 1.2, armB: a * 1.2 });
      } else {
        drawKid({ legA: 0.55, legB: -0.35, armA: 2.7, armB: -0.6 });
      }
    } else if (P.mode === 'swim') {
      ctx.scale(P.dir, 1);
      ctx.rotate(1.35 + P.swimTilt);
      ctx.translate(0, 52);
      const k = Math.sin(P.phase * 2.2) * 0.4;
      drawKid({ legA: k, legB: -k, armA: P.phase * 1.6, armB: P.phase * 1.6 + Math.PI, goggles: true });
    } else if (P.mode === 'drive') {
      ctx.restore();
      drawCar(P.x, P.y, P.carAngle, P.wheel, P.susp, true);
      return;
    } else {
      ctx.translate(0, -50);
      ctx.scale(P.dir, 1);
      ctx.rotate(P.tilt);
      drawSuit();
    }
    ctx.restore();
  }

  function drawParticles() {
    for (const p of parts) {
      const a = clamp(p.life, 0, 1);
      ctx.globalAlpha = a;
      if (p.kind === 'puff') {
        circle(p.x, p.y, p.size * (1.6 - a * 0.6), p.color);
      } else if (p.kind === 'bubble') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x + Math.sin(p.y * 0.1) * 2, p.y, p.size, 0, TAU);
        ctx.stroke();
      } else if (p.kind === 'flame') {
        ctx.globalCompositeOperation = 'lighter';
        circle(p.x, p.y, p.size * a, p.color);
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.kind === 'confetti') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else if (p.kind === 'star') {
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size, -p.size * 0.3, p.size * 2, p.size * 0.6);
        ctx.fillRect(-p.size * 0.3, -p.size, p.size * 0.6, p.size * 2);
        ctx.restore();
      } else circle(p.x, p.y, p.size * a, p.color);
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    ctx.setTransform(DPR * S, 0, 0, DPR * S, 0, 0);
    drawBackground();
    ctx.save();
    ctx.translate(-cam.x, GB - cam.y);
    drawDecor();
    drawRope();
    drawCarStuff();
    drawPads();
    drawEnd();
    drawRocks();
    drawRings(false);
    drawTerrain();
    drawUnderwater();
    drawObstacles();
    drawCoins();
    drawPlayer();
    drawWater();
    drawRings(true);
    drawParticles();
    ctx.restore();
    if (P.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(P.flash * 0.5).toFixed(3)})`;
      ctx.fillRect(0, 0, VW, VH);
    }
    worldEl.style.transform = `scale(${S}) translate(${-cam.x}px, ${-cam.y}px)`;
  }

  // ---------- HUD ----------
  const chapterEls = [];
  const chaptersNav = $('#chapters');
  zones.forEach((z) => {
    const b = el('button', 'chap', `<i class="fill"></i><span class="ci">${z.icon}</span><span class="lbl">${esc(z.label)}</span>`);
    b.style.flexGrow = String(z.x1 - z.x0);
    b.title = z.label;
    b.addEventListener('click', () => teleport(z.id === 'intro' ? 260 : z.x0 + 60));
    chaptersNav.appendChild(b);
    chapterEls.push({ z, b, fill: b.querySelector('.fill') });
  });
  $('#brandName').textContent = (D.name || '').split(' ')[0];
  $('#logo').textContent = (D.name || 'R').trim()[0];
  $('#brand').addEventListener('click', () => teleport(260));
  const coinEl = $('#coinCount');
  function bumpCoins() {
    coinEl.textContent = coinCount;
    coinEl.parentElement.classList.remove('bump');
    void coinEl.parentElement.offsetWidth;
    coinEl.parentElement.classList.add('bump');
  }
  const toastEl = $('#zoneToast');
  let toastTimer = 0;
  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1800);
  }
  let lastZone = null;
  const hintEl = $('#hint');
  function updateHUD() {
    const z = zoneAt(P.x);
    if (z !== lastZone) {
      if (lastZone) showToast(`${z.icon} ${z.label}`);
      lastZone = z;
    }
    for (const c of chapterEls) {
      const f = clamp((P.x - c.z.x0) / (c.z.x1 - c.z.x0), 0, 1);
      c.fill.style.transform = `scaleX(${f})`;
      c.b.classList.toggle('on', c.z === z);
    }
    if (traveled > 260) hintEl.classList.add('hide');
  }

  // ---------- modal & list view ----------
  const modal = $('#modal');
  const listView = $('#listView');
  let lastFocus = null;
  function openModal(item, kind) {
    lastFocus = document.activeElement;
    $('#mThumb').innerHTML = thumb(item);
    $('#mKicker').textContent = kind;
    $('#mTitle').textContent = item.title;
    $('#mDesc').textContent = item.description || item.short || '';
    $('#mTags').innerHTML = tagsHtml(item.tags);
    const link = $('#mLink');
    if (item.link && item.link !== '#') { link.href = item.link; link.hidden = false; } else link.hidden = true;
    modal.hidden = false;
    $('#mClose').focus();
  }
  function closeOverlays() {
    modal.hidden = true;
    listView.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  $('#mClose').addEventListener('click', closeOverlays);
  $('#lvClose').addEventListener('click', closeOverlays);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeOverlays(); });
  listView.addEventListener('click', (e) => { if (e.target === listView) closeOverlays(); });

  function buildList() {
    const sec = (title, items) => `<section><h3>${title}</h3>${items}</section>`;
    const card = (p) => `<article class="lv-item"><div class="lv-thumb">${thumb(p)}</div><div><b>${esc(p.title)}</b><p>${esc(p.description || p.short || '')}</p><div class="tags">${tagsHtml(p.tags)}</div>${p.link && p.link !== '#' ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">Open ↗</a>` : ''}</div></article>`;
    const L = D.links || {};
    $('#lvContent').innerHTML = `
      <header class="lv-head"><h2>${esc(D.name)}</h2><p>${esc((D.role || []).join(' · '))}</p><p class="muted">${esc(D.tagline)}</p></header>
      ${sec('🧠 Skills', `<div class="lv-skills">${D.skills.map((s) => `<span>${esc(s.icon)} ${esc(s.name)}</span>`).join('')}</div>`)}
      ${sec('🧊 3D Projects', D.projects3d.map(card).join(''))}
      ${sec('🌊 Process', `<ol class="lv-process">${D.process.map((p) => `<li><b>${esc(p.icon)} ${esc(p.title)}</b> — ${esc(p.text)}</li>`).join('')}</ol>`)}
      ${sec('📱 UI/UX', D.uiux.map(card).join(''))}
      ${sec('🎨 Designs', `<div class="lv-grid">${D.designs.map((p) => `<div class="lv-design">${thumb(p)}<b>${esc(p.title)}</b></div>`).join('')}</div>`)}
      ${sec('🚙 Journey', `<ul class="lv-process">${D.experience.map((e) => `<li><b>${esc(e.year)} · ${esc(e.title)}</b> (${esc(e.place)}) — ${esc(e.text)}</li>`).join('')}</ul>`)}
      ${sec('🚀 Premium', D.premium.map(card).join(''))}
      ${sec('✉️ Contact', `<p>${esc(D.contact.text)}</p><p class="lv-links">${L.email ? `<a href="${esc(L.email)}">Email</a>` : ''}${L.linkedin ? `<a href="${esc(L.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ''}${L.github ? `<a href="${esc(L.github)}" target="_blank" rel="noopener">GitHub</a>` : ''}</p>`)}`;
  }
  function openList() {
    lastFocus = document.activeElement;
    buildList();
    listView.hidden = false;
    $('#lvClose').focus();
  }
  $('#listBtn').addEventListener('click', openList);
  $('#heroList').addEventListener('click', openList);
  $('#startBtn').addEventListener('click', () => { targetX = zSkills.x0 + 400; });

  // keyboard focus on a card brings the character to it
  worldEl.addEventListener('focusin', (e) => {
    const p = placed.find((q) => q.node.contains(e.target));
    if (p && Math.abs(P.x - p.x) > VW * 0.4) teleport(p.x - 120);
  });

  // ---------- boot ----------
  function resize() {
    W = innerWidth;
    H = innerHeight;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    S = clamp(H / 820, 0.55, 1);
    VW = W / S;
    VH = H / S;
    GB = Math.round(VH * 0.8);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    layoutDOM();
    snapCam();
  }
  addEventListener('resize', resize);
  resize();
  P.x = targetX = Math.min(260, VW * 0.55);
  snapCam();
  updateHUD();

  let last = performance.now();
  let blinkTimer = 3;
  function frame(now) {
    const dt = clamp((now - last) / 16.667, 0, 3);
    last = now;
    T += dt / 60;
    blinkTimer -= dt / 60;
    if (blinkTimer < 0) { P.blink = 0.12; blinkTimer = 2.5 + Math.random() * 3; }
    P.blink = Math.max(0, P.blink - dt / 60);
    update(dt);
    render();
    updateHUD();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // handy for testing from the console
  window.portfolio = { teleport, zones, get player() { return P; } };
})();
