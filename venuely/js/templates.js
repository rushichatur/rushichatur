// Starter layouts. They are built from the exact same objects a user can place by
// hand, so every piece stays fully editable (resize, array, recolour …).

import { presetObject } from './scene.js';

function kit(s) {
  const add = (id, x, y, o = {}) => { const ob = presetObject(id, o); ob.x = x; ob.y = y; s.add(ob); return ob; };
  const zone = (x, y, w, d, color, label, o = {}) => add('zone', x, y, { w, d, color, label, name: label, showLabel: true, ...o });
  const poly = (pts, color, label, o = {}) => s.add(presetObject('polyzone', { pts, color, label, name: label, showLabel: true, ...o }));
  const road = (pts, width, surface = 'asphalt', o = {}) => s.add(presetObject('path', { pts, name: 'Road', p: { surface, width }, ...o }));
  const text = (x, y, label, color = '#1f2937', o = {}) => add('label', x, y, { label, name: label, color, color2: '#ffffff', ...o });
  const trees = (x, y, n, gap, vertical = true, o = {}) => add('tree', x, y, { arr: { mode: 'grid', cols: vertical ? 1 : n, rows: vertical ? n : 1, gx: gap, gy: gap }, name: 'Tree line', ...o });
  return { add, zone, poly, road, text, trees };
}

// ---------------------------------------------------------------------------
function wedding(s) {
  s.meta = { ...s.meta, name: 'Garden wedding', venue: { w: 56, d: 42 }, ground: 'grass' };
  const { add, zone, poly, road, text, trees } = kit(s);

  road([[17, 42], [17, 26]], 3.2, 'paver', { name: 'Entrance path' });
  road([[17, 33], [34, 33], [34, 26]], 2.4, 'paver', { name: 'Path to reception' });
  road([[0, 40], [56, 40]], 4.5, 'asphalt', { name: 'Access road' });

  zone(17, 17, 24, 25, '#ff9ec7', 'Ceremony lawn', { p: { opacity: 0.22 } });
  zone(42, 17, 22, 25, '#ffd43b', 'Reception', { p: { opacity: 0.18 } });

  add('mandap', 17, 6.5, { name: 'Mandap' });
  add('flowerbed', 11.5, 10.2, { w: 3.4, d: 1.1 }); add('flowerbed', 22.5, 10.2, { w: 3.4, d: 1.1 });
  add('carpet', 17, 19, { rot: 90, w: 17, d: 1.6, name: 'Aisle carpet' });
  add('chair_rows', 13.9, 18.4, { arr: { cols: 6, rows: 9 }, name: 'Guest chairs (left)', p: { style: 'padded' }, color: '#f1ede4', color2: '#e0d9c8' });
  add('chair_rows', 20.1, 18.4, { arr: { cols: 6, rows: 9 }, name: 'Guest chairs (right)', p: { style: 'padded' }, color: '#f1ede4', color2: '#e0d9c8' });
  add('planter', 15.4, 10.3, { name: 'Planter' }); add('planter', 18.6, 10.3, { name: 'Planter' });
  add('gate_floral', 17, 29, { name: 'Floral arch' });
  add('hedge', 28, 1.2, { w: 56, name: 'Back hedge' });

  // reception
  add('dancefloor', 42, 10.5, { w: 8, d: 6.4, name: 'Dance floor' });
  add('dj_booth', 42, 5.3, { name: 'DJ booth' });
  add('speaker', 36.6, 5.2, { name: 'Speaker' }); add('speaker', 47.4, 5.2, { name: 'Speaker' });
  add('table_round', 42, 22.5, { arr: { cols: 3, rows: 2, gx: 1.2, gy: 1.2 }, name: 'Guest tables', p: { seats: 8 } });
  add('food_stall', 52, 15.2, { rot: 90, name: 'Catering', p: { text: 'FOOD' } });
  add('food_stall', 52, 20.2, { rot: 90, name: 'Dessert', p: { text: 'SWEETS' }, color: '#ec7fb0' });
  add('bar', 52.3, 27, { rot: 90, w: 4, name: 'Bar', p: { stools: 3 } });
  add('sofa_l', 33.4, 36, { rot: 0, name: 'Lounge sofa', p: { wing: 'right' } });
  add('coffee_table', 36.2, 36.4, { name: 'Coffee table' });
  add('umbrella', 40.5, 36.4, { name: 'Parasol' });
  add('kiosk_info', 50, 33.6, { name: 'Photo booth', color2: '#ec7fb0', p: { text: 'PHOTO' }, w: 2.2, d: 2.2 });
  zone(40, 36.2, 13, 7, '#ffa94d', 'Lounge', { p: { opacity: 0.18 } });

  add('parking', 14, 37.4, { arr: { rows: 6 }, rot: 90, name: 'Guest parking', color: '#6aa6e8' });
  add('car', 26, 37.8, { name: 'Car', color: '#f0883e' });
  trees(2.5, 21, 7, 4.5, true, { name: 'Trees (west)' });
  trees(54, 7, 3, 4, true, { name: 'Trees (east)' });
  add('pine', 31, 4, { name: 'Pine' }); add('pine', 5, 4, { name: 'Pine' });
  add('bush', 4, 36, { arr: { cols: 4, rows: 1, gx: 2, gy: 0 } });
}

// ---------------------------------------------------------------------------
function concert(s) {
  s.meta = { ...s.meta, name: 'Open-air concert', venue: { w: 90, d: 62 }, ground: 'grass' };
  const { add, zone, poly, road, text, trees } = kit(s);

  road([[0, 59], [90, 59]], 6, 'asphalt', { name: 'Main road' });
  road([[45, 59], [45, 50]], 7, 'paver', { name: 'Entrance walkway' });
  road([[45, 49], [75, 49], [75, 40]], 3, 'paver', { name: 'Food court path' });

  zone(45, 25, 26, 9, '#ff6b6b', 'Front pit', { p: { opacity: 0.24 } });
  zone(45, 40, 44, 14, '#4dabf7', 'General admission', { p: { opacity: 0.2 } });
  zone(16, 28, 20, 18, '#da77f2', 'VIP lounge', { p: { opacity: 0.22 } });
  zone(75, 33, 22, 18, '#ffd43b', 'Food court', { p: { opacity: 0.22 } });

  // stage + rig
  add('stage', 45, 9, { w: 26, d: 11, h: 1.6, name: 'Main stage', p: { backdrop: 'led', backH: 6.5, text: 'LIVE 2026' } });
  add('truss_portal', 45, 13.8, { w: 28, h: 8.5, name: 'Front truss', p: { shape: 'portal', lights: 14, rainbow: true, beams: true, lightType: 'moving' } });
  add('truss_straight', 45, 6, { w: 24, d: 0.3, h: 7.5, name: 'Rear truss', p: { shape: 'straight', elev: 7.2, lights: 9, lightType: 'par', lightColor: '#4cc9f0' } });
  add('led_screen', 25.5, 15, { w: 7, h: 5, name: 'Left screen', rot: 0 }); add('led_screen', 64.5, 15, { w: 7, h: 5, name: 'Right screen' });
  add('speaker', 28.5, 9.5, { w: 1, d: 0.9, h: 4, name: 'PA left' }); add('speaker', 61.5, 9.5, { w: 1, d: 0.9, h: 4, name: 'PA right' });
  add('fence', 45, 19.2, { w: 28, name: 'Pit barrier' });
  add('fence', 45, 30.2, { w: 28, name: 'Mid barrier', p: { style: 'crowd' } });

  // FOH
  add('marquee', 45, 47.2, { w: 7, d: 5, h: 3.8, name: 'FOH tent', p: { roofStyle: 'gable', walls: 'back' } });
  add('truss_square', 45, 44.2, { w: 7, d: 4, h: 4.2, name: 'FOH rig', p: { lights: 0 } });

  // VIP
  add('fence', 16, 18.6, { w: 20, name: 'VIP fence', p: { style: 'rope' } }); add('fence', 16, 37.4, { w: 20, name: 'VIP fence', p: { style: 'rope' } });
  add('sofa_l', 9.4, 24, { rot: 90, name: 'VIP sofa', color: '#6b46c1', color2: '#9f7aea' });
  add('sofa3', 22, 24, { rot: -90, name: 'VIP sofa', color: '#6b46c1', color2: '#9f7aea' });
  add('table_cocktail', 12.5, 31.5, { arr: { cols: 4, rows: 1, gx: 1.6, gy: 0 }, name: 'Cocktail tables' });
  add('bar', 16, 35.5, { w: 5, rot: 180, name: 'VIP bar', p: { stools: 4 } });

  // food court
  add('food_stall', 75, 28, { arr: { cols: 4, rows: 1, gx: 0.4, gy: 0 }, name: 'Food stalls', p: { text: 'EAT' } });
  add('table_rect', 75, 36, { arr: { cols: 3, rows: 1, gx: 1.4, gy: 0 }, w: 2.2, name: 'Picnic tables', p: { seatsLong: 3 } });
  add('food_truck', 84.2, 40.5, { rot: -90, name: 'Food truck' });
  add('bar', 67, 41, { rot: 90, w: 5, name: 'Beer garden', p: { stools: 0 } });
  add('umbrella', 70, 31, { arr: { cols: 1, rows: 3, gx: 0, gy: 3.4 }, name: 'Parasols' });

  // services
  add('toilet_block', 83, 7.5, { rot: 90, name: 'Toilets', arr: { cols: 1, rows: 6, gx: 0, gy: 0.05 }, showLabel: true, label: 'Toilets' });
  add('kiosk_aid', 83, 18.5, { name: 'First aid', showLabel: true, label: 'First aid' });
  add('kiosk_ticket', 36.5, 55.2, { name: 'Ticket booth' }); add('kiosk_ticket', 53.5, 55.2, { name: 'Ticket booth' });
  add('gate', 45, 52, { w: 12, h: 6, name: 'Main gate', p: { text: 'WELCOME' } });
  add('fence', 22, 52, { w: 42, name: 'Perimeter' }); add('fence', 68, 52.0, { w: 14, name: 'Perimeter' });
  add('signpost', 40, 51, { name: 'Sign', p: { text: 'STAGE >' }, w: 1.6 });
  add('parking', 20, 61.5, { rot: 0, arr: { rows: 1, cols: 7, gx: 0.6, gy: 0 }, name: 'Parking', color: '#f0883e', w: 4.4 });
  trees(3, 30, 10, 5, true, { name: 'Tree line' });
  trees(87, 30, 10, 5, true, { name: 'Tree line' });
  add('pine', 8, 6, { arr: { cols: 4, rows: 1, gx: 3.2, gy: 0 }, name: 'Pines' });
  add('flag', 31.5, 20.5, {}); add('flag', 58.5, 20.5, {});
}

// ---------------------------------------------------------------------------
function gathering(s) {
  s.meta = { ...s.meta, name: 'Garden party', venue: { w: 38, d: 28 }, ground: 'grass' };
  const { add, zone, poly, road, text, trees } = kit(s);
  road([[0, 25.5], [38, 25.5]], 4, 'paver', { name: 'Path' });
  road([[19, 25.5], [19, 17]], 2.4, 'paver', { name: 'Path' });
  poly([[3, 3], [17, 2.5], [17, 14], [9, 15.5], [3, 12]], '#ffa94d', 'Lounge', { p: { opacity: 0.2 } });
  zone(28, 8.5, 15, 12, '#4dabf7', 'Dining', { p: { opacity: 0.18 } });
  zone(10, 21, 14, 6, '#69db7c', 'Games lawn', { p: { opacity: 0.2 } });

  add('sofa_l', 6.5, 6.8, { rot: 0, name: 'L sofa', p: { wing: 'left' }, color: '#e07a5f', color2: '#f2cc8f' });
  add('sofa3', 14, 9.5, { rot: 90, name: '3-seater', color: '#3d405b', color2: '#81b29a' });
  add('coffee_table', 9, 9.5, { w: 1.4, name: 'Coffee table' });
  add('pouf', 12.2, 13.6, { arr: { cols: 3, rows: 1, gx: 0.2, gy: 0 }, color: '#f2cc8f', name: 'Poufs' });
  add('umbrella', 15, 4.4, { name: 'Parasol' });

  add('canopy', 28, 7, { w: 4, d: 4, h: 3, color: '#f4d35e', color2: '#ffffff', p: { stripes: true }, name: 'Canopy' });
  add('table_rect', 28, 7, { w: 3.2, d: 1.0, name: 'Dining table', p: { seatsLong: 4, seatsEnd: 1 } });
  add('buffet', 28, 13.4, { w: 4, name: 'Buffet' });
  add('table_round', 34.5, 7, { name: 'Round table', p: { seats: 6 } });
  add('bar', 22, 12.5, { w: 3, name: 'Drinks', rot: 90, p: { stools: 2 } });

  add('table_cocktail', 11, 21, { arr: { cols: 3, rows: 1, gx: 1.6, gy: 0 }, name: 'High tables' });
  add('bench', 24, 22.3, { arr: { cols: 3, rows: 1, gx: 1.2, gy: 0 }, name: 'Benches' });
  add('tree', 3, 20, { w: 3.8, h: 5.5, name: 'Big tree' });
  trees(36, 23, 3, 3.5, false, { name: 'Trees' });
  add('hedge', 19, 0.8, { w: 38, name: 'Hedge' });
  add('flowerbed', 19, 15.6, { w: 4, d: 1.2, name: 'Flowers' });
  add('bush', 1.5, 3, { arr: { cols: 1, rows: 6, gx: 0, gy: 3.6 } });
}

// ---------------------------------------------------------------------------
function conference(s) {
  s.meta = { ...s.meta, name: 'Conference hall', venue: { w: 46, d: 32 }, ground: 'concrete' };
  const { add, zone, poly, road, text, trees } = kit(s);
  zone(23, 3.5, 24, 6, '#4dabf7', 'Presentation', { p: { opacity: 0.16 } });
  add('stage', 23, 4.2, { w: 14, d: 5, h: 0.7, name: 'Stage', color: '#505869', p: { backdrop: 'led', backH: 3.6, text: 'KEYNOTE', steps: true } });
  add('podium', 29.5, 5.6, { name: 'Podium' });
  add('table_rect', 18, 6.4, { w: 3, d: 0.8, name: 'Panel table', p: { seatsLong: 0 }, color: '#e7e9ee' });
  add('chair', 18, 7.6, { arr: { cols: 4, rows: 1, gx: 0.3, gy: 0 }, w: 0.5, d: 0.5, rot: 180, name: 'Panel chairs' });
  add('led_screen', 7, 3.6, { w: 3.5, h: 2.6, name: 'Side screen' }); add('led_screen', 39, 3.6, { w: 3.5, h: 2.6, name: 'Side screen' });

  zone(23, 17, 30, 14, '#ffd43b', 'Seating (theatre)', { p: { opacity: 0.12 } });
  add('chair_rows', 23, 17.2, { arr: { cols: 20, rows: 10, gx: 0.06, gy: 0.4, blockX: 10, aisleX: 1.6 }, name: 'Theatre seating', color: '#4a6fa5', color2: '#365888' });
  add('light_stand', 11, 10, { name: 'Light', p: { lights: 3, lightColor: '#ffd166' } });
  add('light_stand', 35, 10, { name: 'Light', p: { lights: 3, lightColor: '#ffd166' } });

  zone(8, 26.5, 12, 9, '#69db7c', 'Registration', { p: { opacity: 0.18 } });
  add('table_rect', 8, 27, { arr: { cols: 3, rows: 1, gx: 0.3, gy: 0 }, w: 1.8, d: 0.7, name: 'Desks', p: { seatsLong: 0 }, color: '#ffffff' });
  add('kiosk_info', 14.2, 28.8, { w: 1.8, d: 1.8, name: 'Info', p: { text: 'INFO' } });
  zone(38, 27, 14, 9, '#ff9ec7', 'Networking & coffee', { p: { opacity: 0.18 } });
  add('table_cocktail', 38, 27.2, { arr: { cols: 4, rows: 2, gx: 1.4, gy: 1.4 }, name: 'Cocktail tables' });
  add('buffet', 31, 30.4, { w: 3.2, name: 'Coffee station' });
  add('sofa2', 25, 30, { name: 'Lounge', color: '#3d405b', color2: '#81b29a', rot: 180 });
  add('planter', 1.2, 14, { arr: { cols: 1, rows: 6, gx: 0, gy: 3.5 }, name: 'Plants' });
  add('planter', 44.8, 14, { arr: { cols: 1, rows: 6, gx: 0, gy: 3.5 }, name: 'Plants' });
  add('gate_truss', 23, 31, { w: 7, h: 3.4, name: 'Entrance', p: { style: 'truss', text: 'ENTRANCE' }, color: '#3a4150' });
}

// ---------------------------------------------------------------------------
function festival(s) {
  s.meta = { ...s.meta, name: 'Mini festival', venue: { w: 72, d: 52 }, ground: 'grass' };
  const { add, zone, poly, road, text, trees } = kit(s);
  road([[0, 49], [72, 49]], 5, 'asphalt', { name: 'Road' });
  road([[36, 49], [36, 40], [14, 40], [14, 23]], 3.4, 'paver', { name: 'Promenade' });
  road([[36, 40], [58, 40], [58, 24]], 3.4, 'paver', { name: 'Promenade' });
  road([[14, 31], [36, 31]], 2.6, 'paver', { name: 'Cross path' });

  zone(21, 12, 36, 18, '#ff6b6b', 'Main stage', { p: { opacity: 0.18 } });
  add('stage', 21, 8.5, { w: 22, d: 9, h: 1.4, name: 'Main stage', p: { backdrop: 'led', backH: 5.5, text: 'FEST' } });
  add('truss_portal', 21, 13.4, { w: 24, h: 7.5, p: { shape: 'portal', lights: 12, rainbow: true, lightType: 'par', beams: true }, name: 'Stage truss' });
  add('speaker', 8.5, 9, { w: 0.9, d: 0.8, h: 3.5 }); add('speaker', 33.5, 9, { w: 0.9, d: 0.8, h: 3.5 });
  add('chair_rows', 21, 21, { arr: { cols: 18, rows: 3, gx: 0.06, gy: 0.4 }, name: 'Front seating', color: '#f6c445', color2: '#e0a82e' });

  zone(57, 9, 22, 14, '#748ffc', 'Cyber zone', { p: { opacity: 0.2 } });
  add('dome', 52, 8.5, { w: 7, h: 3.6, name: 'Gaming dome' }); add('dome', 61.5, 8.5, { w: 6, h: 3.2, name: 'Tech dome', color2: '#38d9a9' });
  add('marquee', 56.6, 17, { w: 14, d: 5, h: 3.6, name: 'Esports tent', p: { roofStyle: 'gable', walls: 'back' } });

  zone(55, 33, 24, 15, '#ffd43b', 'Food court', { p: { opacity: 0.22 } });
  add('food_stall', 55, 29, { arr: { cols: 4, rows: 1, gx: 0.5, gy: 0 }, name: 'Food stalls', color: '#f0883e' });
  add('table_rect', 55, 36, { arr: { cols: 3, rows: 2, gx: 1.4, gy: 1.8 }, w: 2.2, name: 'Picnic tables', p: { seatsLong: 3 } });
  add('food_truck', 66, 43.5, { name: 'Food truck', color: '#2bb3a6' });

  zone(12, 38, 22, 11, '#da77f2', 'Merch & souvenirs', { p: { opacity: 0.2 } });
  add('canopy', 12, 34, { arr: { cols: 4, rows: 1, gx: 0.8, gy: 0 }, name: 'Merch stalls', color: '#e64980', color2: '#fff', p: { stripes: true } });
  add('table_rect', 12, 34.2, { arr: { cols: 4, rows: 1, gx: 2.0, gy: 0 }, w: 2, d: 0.7, p: { seatsLong: 0 }, name: 'Merch tables', color: '#fff' });

  zone(8.5, 27, 11, 8, '#38d9a9', 'Chill zone', { p: { opacity: 0.2 } });
  add('pouf', 8.5, 27, { arr: { mode: 'circle', count: 6, radius: 2.2 }, name: 'Poufs', color: '#f2b84b' });
  add('umbrella', 8.5, 27, { name: 'Parasol', color: '#ec7fb0' });
  add('kiosk_aid', 3.5, 34, { name: 'First aid', showLabel: true, label: 'First aid' });
  add('toilet_block', 70, 28, { name: 'Toilets', arr: { cols: 1, rows: 4, gx: 0, gy: 0.05 }, rot: 90, showLabel: true, label: 'WC' });
  add('gate', 36, 45.2, { w: 12, h: 6.5, name: 'Entrance', p: { text: 'FEST 2026' }, color: '#3b82f6' });
  add('fence', 36, 46.5, { w: 72, name: 'Perimeter', p: { style: 'picket' }, color: '#fff', h: 1.1 });
  add('signpost', 29, 44, { p: { text: 'MAIN STAGE' } }); add('signpost', 44, 44, { p: { text: 'FOOD' }, color: '#f08c00' });
  trees(2, 18, 6, 5, true, { name: 'Trees' }); trees(70, 20, 4, 5, true, { name: 'Trees' });
  trees(36, 1.5, 7, 6, false, { name: 'Trees', kind: 'pine', p: { kind: 'pine' }, color: '#3f9a58', h: 5, w: 2.4 });
}

export const TEMPLATES = [
  { id: 'wedding', name: 'Garden wedding', desc: 'Mandap, aisle & chair blocks, reception tables, dance floor, lounge, parking.', build: wedding },
  { id: 'concert', name: 'Open-air concert', desc: 'Main stage with truss & lights, pit barriers, GA / VIP zones, food court, toilets, gate.', build: concert },
  { id: 'gathering', name: 'Garden party / gathering', desc: 'Lounge sofas, canopies, buffet, dining and game areas for a relaxed get-together.', build: gathering },
  { id: 'conference', name: 'Conference hall', desc: 'Stage with LED screens, theatre seating with aisles, registration and networking.', build: conference },
  { id: 'festival', name: 'Mini festival', desc: 'Stage, cyber dome zone, food court, merch row, chill area and promenade paths.', build: festival },
];
