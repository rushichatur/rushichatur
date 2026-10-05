// Map background: picks the imagery needed to cover the venue and describes where each
// image sits (in metres, in the map's own east / south frame). The renderer then draws the
// images flat on the ground plane, so the map works in 2D and in isometric view.

const TILE = 256;
const KEY_STORE = 'venuely.gmapsKey';

export const PROVIDERS = {
  none: { name: 'No map' },
  google: {
    name: 'Google Maps', needsKey: true, maxZoom: 20, attribution: 'Map data © Google',
    types: [['satellite', 'Satellite'], ['hybrid', 'Satellite + labels'], ['roadmap', 'Streets'], ['terrain', 'Terrain']],
  },
  esri: { name: 'Esri satellite', free: true, maxZoom: 19, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' },
  osm: { name: 'OpenStreetMap', free: true, maxZoom: 19, attribution: '© OpenStreetMap contributors', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' },
};

export const MAP_DEFAULTS = { provider: 'none', type: 'satellite', lat: null, lng: null, place: '', rot: 0, ox: 0, oy: 0, opacity: 1, zoom: 0 };

export function getKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch (e) { return ''; } }
export function setKey(k) { try { localStorage.setItem(KEY_STORE, k.trim()); } catch (e) { /* ignore */ } }

// ---- Web Mercator ------------------------------------------------------------
export const metresPerPx = (lat, z) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;
export function toPx(lat, lng, z) {
  const s = TILE * 2 ** z, sin = Math.sin((lat * Math.PI) / 180);
  return [((lng + 180) / 360) * s, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s];
}
export function fromPx(x, y, z) {
  const s = TILE * 2 ** z, n = Math.PI - (2 * Math.PI * y) / s;
  return [(180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), (x / s) * 360 - 180];
}

export function isActive(map) {
  return !!(map && map.provider && map.provider !== 'none' && map.lat != null && map.lng != null);
}

/** Bounding box (east/south metres from the map centre) that must be covered, venue + 12 % margin. */
function neededExtent(map, venue) {
  const m = 1.24;
  const hw = (venue.w * m) / 2, hd = (venue.d * m) / 2;
  const a = (-map.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  let minE = Infinity, maxE = -Infinity, minS = Infinity, maxS = -Infinity;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = -map.ox + sx * hw, y = -map.oy + sy * hd; // relative to the map centre, world frame
    const e = x * c - y * s, so = x * s + y * c;
    minE = Math.min(minE, e); maxE = Math.max(maxE, e); minS = Math.min(minS, so); maxS = Math.max(maxS, so);
  }
  return { minE, maxE, minS, maxS };
}

const planCache = new Map();

/**
 * @returns {null | {zoom:number, items:{url:string,x0:number,y0:number,w:number,h:number}[], needsKey:boolean}}
 * Item rectangles are in metres, relative to the map centre (x = east, y = south).
 */
export function planMap(map, venue) {
  if (!isActive(map)) return null;
  const key = JSON.stringify([map, venue.w, venue.d, map.provider === 'google' ? getKey() : '']);
  if (planCache.has(key)) return planCache.get(key);
  const P = PROVIDERS[map.provider];
  const ext = neededExtent(map, venue);
  let plan;

  if (map.provider === 'google') {
    const apiKey = getKey();
    const half = Math.max(Math.abs(ext.minE), Math.abs(ext.maxE), Math.abs(ext.minS), Math.abs(ext.maxS));
    let z = map.zoom || 10;
    if (!map.zoom) for (z = P.maxZoom; z > 10; z--) if (640 * metresPerPx(map.lat, z) >= 2 * half) break;
    z = Math.min(z, P.maxZoom);
    const cover = 640 * metresPerPx(map.lat, z);
    const url = `https://maps.googleapis.com/maps/api/staticmap?center=${map.lat},${map.lng}&zoom=${z}&size=640x640&scale=2&maptype=${map.type || 'satellite'}&key=${encodeURIComponent(apiKey)}`;
    plan = { zoom: z, needsKey: !apiKey, items: apiKey ? [{ url, x0: -cover / 2, y0: -cover / 2, w: cover, h: cover }] : [] };
  } else {
    const maxZ = P.maxZoom;
    const [cx, cy] = [0, 0];
    let z = map.zoom || maxZ, tiles = [];
    const build = (zz) => {
      const mpp = metresPerPx(map.lat, zz), [px, py] = toPx(map.lat, map.lng, zz);
      const t0x = Math.floor((px + ext.minE / mpp) / TILE), t1x = Math.floor((px + ext.maxE / mpp) / TILE);
      const t0y = Math.floor((py + ext.minS / mpp) / TILE), t1y = Math.floor((py + ext.maxS / mpp) / TILE);
      const n = 2 ** zz, out = [];
      for (let ty = t0y; ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) {
        if (ty < 0 || ty >= n) continue;
        const wx = ((tx % n) + n) % n;
        out.push({ url: P.url.replace('{z}', zz).replace('{x}', wx).replace('{y}', ty), x0: (tx * TILE - px) * mpp, y0: (ty * TILE - py) * mpp, w: TILE * mpp, h: TILE * mpp });
      }
      return out;
    };
    if (map.zoom) tiles = build(z);
    else for (z = maxZ; z >= 8; z--) { tiles = build(z); if (tiles.length <= 30) break; }
    plan = { zoom: z, needsKey: false, items: tiles };
  }
  if (planCache.size > 40) planCache.clear();
  planCache.set(key, plan);
  return plan;
}

// ---- image loading -----------------------------------------------------------------
const images = new Map();
let listener = () => {};
export function onMapImage(fn) { listener = fn; }

export function imageFor(url) {
  let e = images.get(url);
  if (!e) {
    e = { state: 'loading', img: new Image() };
    e.img.crossOrigin = 'anonymous'; // keeps the canvas exportable when the server allows CORS
    e.img.onload = () => { e.state = 'ok'; listener(); };
    e.img.onerror = () => { e.state = 'error'; listener(); };
    e.img.src = url;
    images.set(url, e);
  }
  return e;
}

export function mapStatus(map, venue) {
  const plan = planMap(map, venue);
  if (!plan) return { state: 'off' };
  if (plan.needsKey) return { state: 'nokey' };
  let ok = 0, err = 0, loading = 0;
  for (const it of plan.items) { const e = images.get(it.url); if (!e || e.state === 'loading') loading++; else if (e.state === 'ok') ok++; else err++; }
  return { state: err && !ok ? 'error' : loading ? 'loading' : 'ok', ok, err, loading, zoom: plan.zoom, total: plan.items.length };
}

export function attributionFor(map) { return (PROVIDERS[map.provider] || {}).attribution || ''; }

// ---- place search (OpenStreetMap Nominatim, no key) ------------------------------------
export async function searchPlace(q) {
  const m = q.trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (m) return [{ name: `${(+m[1]).toFixed(5)}, ${(+m[2]).toFixed(5)}`, lat: +m[1], lng: +m[2] }];
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('Search failed (' + r.status + ')');
  return (await r.json()).map((x) => ({ name: x.display_name, lat: +x.lat, lng: +x.lon }));
}
