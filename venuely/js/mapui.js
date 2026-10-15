// Map background panel: choose a provider and place, then align the map under the layout.

import { h, round } from './util.js';
import { PROVIDERS, MAP_DEFAULTS, getKey, setKey, searchPlace, mapStatus, isActive } from './maps.js';

let panel = null;
let refresh = () => {};

export function closeMapDialog() { if (panel) { panel.remove(); panel = null; } }

export function openMapDialog(ui) {
  if (panel) { closeMapDialog(); return; }
  const sc = ui.scene, ed = ui.ed;
  if (!sc.meta.map) sc.meta.map = { ...MAP_DEFAULTS };
  const M = sc.meta.map;
  const live = () => { ed.invalidate(); };
  const done = () => { sc.commit(); ui.syncMapUI(); };

  panel = h('div', { class: 'map-panel' });
  document.body.append(panel);

  const field = (label, get, set, { min, max, step = 0.1, unit } = {}) => {
    const inp = h('input', { type: 'number', min, max, step });
    const sync = () => { if (document.activeElement !== inp) inp.value = round(get(), 2); };
    sync();
    inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (!isNaN(v)) { set(v); live(); } });
    inp.addEventListener('change', () => { inp.value = round(get(), 2); done(); });
    return { row: h('div', { class: 'row' }, h('label', {}, label + (unit ? ` (${unit})` : '')), inp), sync };
  };

  let statusEl, syncers = [];

  const render = () => {
    panel.innerHTML = '';
    syncers = [];
    const g = M.provider === 'google';
    const head = h('div', { class: 'map-head' },
      h('div', {}, h('b', {}, 'Map background'), h('span', {}, 'Plan on top of the real site')),
      h('button', { class: 'icon-btn', title: 'Close', onclick: closeMapDialog }, '✕'));

    // provider
    const opts = h('div', { class: 'opts' });
    for (const id of ['google', 'esri', 'osm']) {
      const P = PROVIDERS[id];
      opts.append(h('button', {
        class: 'opt' + (M.provider === id ? ' on' : ''), onclick: () => {
          M.provider = id; if (id !== 'google') M.type = 'satellite'; done(); live(); render();
        },
      }, h('b', {}, P.name), h('small', {}, P.needsKey ? 'Needs your API key' : 'Free, no key')));
    }

    const sec1 = h('div', { class: 'sec' }, h('h4', {}, '1 · Map source'), opts);
    if (g) {
      const key = h('input', { type: 'text', value: getKey(), placeholder: 'Paste your Google Maps API key', spellcheck: 'false', autocomplete: 'off' });
      key.addEventListener('input', () => { setKey(key.value); live(); refresh(); });
      const type = h('select', {}, PROVIDERS.google.types.map(([v, l]) => h('option', { value: v }, l)));
      type.value = M.type || 'satellite';
      type.addEventListener('change', () => { M.type = type.value; done(); live(); });
      sec1.append(
        h('div', { class: 'row', style: 'margin-top:10px' }, h('label', {}, 'API key'), key),
        h('div', { class: 'row' }, h('label', {}, 'Map type'), type),
        h('details', { class: 'steps' }, h('summary', {}, 'How to get a Google key'),
          h('ol', {},
            h('li', {}, 'Open Google Cloud Console and create or pick a project, then turn on billing (Google includes a monthly free credit).'),
            h('li', {}, 'Enable the “Maps Static API”.'),
            h('li', {}, 'Create an API key and restrict it to your site address (HTTP referrers) so nobody else can use it.'),
            h('li', {}, 'Paste the key above. It is stored only in this browser, never in saved plans.'))));
    } else sec1.append(h('p', { class: 'hintp' }, 'Works instantly without an account. For Google imagery choose Google Maps above.'));

    // location
    const q = h('input', { type: 'text', placeholder: 'Address, venue name, or “lat, lng”', spellcheck: 'false', value: '' });
    const results = h('div', { class: 'results' });
    const go = async () => {
      if (!q.value.trim()) return;
      results.innerHTML = '<div class="hintp">Searching…</div>';
      try {
        const list = await searchPlace(q.value);
        results.innerHTML = '';
        if (!list.length) results.innerHTML = '<div class="hintp">No match. Try a fuller address, or paste coordinates like 51.5007, -0.1246.</div>';
        for (const r of list) results.append(h('button', {
          class: 'res', onclick: () => {
            M.lat = r.lat; M.lng = r.lng; M.place = r.name.split(',').slice(0, 2).join(',');
            if (M.provider === 'none') M.provider = getKey() ? 'google' : 'esri';
            M.ox = 0; M.oy = 0; done(); live(); render();
          },
        }, r.name));
      } catch (e) { results.innerHTML = `<div class="hintp">${e.message}. Check your connection, or paste coordinates like 51.5007, -0.1246.</div>`; }
    };
    q.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    const sec2 = h('div', { class: 'sec' }, h('h4', {}, '2 · Location'),
      h('div', { class: 'searchrow' }, q, h('button', { class: 'btn primary', onclick: go }, 'Search')), results,
      isActive(M) || M.lat != null ? h('p', { class: 'hintp', style: 'margin-top:8px' }, `Centre: ${M.place ? M.place + ' · ' : ''}${(+M.lat).toFixed(5)}, ${(+M.lng).toFixed(5)}`) : h('p', { class: 'hintp' }, 'Tip: in Google Maps, right-click the spot and copy the coordinates, then paste them here.'));

    // adjust
    const sec3 = h('div', { class: 'sec' }, h('h4', {}, '3 · Align the layout'));
    const fields = [
      field('Rotate map', () => M.rot, (v) => { M.rot = v; }, { min: -180, max: 180, step: 1, unit: '°' }),
      field('Slide east–west', () => M.ox, (v) => { M.ox = v; }, { step: 1, unit: 'm' }),
      field('Slide north–south', () => M.oy, (v) => { M.oy = v; }, { step: 1, unit: 'm' }),
      field('Detail (zoom, 0 = auto)', () => M.zoom, (v) => { M.zoom = Math.max(0, Math.min(21, Math.round(v))); }, { min: 0, max: 21, step: 1 }),
    ];
    for (const f of fields) { sec3.append(f.row); syncers.push(f.sync); }
    const op = h('input', { type: 'range', min: 10, max: 100, step: 5, value: Math.round(M.opacity * 100) });
    op.addEventListener('input', () => { M.opacity = op.value / 100; live(); });
    op.addEventListener('change', done);
    sec3.append(h('div', { class: 'row' }, h('label', {}, 'Map strength'), op));
    sec3.append(h('div', { class: 'btnrow', style: 'margin-top:10px' },
      h('button', { class: 'btn', onclick: () => { closeMapDialog(); ed.setTool('map'); } }, 'Drag map on canvas'),
      h('button', { class: 'btn', onclick: () => { M.rot = 0; M.ox = 0; M.oy = 0; done(); live(); render(); } }, 'Reset position')));
    sec3.append(h('p', { class: 'hintp' }, 'Set the venue width and depth in Plan settings to match the real site. 1 m on the plan equals 1 m on the map.'));

    statusEl = h('div', { class: 'map-status' });
    const foot = h('div', { class: 'sec' }, statusEl, h('div', { class: 'btnrow', style: 'margin-top:8px' },
      h('button', { class: 'btn danger', onclick: () => { Object.assign(M, { ...MAP_DEFAULTS }); done(); live(); ui.renderProps(); render(); } }, 'Remove map'),
      h('button', { class: 'btn primary', onclick: closeMapDialog }, 'Done')));
    panel.append(head, sec1, sec2, ...(M.lat != null ? [sec3] : []), foot);
    refresh();
  };

  refresh = () => {
    if (!statusEl) return;
    syncers.forEach((f) => f());
    const st = mapStatus(M, sc.meta.venue);
    const txt = {
      off: M.lat == null ? 'Search for a location to show the map.' : 'Pick a map source above.',
      nokey: 'Add your Google Maps API key to load the map.',
      loading: 'Loading map…',
      error: M.provider === 'google' ? 'Google did not return a map. Check that the key is correct, the Maps Static API is enabled and billing is on.' : 'The map could not be loaded. Check your internet connection.',
      ok: `Map loaded · zoom ${st.zoom}.`,
    }[st.state];
    statusEl.textContent = txt;
    statusEl.dataset.state = st.state;
  };
  ed.on('mapstatus', () => refresh());
  ed.on('mapchange', () => refresh());
  render();
}
