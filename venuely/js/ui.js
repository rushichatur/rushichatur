// UI: toolbars, asset library, layers, summary, properties panel, menus, templates.

import { ASSETS, PALETTE, paletteByCat, ZONE_PALETTE } from './assets.js';
import { DEFAULT_ARRAY, layoutOf } from './layout.js';
import { GROUNDS, Camera, Renderer } from './render.js';
import { thumbCanvas } from './thumbs.js';
import { resizeFlags } from './editor.js';
import { round, clamp } from './util.js';
import { TEMPLATES } from './templates.js';
import { Scene } from './scene.js';

// ---- icons -------------------------------------------------------------------
const I = {
  select: '<path d="M5 3l14 7-6 2.2L10.8 19z"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 013 0V11m0-6.5a1.5 1.5 0 013 0V11m0-4.5a1.5 1.5 0 013 0V15a6 6 0 01-6 6h-.5a6 6 0 01-5-2.7l-3-4.6a1.5 1.5 0 012.4-1.8L8 14"/>',
  poly: '<path d="M4 8l6-4 9 3 1 9-8 4-8-4z"/><circle cx="4" cy="8" r="1.2"/><circle cx="10" cy="4" r="1.2"/><circle cx="19" cy="7" r="1.2"/><circle cx="20" cy="16" r="1.2"/><circle cx="12" cy="20" r="1.2"/><circle cx="4" cy="16" r="1.2"/>',
  road: '<path d="M4 20c0-7 4-6 8-9s2-7 8-7"/><path d="M8 20c2-1 2-3 4-4" stroke-dasharray="2 3"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h9a7 7 0 010 14h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9h-9a7 7 0 000 14h3"/>',
  grid: '<path d="M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18"/>',
  magnet: '<path d="M6 15V4h4v11a2 2 0 004 0V4h4v11a6 6 0 01-12 0zM6 8h4M14 8h4"/>',
  rotL: '<path d="M3 12a9 9 0 109-9 9 9 0 00-6.5 2.8L3 8"/><path d="M3 3v5h5"/>',
  rotR: '<path d="M21 12a9 9 0 11-9-9 9 9 0 016.5 2.8L21 8"/><path d="M21 3v5h-5"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 8"/>',
  file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5"/>',
  print: '<path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/>',
  tpl: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="3" y="13" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="8" rx="1.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 017.5-2"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M3 3l18 18M10.6 6.2A9 9 0 0112 6c6 0 10 6 10 6a17 17 0 01-3.3 3.8M6.3 7.7A17 17 0 002 12s4 7 10 7a9 9 0 004.2-1"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  front: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  back: '<path d="M12 21l-9-5 9-5 9 5z"/><path d="M3 11l9-5 9 5"/>',
  panelL: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  panelR: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
  style: '<path d="M12 3a9 9 0 100 18c1.5 0 2-1 1.5-2s0-2 1.5-2h2a3 3 0 003-3A9 9 0 0012 3z"/><circle cx="7.5" cy="11" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="11" r="1"/>',
  alL: '<path d="M4 3v18M8 7h12v4H8zM8 14h7v4H8z"/>',
  alCx: '<path d="M12 3v18M5 7h14v4H5zM8 14h8v4H8z"/>',
  alR: '<path d="M20 3v18M4 7h12v4H4zM9 14h7v4H9z"/>',
  alT: '<path d="M3 4h18M7 8v12h4V8zM14 8v7h4V8z"/>',
  alCy: '<path d="M3 12h18M7 5v14h4V5zM14 8v8h4V8z"/>',
  alB: '<path d="M3 20h18M7 4v12h4V4zM14 9v7h4V9z"/>',
  dx: '<path d="M4 4v16M20 4v16M9 8h6v8H9z"/>',
  dy: '<path d="M4 4h16M4 20h16M8 9h8v6H8z"/>',
};
export const icon = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[n] || ''}</svg>`;

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
const $ = (s) => document.querySelector(s);

export class UI {
  constructor(editor, scene) {
    this.ed = editor; this.scene = scene;
    this.syncers = [];
    this.buildTopbar();
    this.buildToolbar();
    this.buildLibrary();
    this.buildTabs();
    this.buildDnD();
    this.buildModal();

    editor.on('selection', () => { this.renderProps(); this.renderLayers(); });
    editor.on('objects', () => { this.renderLayers(); this.renderSummary(); this.renderProps(); });
    editor.on('live', () => this.sync());
    editor.on('view', () => this.syncView());
    editor.on('tool', () => this.syncTools());
    editor.on('hint', (t, sticky) => this.hint(t, sticky));
    editor.on('toast', (m) => this.toast(m));
    editor.on('coords', (g) => { $('#coords').textContent = `x ${g[0].toFixed(1)} m · y ${g[1].toFixed(1)} m`; });
    scene.on((k) => { if (k === 'commit' || k === 'load' || k === 'restore') { this.syncHistory(); this.renderLayers(); this.renderSummary(); if (k !== 'commit') { this.renderProps(); } $('#planName').value = scene.meta.name; } });

    this.renderProps(); this.renderLayers(); this.renderSummary(); this.syncView(); this.syncTools(); this.syncHistory();
    $('#planName').value = scene.meta.name;
    $('#planName').addEventListener('input', (e) => { scene.meta.name = e.target.value; });
    $('#planName').addEventListener('change', () => scene.commit());
  }

  // ------------------------------------------------------------------ hint / toast
  hint(text, sticky) {
    const el = $('#hint');
    clearTimeout(this._ht);
    if (!text) { el.classList.remove('show'); return; }
    el.textContent = text; el.classList.add('show');
    if (!sticky) this._ht = setTimeout(() => el.classList.remove('show'), 1400);
  }
  toast(m) {
    const t = $('#toast'); t.textContent = m; t.classList.add('show');
    clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('show'), 2200);
  }

  // ------------------------------------------------------------------ top bar
  buildTopbar() {
    const ed = this.ed, sc = this.scene;
    const btn = (ic, title, fn, cls = 'icon-btn') => h('button', { class: cls, title, html: icon(ic), onclick: fn });
    $('#tbFile').append(h('button', { class: 'btn', html: icon('tpl') + '<span>Templates</span>', onclick: () => this.openModal() }));
    this.btnUndo = btn('undo', 'Undo (Ctrl+Z)', () => sc.undo());
    this.btnRedo = btn('redo', 'Redo (Ctrl+Shift+Z)', () => sc.redo());
    $('#tbHistory').append(this.btnUndo, this.btnRedo);

    $('#viewSeg').addEventListener('click', (e) => { const m = e.target.dataset.mode; if (m) ed.setMode(m); });
    this.btnRotL = btn('rotL', 'Rotate view left (Q)', () => ed.rotateView(-90));
    this.btnRotR = btn('rotR', 'Rotate view right (E)', () => ed.rotateView(90));
    this.btnGrid = btn('grid', 'Toggle grid (G)', () => { sc.meta.grid = !sc.meta.grid; sc.commit(); ed.invalidate(); this.syncView(); });
    this.btnSnap = btn('magnet', 'Snap to grid', () => { sc.meta.snap = sc.meta.snap ? 0 : 0.5; sc.commit(); this.syncView(); this.renderProps(); });
    this.btnStyle = btn('style', 'Toggle outline / soft drawing style', () => { sc.meta.style = sc.meta.style === 'outline' ? 'soft' : 'outline'; sc.commit(); ed.invalidate(); this.syncView(); this.renderProps(); });
    $('#tbView').append(this.btnRotL, this.btnRotR, this.btnGrid, this.btnSnap, this.btnStyle);

    const expBtn = h('button', { class: 'btn primary', html: icon('download') + '<span>Export</span>', onclick: (e) => this.exportMenu(e.currentTarget) });
    $('#tbExport').append(expBtn);

    $('#btnLeft').innerHTML = icon('panelL'); $('#btnRight').innerHTML = icon('panelR');
    $('#btnLeft').onclick = () => { $('#left').classList.toggle('open'); $('#right').classList.remove('open'); };
    $('#btnRight').onclick = () => { $('#right').classList.toggle('open'); $('#left').classList.remove('open'); };

    document.addEventListener('pointerdown', (e) => { if (this.menu && !this.menu.contains(e.target) && !e.target.closest('.btn.primary')) this.closeMenu(); });
  }

  closeMenu() { if (this.menu) { this.menu.remove(); this.menu = null; } }
  exportMenu(anchor) {
    if (this.menu) { this.closeMenu(); return; }
    const r = anchor.getBoundingClientRect();
    const item = (ic, label, fn) => h('button', { html: icon(ic) + `<span>${label}</span>`, onclick: () => { this.closeMenu(); fn(); } });
    const m = h('div', { class: 'menu' },
      item('image', 'Download PNG image', () => this.exportPNG()),
      item('print', 'Print / save as PDF', () => this.exportPrint()),
      h('hr'),
      item('file', 'Save plan (.json)', () => this.exportJSON()),
      item('upload', 'Open plan (.json)', () => $('#fileOpen').click()),
    );
    m.style.top = r.bottom + 6 + 'px'; m.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    document.body.append(m);
    this.menu = m;
  }
  fileName(ext) { return (this.scene.meta.name || 'plan').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase() + '.' + ext; }
  download(blob, name) {
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  exportPNG() {
    const cv = this.ed.renderToCanvas(2600);
    cv.toBlob((b) => { this.download(b, this.fileName('png')); this.toast('PNG exported'); }, 'image/png');
  }
  exportPrint() {
    const cv = this.ed.renderToCanvas(2000);
    const w = window.open('', '_blank');
    if (!w) { this.toast('Pop-up blocked – allow pop-ups to print'); return; }
    w.document.write(`<title>${this.scene.meta.name}</title><style>@page{size:landscape;margin:10mm}body{margin:0;font:600 18px Inter,system-ui,sans-serif}img{width:100%}h1{font-size:20px;margin:0 0 8px}</style><h1>${this.scene.meta.name}</h1><img src="${cv.toDataURL('image/png')}" onload="setTimeout(()=>print(),200)">`);
    w.document.close();
  }
  exportJSON() {
    const blob = new Blob([this.scene.snapshot()], { type: 'application/json' });
    this.download(blob, this.fileName('json'));
    this.toast('Plan saved');
  }
  importJSON(file) {
    const rd = new FileReader();
    rd.onload = () => {
      try { this.scene.load(rd.result); this.scene.commit(); this.ed.setSelection([]); this.ed.fitView(); this.toast('Plan loaded'); } catch (e) { this.toast('Could not read that file'); }
    };
    rd.readAsText(file);
  }

  syncHistory() { this.btnUndo.disabled = !this.scene.canUndo; this.btnRedo.disabled = !this.scene.canRedo; }
  syncView() {
    const ed = this.ed, sc = this.scene;
    document.querySelectorAll('#viewSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === ed.cam.mode));
    this.btnRotL.disabled = this.btnRotR.disabled = false;
    this.btnGrid.classList.toggle('on', !!sc.meta.grid);
    this.btnSnap.classList.toggle('on', !!sc.meta.snap);
    this.btnStyle.classList.toggle('on', sc.meta.style === 'soft');
    const z = $('#zoomLabel'); if (z) z.textContent = Math.round((ed.cam.zoom / 18) * 100) + '%';
  }
  syncTools() {
    document.querySelectorAll('#toolbar [data-tool]').forEach((b) => b.classList.toggle('on', b.dataset.tool === this.ed.tool));
  }

  // ------------------------------------------------------------------ floating toolbars
  buildToolbar() {
    const ed = this.ed;
    const tb = $('#toolbar');
    const t = (ic, tool, title) => h('button', { class: 'icon-btn', 'data-tool': tool, title, html: icon(ic), onclick: () => ed.setTool(tool) });
    tb.append(t('select', 'select', 'Select / move (V)'), t('hand', 'hand', 'Pan (H or hold Space)'), h('div', { class: 'tb-sep', style: 'width:100%;height:1px;margin:2px 0' }), t('poly', 'polyzone', 'Draw a zone polygon'), t('road', 'path', 'Draw a road / path'));
    const zb = $('#zoomBox');
    zb.append(
      h('button', { class: 'icon-btn', title: 'Zoom out', html: icon('minus'), onclick: () => ed.zoomBy(1 / 1.25) }),
      h('span', { class: 'zl', id: 'zoomLabel' }, '100%'),
      h('button', { class: 'icon-btn', title: 'Zoom in', html: icon('plus'), onclick: () => ed.zoomBy(1.25) }),
      h('button', { class: 'icon-btn', title: 'Fit venue (F frames selection)', html: icon('fit'), onclick: () => ed.fitView() }),
    );
  }

  // ------------------------------------------------------------------ library
  buildLibrary() {
    const list = $('#assetList');
    const groups = paletteByCat();
    const pending = [];
    this.cards = [];
    for (const [cat, items] of groups) {
      if (!items.length) continue;
      const wrap = h('div', { class: 'cat' });
      const head = h('button', { class: 'cat-h', html: icon('chev') + `<span>${cat}</span>`, onclick: () => wrap.classList.toggle('closed') });
      const cards = h('div', { class: 'cards' });
      for (const it of items) {
        const card = h('div', { class: 'card' + (it.tool ? ' tool' : ''), draggable: !it.tool, title: it.name, 'data-id': it.id },
          h('canvas', { width: 1, height: 1 }), h('span', {}, it.name));
        card.addEventListener('click', () => { this.ed.addPreset(it.id); this.ed.cv.focus(); if (window.innerWidth <= 820) $('#left').classList.remove('open'); });
        card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/venuely', it.id); e.dataTransfer.setData('text/plain', it.id); e.dataTransfer.effectAllowed = 'copy'; });
        cards.append(card);
        pending.push({ card, it });
        this.cards.push({ card, it, wrap });
      }
      wrap.append(head, cards);
      list.append(wrap);
    }
    // render thumbnails in small batches so the UI stays responsive
    let i = 0;
    const step = () => {
      const t0 = performance.now();
      while (i < pending.length && performance.now() - t0 < 12) {
        const { card, it } = pending[i++];
        try {
          const src = thumbCanvas(it.id, 84, 'iso', 'soft');
          const c = card.querySelector('canvas'); c.width = src.width; c.height = src.height;
          c.getContext('2d').drawImage(src, 0, 0);
        } catch (e) { console.warn('thumb failed', it.id, e); }
      }
      if (i < pending.length) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);

    $('#assetSearch').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      for (const { card, it, wrap } of this.cards) {
        const hit = !q || it.name.toLowerCase().includes(q) || ASSETS[it.asset].cat.toLowerCase().includes(q) || it.asset.includes(q);
        card.style.display = hit ? '' : 'none';
      }
      document.querySelectorAll('.cat').forEach((c) => { const any = [...c.querySelectorAll('.card')].some((x) => x.style.display !== 'none'); c.style.display = any ? '' : 'none'; if (q) c.classList.remove('closed'); });
    });
  }

  buildTabs() {
    const tabs = $('#leftTabs');
    tabs.addEventListener('click', (e) => {
      const t = e.target.dataset.tab; if (!t) return;
      tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.target));
      document.querySelectorAll('.tabpane').forEach((p) => p.classList.toggle('on', p.id === 'pane' + t[0].toUpperCase() + t.slice(1)));
      if (t === 'summary') this.renderSummary();
      if (t === 'layers') this.renderLayers();
    });
  }

  buildDnD() {
    const st = $('#stage'), mask = $('#dropMask');
    st.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('text/venuely')) { e.preventDefault(); mask.classList.add('on'); } });
    st.addEventListener('dragleave', (e) => { if (e.target === st || e.target === mask) mask.classList.remove('on'); });
    st.addEventListener('drop', (e) => {
      e.preventDefault(); mask.classList.remove('on');
      const id = e.dataTransfer.getData('text/venuely'); if (!id) return;
      const r = this.ed.cv.getBoundingClientRect();
      this.ed.addPreset(id, this.ed.cam.unproject(e.clientX - r.left, e.clientY - r.top));
    });
    $('#fileOpen').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) this.importJSON(f); e.target.value = ''; });
  }

  // ------------------------------------------------------------------ layers
  renderLayers() {
    const pane = $('#paneLayers'), ed = this.ed, sc = this.scene;
    pane.innerHTML = '';
    if (!sc.objects.length) { pane.append(h('div', { class: 'empty' }, 'Nothing here yet.', h('br'), 'Add items from the library.')); return; }
    for (const o of sc.objects.slice().reverse()) {
      const a = ASSETS[o.type];
      const n = a.world ? 1 : layoutOf(o).els.length;
      const row = h('div', { class: 'layer' + (ed.sel.has(o.id) ? ' sel' : ''), onclick: (e) => { if (e.shiftKey) { const s = new Set(ed.sel); s.has(o.id) ? s.delete(o.id) : s.add(o.id); ed.setSelection([...s]); } else ed.setSelection([o.id]); } },
        h('i', { class: 'sw', style: `background:${o.color || '#cbd5e1'}` }),
        h('div', { class: 'nm' }, o.name, n > 1 ? h('small', {}, '×' + n) : null),
        h('button', { class: 'icon-btn' + (o.locked ? ' on' : ''), title: o.locked ? 'Unlock' : 'Lock', html: icon(o.locked ? 'lock' : 'unlock'), onclick: (e) => { e.stopPropagation(); o.locked = !o.locked; sc.commit(); this.renderLayers(); } }),
        h('button', { class: 'icon-btn' + (o.hidden ? ' on' : ''), title: o.hidden ? 'Show' : 'Hide', html: icon(o.hidden ? 'eyeOff' : 'eye'), onclick: (e) => { e.stopPropagation(); o.hidden = !o.hidden; sc.commit(); ed.invalidate(); this.renderLayers(); } }),
      );
      pane.append(row);
    }
  }

  // ------------------------------------------------------------------ summary
  renderSummary() {
    const pane = $('#paneSummary'), s = this.scene.summary();
    pane.innerHTML = '';
    const total = s.rows.reduce((t, r) => t + r.n, 0);
    pane.append(h('div', { class: 'sum-head' },
      h('div', { class: 'stat' }, h('b', {}, String(s.seats)), h('span', {}, 'Seats')),
      h('div', { class: 'stat' }, h('b', {}, String(total)), h('span', {}, 'Items')),
      h('div', { class: 'stat' }, h('b', {}, `${this.scene.meta.venue.w}×${this.scene.meta.venue.d}`), h('span', {}, 'Venue (m)'))));
    if (!s.rows.length) { pane.append(h('div', { class: 'empty' }, 'Add items to see a bill of quantities for your plan.')); return; }
    let cat = '';
    for (const r of s.rows) {
      if (r.cat !== cat) { cat = r.cat; pane.append(h('div', { class: 'sum-cat' }, cat)); }
      pane.append(h('div', { class: 'sum-row' }, h('span', {}, r.name), h('b', {}, String(r.n))));
    }
  }

  // ------------------------------------------------------------------ properties
  sync() { for (const fn of this.syncers) fn(); }

  renderProps() {
    const root = $('#props'), ed = this.ed, sc = this.scene;
    // keep scroll position when rebuilding in place
    const sp = $('#right').scrollTop;
    root.innerHTML = '';
    this.syncers = [];
    const sel = ed.selected;
    if (!sel.length) this.planPanel(root);
    else if (sel.length > 1) this.multiPanel(root, sel);
    else this.objectPanel(root, sel[0]);
    $('#right').scrollTop = sp;
  }

  // --- field builders
  row(label, ...els) { return h('div', { class: 'row' }, h('label', {}, label), h('div', { style: 'display:flex;gap:6px;align-items:center;min-width:0' }, ...els)); }

  numInput(get, set, { min = -1e6, max = 1e6, step = 0.1, after } = {}) {
    const inp = h('input', { type: 'number', step, min, max, style: 'width:100%' });
    const refresh = () => { if (document.activeElement !== inp) inp.value = round(get(), 3); };
    refresh(); this.syncers.push(refresh);
    inp.addEventListener('input', () => {
      const v = parseFloat(inp.value);
      if (isNaN(v)) return;
      set(clamp(v, min, max));
      if (after) after();
      this.ed.invalidate(); this.sync();
    });
    inp.addEventListener('change', () => { inp.value = round(get(), 3); this.scene.commit(); this.renderSummary(); });
    return inp;
  }
  switchInput(get, set, onchange) {
    const inp = h('input', { type: 'checkbox' });
    inp.checked = !!get();
    inp.addEventListener('change', () => { set(inp.checked); this.scene.commit(); this.ed.invalidate(); if (onchange) onchange(); });
    return h('span', { class: 'switch' }, inp, h('i'));
  }
  selInput(get, set, opts, onchange = () => this.renderProps()) {
    const s = h('select', {}, opts.map(([v, l]) => h('option', { value: v }, l)));
    s.value = get();
    s.addEventListener('change', () => { set(s.value); this.ed.invalidate(); this.scene.commit(); onchange(); });
    return s;
  }
  colorInput(get, set, { palette, optional } = {}) {
    const inp = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(get()) ? get() : '#cccccc' });
    inp.addEventListener('input', () => { set(inp.value); this.ed.invalidate(); });
    inp.addEventListener('change', () => { this.scene.commit(); this.renderLayers(); });
    const wrap = h('div', { class: 'colorline' }, inp);
    if (optional) wrap.append(h('button', { class: 'btn', style: 'height:26px;padding:0 8px;font-size:11px', title: 'Use the surface default', onclick: () => { set(''); this.scene.commit(); this.ed.invalidate(); this.renderProps(); } }, 'Default'));
    if (palette) for (const c of palette) wrap.append(h('button', { class: 'sw-chip', style: `background:${c}`, title: c, onclick: () => { set(c); inp.value = c; this.scene.commit(); this.ed.invalidate(); this.renderLayers(); } }));
    return wrap;
  }
  textInput(get, set, placeholder = '') {
    const inp = h('input', { type: 'text', value: get() || '', placeholder, spellcheck: 'false' });
    inp.addEventListener('input', () => { set(inp.value); this.ed.invalidate(); });
    inp.addEventListener('change', () => { this.scene.commit(); this.renderLayers(); });
    return inp;
  }

  // --- panels
  planPanel(root) {
    const sc = this.scene, ed = this.ed, m = sc.meta;
    root.append(h('div', { class: 'sec' }, h('h3', {}, 'Plan settings'), h('div', { class: 'sub' }, 'Nothing selected – click an object to edit it.')));
    const venue = h('div', { class: 'sec' }, h('h4', {}, 'Venue'),
      this.row('Width (m)', this.numInput(() => m.venue.w, (v) => { m.venue.w = v; }, { min: 5, max: 500, step: 1 })),
      this.row('Depth (m)', this.numInput(() => m.venue.d, (v) => { m.venue.d = v; }, { min: 5, max: 500, step: 1 })),
      this.row('Ground', this.selInput(() => m.ground, (v) => { m.ground = v; }, Object.entries(GROUNDS).map(([k, v]) => [k, v.name]), () => { })));
    root.append(venue);
    const view = h('div', { class: 'sec' }, h('h4', {}, 'Display'),
      this.row('Show grid', this.switchInput(() => m.grid, (v) => { m.grid = v; }, () => this.syncView())),
      this.row('Snap to grid', this.selInput(() => String(m.snap), (v) => { m.snap = parseFloat(v); }, [['0', 'Off'], ['0.1', '0.1 m'], ['0.25', '0.25 m'], ['0.5', '0.5 m'], ['1', '1 m']], () => this.syncView())),
      this.row('Drawing style', this.selInput(() => m.style, (v) => { m.style = v; }, [['outline', 'Outlined (blueprint)'], ['soft', 'Soft (no outlines)']], () => this.syncView())));
    root.append(view);
    root.append(h('div', { class: 'sec' }, h('h4', {}, 'Shortcuts'),
      h('div', { class: 'shortcuts' },
        h('span', { class: 'kbd' }, '2 / 3'), 'Flat / isometric view',
        h('span', { class: 'kbd' }, 'Q / E'), 'Rotate isometric view',
        h('span', { class: 'kbd' }, 'Space+drag'), 'Pan (or middle mouse)',
        h('span', { class: 'kbd' }, 'Scroll'), 'Zoom to cursor',
        h('span', { class: 'kbd' }, 'R'), 'Rotate selection 15°',
        h('span', { class: 'kbd' }, 'Ctrl+D'), 'Duplicate',
        h('span', { class: 'kbd' }, 'Arrows'), 'Nudge (Shift = 1 m)',
        h('span', { class: 'kbd' }, '[ / ]'), 'Send back / forward',
        h('span', { class: 'kbd' }, 'Del'), 'Delete',
      ),
      h('p', { class: 'hintp' }, 'Tip: drag the edge handles of a chair block to add rows & columns instantly.')));
  }

  multiPanel(root, sel) {
    const ed = this.ed;
    root.append(h('div', { class: 'sec' }, h('h3', {}, `${sel.length} objects selected`), h('div', { class: 'sub' }, 'Shift-click to add or remove items.')));
    const al = (ic, t, k) => h('button', { class: 'icon-btn', title: t, html: icon(ic), onclick: () => ed.align(k) });
    root.append(h('div', { class: 'sec' }, h('h4', {}, 'Align'),
      h('div', { class: 'btnrow' }, al('alL', 'Align left', 'left'), al('alCx', 'Align centre horizontally', 'cx'), al('alR', 'Align right', 'right'), al('alT', 'Align top', 'top'), al('alCy', 'Align middle', 'cy'), al('alB', 'Align bottom', 'bottom'), al('dx', 'Distribute horizontally', 'dx'), al('dy', 'Distribute vertically', 'dy'))));
    root.append(this.actionsSection());
  }

  actionsSection() {
    const ed = this.ed, sc = this.scene;
    const b = (ic, label, fn, cls = 'btn') => h('button', { class: cls, html: icon(ic) + label, onclick: fn });
    const lockAll = ed.selected.every((o) => o.locked);
    return h('div', { class: 'sec' }, h('h4', {}, 'Arrange'),
      h('div', { class: 'btnrow' },
        b('copy', 'Duplicate', () => ed.duplicate()),
        b('front', 'Forward', () => ed.reorder('forward')),
        b('back', 'Backward', () => ed.reorder('backward')),
        b(lockAll ? 'unlock' : 'lock', lockAll ? 'Unlock' : 'Lock', () => { ed.selected.forEach((o) => { o.locked = !lockAll; }); sc.commit(); this.renderProps(); this.renderLayers(); }),
        b('trash', 'Delete', () => ed.deleteSelected(), 'btn danger')));
  }

  objectPanel(root, o) {
    const a = ASSETS[o.type], ed = this.ed, sc = this.scene;
    const touch = () => sc.touch(o);
    const flags = resizeFlags(o);

    // header
    const head = h('div', { class: 'sec' }, h('h3', {}, a.name), h('div', { class: 'sub' }, a.cat));
    head.append(h('div', { style: 'height:10px' }),
      this.row('Name', this.textInput(() => o.name, (v) => { o.name = v; })));
    if (o.type === 'label') head.append(this.row('Text', this.textInput(() => o.label, (v) => { o.label = v; touch(); })));
    else {
      head.append(this.row('Show label', this.switchInput(() => o.showLabel, (v) => { o.showLabel = v; }, () => this.renderProps())));
      if (o.showLabel) head.append(this.row('Label text', this.textInput(() => o.label, (v) => { o.label = v; }, o.name)));
    }
    root.append(head);

    // transform
    const tr = h('div', { class: 'sec' }, h('h4', {}, 'Transform'));
    if (!a.world) {
      tr.append(
        this.row('Position X', this.numInput(() => o.x, (v) => { o.x = v; }, { step: 0.25 })),
        this.row('Position Y', this.numInput(() => o.y, (v) => { o.y = v; }, { step: 0.25 })),
        this.row('Rotation °', this.numInput(() => o.rot, (v) => { o.rot = v; }, { min: -360, max: 360, step: 5 })));
    }
    const arrLabel = o.arr ? ' (each)' : '';
    if (a.round && (flags.w || flags.d)) {
      tr.append(this.row('Diameter' + arrLabel, this.numInput(() => o.w, (v) => { o.w = o.d = v; touch(); if (a.onChange) a.onChange(o, 'w'); }, { min: 0.2, max: 100, step: 0.1 })));
    } else {
      if (flags.w) tr.append(this.row((o.type === 'truss' ? 'Length' : 'Width') + arrLabel, this.numInput(() => o.w, (v) => { o.w = v; touch(); if (a.onChange) a.onChange(o, 'w'); }, { min: 0.1, max: 200, step: 0.1 })));
      if (flags.d) tr.append(this.row('Depth' + arrLabel, this.numInput(() => o.d, (v) => { o.d = v; touch(); if (a.onChange) a.onChange(o, 'd'); }, { min: 0.1, max: 200, step: 0.1 })));
    }
    if (flags.h) tr.append(this.row('Height' + arrLabel, this.numInput(() => o.h, (v) => { o.h = v; touch(); }, { min: 0.1, max: 50, step: 0.1 })));
    if (!a.world && !a.ground && !flags.w && !flags.d && !flags.h) tr.append(h('p', { class: 'hintp' }, 'This item has a fixed size.'));
    if (a.world) tr.append(h('p', { class: 'hintp' }, 'Drag the round handles on the canvas to move points. Drag the small dots between points to add one; Alt-click a point to delete it.'));
    root.append(tr);

    // appearance
    const vis = a.schema.filter((f) => !f.show || f.show(o));
    if (vis.length) {
      const ap = h('div', { class: 'sec' }, h('h4', {}, 'Appearance'));
      for (const f of vis) ap.append(this.schemaRow(o, f, a));
      root.append(ap);
    }

    // array modifier
    if (!a.world && !a.ground) root.append(this.arraySection(o));

    root.append(this.actionsSection());
  }

  schemaRow(o, f, a) {
    const top = f.k === 'color' || f.k === 'color2';
    const get = () => (top ? o[f.k] : o.p[f.k]);
    const set = (v) => { if (top) o[f.k] = v; else o.p[f.k] = v; this.scene.touch(o); if (a.onChange) a.onChange(o, f.k); };
    let ctl;
    if (f.t === 'num') ctl = this.numInput(get, (v) => { set(v); }, { min: f.min, max: f.max, step: f.step, after: () => { } });
    else if (f.t === 'sel') ctl = this.selInput(get, set, f.o);
    else if (f.t === 'bool') ctl = this.switchInput(get, set, () => this.renderProps());
    else if (f.t === 'color') ctl = this.colorInput(get, set, { palette: (o.type === 'zone' || o.type === 'polyzone') && f.k === 'color' ? ZONE_PALETTE : null, optional: f.optional });
    else ctl = this.textInput(get, set);
    if (f.t === 'num') {
      // numeric props that rewrite sizes (sofa seats, truss elevation …) need the size fields refreshed
      const inp = ctl; inp.addEventListener('change', () => this.renderProps());
    }
    return this.row(f.l, ctl);
  }

  arraySection(o) {
    const sc = this.scene, ed = this.ed;
    const sec = h('div', { class: 'sec' });
    const on = !!o.arr;
    sec.append(h('h4', {}, 'Array modifier', this.switchInput(() => !!o.arr, (v) => {
      if (v) {
        const gap = o.type === 'chair' ? 0.1 : o.type === 'bench' ? 0.4 : 1.0;
        o.arr = { ...DEFAULT_ARRAY, cols: o.type === 'chair' ? 6 : 3, rows: o.type === 'chair' ? 4 : 2, gx: gap, gy: o.type === 'chair' ? 0.35 : gap };
      } else o.arr = null;
      sc.touch(o);
    }, () => this.renderProps())));
    if (!on) { sec.append(h('p', { class: 'hintp' }, 'Repeat this item in rows & columns, around a circle, or in a fan. Perfect for chair blocks, tables, trees and barriers.')); return sec; }
    const A = o.arr, touch = () => sc.touch(o);
    const n = (k, min, max, step) => this.numInput(() => A[k], (v) => { A[k] = k === 'cols' || k === 'rows' || k === 'count' || k === 'blockX' || k === 'blockY' ? Math.round(v) : v; touch(); }, { min, max, step, after: () => this.updateArrTotal && this.updateArrTotal() });
    sec.append(this.row('Layout', this.selInput(() => A.mode, (v) => { A.mode = v; A.start = 0; if (v === 'circle') { A.sweep = 360; A.radius = o.type === 'chair' ? 1.6 : 3; A.count = Math.max(A.count, 8); } if (v === 'arc') { A.sweep = 110; A.radius = 5; A.rows = Math.min(A.rows, 6); A.cols = Math.min(A.cols, 8); } touch(); }, [['grid', 'Grid (rows × columns)'], ['circle', 'Circle / ring'], ['arc', 'Fan (curved rows)']])));
    if (A.mode === 'grid') {
      sec.append(this.row('Columns', n('cols', 1, 200, 1)), this.row('Rows', n('rows', 1, 200, 1)),
        this.row('Gap across (m)', n('gx', -0.5, 20, 0.05)), this.row('Gap down (m)', n('gy', -0.5, 20, 0.05)),
        this.row('Aisle every N cols', n('blockX', 0, 100, 1)), A.blockX > 0 ? this.row('Aisle width (m)', n('aisleX', 0, 10, 0.1)) : null,
        this.row('Aisle every N rows', n('blockY', 0, 100, 1)), A.blockY > 0 ? this.row('Aisle width (m)', n('aisleY', 0, 10, 0.1)) : null);
    } else if (A.mode === 'circle') {
      sec.append(this.row('Count', n('count', 1, 300, 1)), this.row('Radius (m)', n('radius', 0.3, 80, 0.1)), this.row('Start angle °', n('start', -360, 360, 5)), this.row('Sweep °', n('sweep', 10, 360, 5)),
        this.row('Facing', this.selInput(() => A.face, (v) => { A.face = v; touch(); }, [['in', 'Toward centre'], ['out', 'Away from centre'], ['none', 'Same direction']], () => { })));
    } else {
      sec.append(this.row('Rows', n('rows', 1, 60, 1)), this.row('Seats in first row', n('cols', 1, 100, 1)), this.row('Inner radius (m)', n('radius', 1, 100, 0.5)),
        this.row('Row gap (m)', n('gy', -0.3, 10, 0.05)), this.row('Fan angle °', n('sweep', 10, 340, 5)), this.row('Rotate fan °', n('start', -360, 360, 5)));
    }
    const total = h('p', { class: 'hintp' });
    this.updateArrTotal = () => { const l = layoutOf(o); total.textContent = `Total: ${l.els.length} items · ${round(l.w, 2)} × ${round(l.d, 2)} m`; };
    this.updateArrTotal(); this.syncers.push(this.updateArrTotal);
    sec.append(total, h('p', { class: 'hintp' }, 'Tip: drag the edge handles on the canvas to add or remove rows and columns.'));
    return sec;
  }

  // ------------------------------------------------------------------ templates
  buildModal() {
    const modal = $('#modal'), grid = $('#tplGrid');
    $('#modalClose').onclick = () => this.closeModal();
    modal.addEventListener('pointerdown', (e) => { if (e.target === modal) this.closeModal(); });
    const items = [{ id: 'blank', name: 'Blank plot', desc: 'Start from an empty venue and build from scratch.' }, ...TEMPLATES];
    this.tplItems = items;
    for (const t of items) {
      const cv = h('canvas', { width: 480, height: 300 });
      const card = h('button', { class: 'tpl', onclick: () => this.applyTemplate(t.id) }, cv, h('div', { class: 'meta' }, h('b', {}, t.name), h('span', {}, t.desc)));
      grid.append(card);
      t._canvas = cv;
    }
    this.modalRendered = false;
  }
  openModal() {
    $('#modal').hidden = false;
    if (!this.modalRendered) {
      this.modalRendered = true;
      let i = 0;
      const step = () => {
        const t = this.tplItems[i++]; if (!t) return;
        this.renderTemplatePreview(t);
        setTimeout(step, 16);
      };
      step();
    }
  }
  closeModal() { $('#modal').hidden = true; }
  renderTemplatePreview(t) {
    const s = new Scene();
    if (t.build) t.build(s);
    const cv = t._canvas, r = new Renderer(cv), cam = new Camera();
    const v = s.meta.venue;
    cam.fit([[0, 0, 0], [v.w, 0, 0], [v.w, v.d, 0], [0, v.d, 0], [0, 0, 8], [v.w, v.d, 8]], cv.width, cv.height, 14);
    r.draw(s, cam, { style: 'outline', grid: false, tags: false, dpr: 1 });
  }
  applyTemplate(id, { silent } = {}) {
    const sc = this.scene, ed = this.ed;
    const t = this.tplItems.find((x) => x.id === id) || TEMPLATES.find((x) => x.id === id);
    const fresh = new Scene();
    if (t && t.build) t.build(fresh);
    sc.load(fresh.serialize());
    sc.undoStack = []; sc.redoStack = [];
    sc.head = sc.snapshot(); sc.save();
    ed.setSelection([]);
    ed.cam.mode = t && t.mode ? t.mode : 'iso'; ed.cam.yaw = 0;
    ed.fitView();
    this.closeModal();
    this.syncView(); this.syncHistory();
    if (!silent) this.toast(t && t.build ? `Loaded “${t.name}” – everything is editable` : 'New blank plan');
  }
}
