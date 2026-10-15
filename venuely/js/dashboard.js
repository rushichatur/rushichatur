// Dashboard: the signed-in person's saved projects.

import { auth } from './auth.js';
import { cloud } from './cloud.js';
import { mountAccount, openAuthDialog } from './authui.js';
import { icon } from './icons.js';
import { h } from './util.js';
import { TEMPLATES } from './templates.js';

document.querySelectorAll('[data-i]').forEach((el) => { el.innerHTML = icon(el.dataset.i); });
const body = document.getElementById('body'), tools = document.getElementById('tools'), sub = document.getElementById('sub'), q = document.getElementById('q');
mountAccount(document.getElementById('acct'));

let projects = [];

function ago(ms) {
  if (!ms) return '';
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const hr = Math.round(m / 60); if (hr < 24) return `${hr} hour${hr > 1 ? 's' : ''} ago`;
  const d = Math.round(hr / 24); if (d < 30) return `${d} day${d > 1 ? 's' : ''} ago`;
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const stateCard = (iconName, title, text, actions, extra) => h('div', { class: 'state-card' },
  h('div', { class: 'ico', html: icon(iconName) }), h('h2', {}, title), h('p', {}, text), h('div', { class: 'cta-row' }, actions), extra);

function templateChips() {
  return h('div', { class: 'chips' }, TEMPLATES.map((t) => h('a', { class: 'chip', href: `app.html?template=${t.id}` }, t.name)));
}

function skeleton() { body.innerHTML = ''; body.append(h('div', { class: 'pgrid' }, [1, 2, 3, 4].map(() => h('div', { class: 'skel' })))); }

async function load() {
  await auth.init();
  tools.hidden = true;
  if (!auth.user) {
    sub.textContent = 'Sign in to see the projects you have saved.';
    body.innerHTML = '';
    body.append(stateCard('cube', 'Sign in to see your projects', 'Your saved layouts live here. You can design without an account, but saving and exporting need a free one.', [
      h('button', { class: 'btn primary lg', onclick: () => openAuthDialog({ mode: 'signin', onSuccess: load }) }, 'Sign in'),
      h('button', { class: 'btn lg', onclick: () => openAuthDialog({ mode: 'signup', onSuccess: load }) }, 'Create a free account'),
    ], h('p', { style: 'margin:22px 0 0;font-size:14px;color:var(--ink-3)' }, 'Just looking? ', h('a', { href: 'app.html', style: 'color:var(--accent);font-weight:600' }, 'Open the app without an account'))));
    return;
  }
  sub.textContent = 'Everything you have saved, newest first.';
  skeleton();
  try { projects = await cloud.list(); } catch (e) {
    body.innerHTML = '';
    body.append(stateCard('help', 'We could not load your projects', e.message || 'Check your connection and try again.', [h('button', { class: 'btn primary', onclick: load }, 'Try again')]));
    return;
  }
  render();
}

function render() {
  body.innerHTML = '';
  if (auth.backend === 'demo') body.append(h('p', { class: 'demo-note' }, h('b', {}, 'Demo mode. '), 'Projects are stored in this browser only. Add your Firebase keys (see README) to save them to your account.'));
  if (!projects.length) {
    tools.hidden = true;
    body.append(stateCard('cube', 'No projects yet', 'Start from a template or a blank plot. Your work is saved here automatically once you are signed in.', [
      h('a', { class: 'btn primary lg', href: 'app.html?new=1' }, 'Start a project'),
    ], templateChips()));
    return;
  }
  tools.hidden = false;
  const term = q.value.trim().toLowerCase();
  const shown = projects.filter((p) => !term || (p.name || '').toLowerCase().includes(term));
  const grid = h('div', { class: 'pgrid' });
  if (!term) grid.append(h('a', { class: 'newtile', href: 'app.html?new=1' }, h('i', { html: icon('plus') }), 'New project'));
  for (const p of shown) grid.append(card(p));
  body.append(grid);
  if (term && !shown.length) body.append(h('p', { style: 'color:var(--ink-3);text-align:center;margin-top:30px' }, `No project matches “${q.value}”.`));
}

function card(p) {
  const href = `app.html?p=${encodeURIComponent(p.id)}`;
  const info = h('div', { class: 'info' }, h('h3', {}, h('a', { href }, p.name || 'Untitled event')), h('small', {}, `Edited ${ago(p.updated)}${p.count ? ` · ${p.count} item${p.count > 1 ? 's' : ''}` : ''}`));
  const thumb = h('div', { class: 'thumb' + (p.thumb ? '' : ' empty') }, p.thumb ? h('img', { src: p.thumb, alt: '', loading: 'lazy' }) : null);
  const more = h('button', { class: 'icon-btn more', title: 'More', 'aria-label': 'Project options', html: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/></svg>' });
  const el = h('article', { class: 'pcard' }, thumb, h('div', { class: 'body' }, info, more));

  more.addEventListener('click', (e) => {
    e.stopPropagation();
    const r = more.getBoundingClientRect();
    const item = (ic, label, fn) => h('button', { class: 'menu-item', html: icon(ic) + `<span>${label}</span>`, onclick: () => { closeMenu(); fn(); } });
    openMenu(r, [
      h('a', { class: 'menu-item', href, html: icon('select') + '<span>Open</span>' }),
      item('text', 'Rename', () => rename(p, el, info)),
      item('copy', 'Duplicate', async () => { try { await cloud.duplicate(p.id); projects = await cloud.list(); render(); } catch (err) { alert(err.message); } }),
      h('hr'),
      item('trash', 'Delete', () => confirmDelete(p, el)),
    ]);
  });
  return el;
}

let menuEl = null;
function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } }
function openMenu(rect, items) {
  closeMenu();
  menuEl = h('div', { class: 'menu', role: 'menu' }, items);
  document.body.append(menuEl);
  menuEl.style.top = rect.bottom + 6 + 'px';
  menuEl.style.left = Math.max(8, Math.min(window.innerWidth - 248, rect.right - 230)) + 'px';
}
document.addEventListener('pointerdown', (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

function rename(p, el, info) {
  const inp = h('input', { class: 'rename', value: p.name || '', 'aria-label': 'Project name' });
  info.replaceChildren(inp, h('small', {}, 'Press Enter to save'));
  inp.focus(); inp.select();
  let done = false;
  const commit = async (save) => {
    if (done) return; done = true;
    const name = inp.value.trim();
    if (save && name && name !== p.name) { try { await cloud.rename(p.id, name); p.name = name; p.updated = Date.now(); } catch (e) { alert(e.message); } }
    projects = await cloud.list(); render();
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(true); if (e.key === 'Escape') commit(false); });
  inp.addEventListener('blur', () => commit(true));
}

function confirmDelete(p, el) {
  const box = h('div', { class: 'confirm' },
    h('div', {}, h('b', {}, 'Delete this project?'), h('div', { style: 'color:var(--ink-3);font-size:14px;margin-top:4px' }, 'This cannot be undone.')),
    h('div', { class: 'btnrow' },
      h('button', { class: 'btn', onclick: () => box.remove() }, 'Keep it'),
      h('button', { class: 'btn danger', onclick: async () => { try { await cloud.remove(p.id); projects = projects.filter((x) => x.id !== p.id); render(); } catch (e) { alert(e.message); } } }, 'Delete')));
  el.append(box);
}

q.addEventListener('input', render);
auth.onChange(() => load());
