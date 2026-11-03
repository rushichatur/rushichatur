/* Shared helpers: toasts, dialogs, saving files, recent-files storage. */
'use strict';

const Util = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  let toastTimer;
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));
  }
  // Escape text for XML and drop characters XML 1.0 does not allow.
  function xml(s) {
    return esc(String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, ''));
  }

  /* Small modal form. fields: [{name,label,value,type}] -> resolves to values object or null. */
  function form(title, fields, okLabel = 'OK') {
    const dlg = $('#dialog');
    const f = $('#dialog-form');
    f.innerHTML = `<h3>${esc(title)}</h3>` +
      fields.map((fl, i) => `<label for="dlg-${i}">${esc(fl.label)}</label>
        <input id="dlg-${i}" name="${esc(fl.name)}" type="${fl.type || 'text'}" value="${esc(fl.value ?? '')}"
        ${fl.min != null ? `min="${fl.min}"` : ''} ${fl.max != null ? `max="${fl.max}"` : ''}>`).join('') +
      `<div class="actions"><button value="cancel" type="submit">Cancel</button>
       <button value="ok" class="primary" type="submit">${esc(okLabel)}</button></div>`;
    return new Promise(resolve => {
      dlg.onclose = () => {
        if (dlg.returnValue !== 'ok') return resolve(null);
        const out = {};
        fields.forEach((fl, i) => { out[fl.name] = $('#dlg-' + i).value; });
        resolve(out);
      };
      dlg.returnValue = '';
      dlg.showModal();
      const first = $('#dlg-0');
      if (first) { first.focus(); first.select?.(); }
    });
  }

  function info(title, html) {
    const dlg = $('#dialog');
    $('#dialog-form').innerHTML = `<h3>${esc(title)}</h3><div class="help">${html}</div>
      <div class="actions"><button value="ok" class="primary" type="submit">Close</button></div>`;
    dlg.onclose = null;
    dlg.showModal();
  }

  function confirmBox(title, msg, okLabel = 'OK') {
    const dlg = $('#dialog');
    $('#dialog-form').innerHTML = `<h3>${esc(title)}</h3><p>${esc(msg)}</p>
      <div class="actions"><button value="cancel" type="submit">Cancel</button>
      <button value="ok" class="primary" type="submit">${esc(okLabel)}</button></div>`;
    return new Promise(resolve => {
      dlg.onclose = () => resolve(dlg.returnValue === 'ok');
      dlg.returnValue = '';
      dlg.showModal();
    });
  }

  const MIME = {
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ods: 'application/vnd.oasis.opendocument.spreadsheet',
    csv: 'text/csv',
    txt: 'text/plain',
    html: 'text/html',
  };

  function baseName(name) { return String(name || 'Untitled').replace(/\.[^.]+$/, '').trim() || 'Untitled'; }
  function extOf(name) { const m = /\.([^.]+)$/.exec(name || ''); return m ? m[1].toLowerCase() : ''; }

  /* Save a Blob: use the native "Save as" picker where it exists (desktop Chrome/Edge),
     otherwise trigger a normal download (phones put it in Downloads). */
  async function saveBlob(blob, filename) {
    const ext = extOf(filename);
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: MIME[ext] ? [{ description: ext.toUpperCase() + ' file', accept: { [MIME[ext]]: ['.' + ext] } }] : undefined,
        });
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        toast('Saved ' + handle.name);
        return true;
      } catch (e) {
        if (e && e.name === 'AbortError') return false;
        // fall through to a plain download
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    toast('Saved to Downloads: ' + filename);
    return true;
  }

  async function shareBlob(blob, filename) {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename }); }
      catch (e) { if (e.name !== 'AbortError') toast('Could not share: ' + e.message); }
    } else {
      toast('Sharing is not supported here — saving instead');
      await saveBlob(blob, filename);
    }
  }

  /* ---------- Recent files (IndexedDB, stays on this device) ---------- */
  const DB_NAME = 'lite-office';
  let dbp;
  function db() {
    if (!dbp) {
      dbp = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore('recent', { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    }
    return dbp;
  }
  async function tx(mode, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction('recent', mode);
      const store = t.objectStore('recent');
      const r = fn(store);
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = () => reject(t.error);
    });
  }
  const MAX_RECENT = 15;
  const recent = {
    async list() {
      try {
        const all = await tx('readonly', s => s.getAll());
        return (all || []).sort((a, b) => b.date - a.date);
      } catch { return []; }
    },
    async get(id) { try { return await tx('readonly', s => s.get(id)); } catch { return null; } },
    // kind: 'doc' | 'sheet'; data: ArrayBuffer
    async put(entry) {
      try {
        entry.date = Date.now();
        await tx('readwrite', s => s.put(entry));
        const all = await recent.list();
        for (const old of all.slice(MAX_RECENT)) await recent.remove(old.id);
      } catch (e) { console.warn('recent.put failed', e); }
    },
    async remove(id) { try { await tx('readwrite', s => s.delete(id)); } catch {} },
    async clear() { try { await tx('readwrite', s => s.clear()); } catch {} },
  };

  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  // Normalise any CSS colour to "RRGGBB" (no #), or null for transparent/invalid.
  const cctx = document.createElement('canvas').getContext('2d');
  function hexColor(css) {
    if (!css) return null;
    css = String(css).trim();
    if (!css || css === 'transparent' || css === 'inherit' || css === 'initial') return null;
    cctx.fillStyle = '#000001';
    cctx.fillStyle = css;
    const v = cctx.fillStyle;
    if (v === '#000001' && !/^#?0{5}1$/i.test(css)) return null;
    if (v.startsWith('#')) return v.slice(1).toUpperCase();
    const m = /rgba?\(([^)]+)\)/.exec(v);
    if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x));
    if (p.length === 4 && p[3] === 0) return null;
    return p.slice(0, 3).map(n => Math.round(n).toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(file);
    });
  }

  return { $, toast, esc, xml, form, info, confirmBox, MIME, baseName, extOf, saveBlob, shareBlob, recent, newId, hexColor, readFile };
})();
