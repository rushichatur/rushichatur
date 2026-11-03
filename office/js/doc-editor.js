/* Word-style document editor built on a contenteditable "page". */
'use strict';

const DocEditor = (() => {
  const { $ } = Util;
  let page, current = null, dirty = false, saveTimer = null;

  /* ---------- Sanitising loaded HTML ---------- */
  const DROP = 'script,style,iframe,object,embed,link,meta,form,input,button,textarea,select,frame,frameset,base';
  function sanitize(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll(DROP).forEach(n => n.remove());
    doc.body.querySelectorAll('*').forEach(el => {
      for (const a of [...el.attributes]) {
        const n = a.name.toLowerCase();
        if (n.startsWith('on') || n === 'contenteditable' || n === 'srcdoc') el.removeAttribute(a.name);
        else if ((n === 'href' || n === 'src' || n === 'xlink:href') && /^\s*(javascript|vbscript|data:text)/i.test(a.value)) el.removeAttribute(a.name);
      }
    });
    return doc.body.innerHTML;
  }

  function textToHtml(text) {
    return text.split(/\r?\n/).map(l => `<p>${Util.esc(l) || '<br>'}</p>`).join('');
  }

  /* ---------- Opening ---------- */
  async function open(entry) {
    current = entry;
    $('#doc-title').value = Util.baseName(entry.name);
    let html = '';
    if (entry.html != null) {
      html = entry.html;
    } else if (entry.data) {
      const ext = Util.extOf(entry.name);
      if (ext === 'docx') {
        try {
          html = await DocxReader.toHtml(entry.data);
        } catch (e) {
          // Fallback: mammoth reads more unusual files but drops colours/sizes/alignment
          console.warn('DocxReader failed, using mammoth', e);
          const res = await mammoth.convertToHtml({ arrayBuffer: entry.data }, {
            styleMap: ["u => u", "strike => s", "p[style-name='Title'] => h1:fresh", "p[style-name='Subtitle'] => h2:fresh"],
          });
          html = res.value;
        }
        if (!html.trim()) html = '<p><br></p>';
      } else if (ext === 'txt') {
        html = textToHtml(new TextDecoder().decode(entry.data));
      } else if (ext === 'html' || ext === 'htm') {
        html = new TextDecoder().decode(entry.data);
      }
    }
    page.innerHTML = sanitize(html || '<p><br></p>');
    page.querySelectorAll('.page-break').forEach(el => el.setAttribute('contenteditable', 'false'));
    dirty = false;
    updateStatus();
    $('#doc-scroll').scrollTop = 0;
    if (entry.html == null) await persist(); // make it show up in Recent straight away
  }

  function newDoc() {
    return open({ id: Util.newId(), name: 'Document.docx', kind: 'doc', html: '<p><br></p>' });
  }

  /* ---------- Autosave to Recent (on this device only) ---------- */
  function markDirty() {
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 1500);
    updateStatusSoon();
  }
  async function persist() {
    if (!current) return;
    clearTimeout(saveTimer);
    current.html = page.innerHTML;
    current.name = fileName('docx');
    current.kind = 'doc';
    delete current.data;
    await Util.recent.put(current);
    dirty = false;
  }

  function fileName(ext) { return Util.baseName($('#doc-title').value) + '.' + ext; }

  /* ---------- Formatting ---------- */
  function exec(cmd, val = null) {
    page.focus();
    document.execCommand('styleWithCSS', false, true);
    document.execCommand(cmd, false, val);
    markDirty();
    refreshToolbar();
  }

  function refreshToolbar() {
    for (const b of document.querySelectorAll('#doc-toolbar [data-exec]')) {
      const c = b.dataset.exec;
      if (['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList', 'justifyCenter', 'justifyRight', 'justifyFull'].includes(c)) {
        let on = false;
        try { on = document.queryCommandState(c); } catch {}
        b.classList.toggle('on', on);
      }
    }
    let blk = '';
    try { blk = (document.queryCommandValue('formatBlock') || '').toLowerCase(); } catch {}
    const sel = $('#doc-block');
    sel.value = ['h1', 'h2', 'h3', 'blockquote'].includes(blk) ? blk : 'p';
  }

  let statusTimer;
  function updateStatusSoon() { clearTimeout(statusTimer); statusTimer = setTimeout(updateStatus, 400); }
  function updateStatus() {
    const text = page.innerText || '';
    const words = (text.match(/\S+/g) || []).length;
    $('#doc-status').textContent = `${words.toLocaleString()} words · ${text.replace(/\s/g, '').length.toLocaleString()} characters${dirty ? ' · editing' : ' · saved on device'}`;
  }

  async function insertTable() {
    const v = await Util.form('Insert table', [
      { name: 'rows', label: 'Rows', value: 3, type: 'number', min: 1, max: 100 },
      { name: 'cols', label: 'Columns', value: 3, type: 'number', min: 1, max: 20 },
    ], 'Insert');
    if (!v) return;
    const r = Math.max(1, Math.min(100, +v.rows || 3)), c = Math.max(1, Math.min(20, +v.cols || 3));
    const row = '<tr>' + '<td><br></td>'.repeat(c) + '</tr>';
    restoreSel();
    exec('insertHTML', `<table><tbody>${row.repeat(r)}</tbody></table><p><br></p>`);
  }

  async function insertLink() {
    saveSel();
    const v = await Util.form('Insert link', [{ name: 'url', label: 'Web address', value: 'https://' }], 'Insert');
    if (!v || !v.url || v.url === 'https://') return;
    const url = /^(https?:|mailto:)/i.test(v.url) ? v.url : 'https://' + v.url;
    restoreSel();
    const sel = window.getSelection();
    if (sel.isCollapsed) exec('insertHTML', `<a href="${Util.esc(url)}">${Util.esc(url)}</a>`);
    else exec('createLink', url);
  }

  function shrinkImage(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const url = r.result;
        if (file.size < 1.2e6 || !/jpe?g|png|webp/.test(file.type)) return resolve(url);
        const img = new Image();
        img.onload = () => {
          const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.width * scale); cv.height = Math.round(img.height * scale);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          resolve(cv.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => resolve(url);
        img.src = url;
      };
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }

  let savedRange = null;
  function saveSel() {
    const s = window.getSelection();
    if (s.rangeCount && page.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange();
  }
  function restoreSel() {
    page.focus();
    if (savedRange) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(savedRange); }
  }

  /* ---------- Find & replace ---------- */
  function textNodes() {
    const out = [];
    const w = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) out.push(w.currentNode);
    return out;
  }
  function findNext() {
    const q = $('#find-text').value;
    if (!q) return false;
    const ql = q.toLowerCase();
    const nodes = textNodes();
    const sel = window.getSelection();
    let startNode = null, startOff = 0;
    if (sel.rangeCount && page.contains(sel.focusNode)) {
      const r = sel.getRangeAt(0);
      startNode = r.endContainer; startOff = r.endOffset;
    }
    let started = !startNode || startNode.nodeType !== 3;
    for (let pass = 0; pass < 2; pass++) {
      for (const n of nodes) {
        let from = 0;
        if (!started) { if (n !== startNode) continue; started = true; from = startOff; }
        const i = n.nodeValue.toLowerCase().indexOf(ql, from);
        if (i >= 0) {
          const r = document.createRange();
          r.setStart(n, i); r.setEnd(n, i + q.length);
          sel.removeAllRanges(); sel.addRange(r);
          const el = n.parentElement;
          el && el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          return true;
        }
      }
      started = true; // wrap around
    }
    Util.toast('Not found');
    return false;
  }
  function replaceOne() {
    const q = $('#find-text').value;
    const sel = window.getSelection();
    if (q && sel.toString().toLowerCase() === q.toLowerCase() && page.contains(sel.anchorNode)) {
      document.execCommand('insertText', false, $('#replace-text').value);
      markDirty();
    }
    findNext();
  }
  function replaceAll() {
    const q = $('#find-text').value;
    if (!q) return;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const rep = $('#replace-text').value;
    let count = 0;
    for (const n of textNodes()) {
      const v = n.nodeValue.replace(re, () => { count++; return rep; });
      if (v !== n.nodeValue) n.nodeValue = v;
    }
    if (count) markDirty();
    Util.toast(count ? `Replaced ${count}` : 'Not found');
  }

  /* ---------- Saving ---------- */
  async function exportBlob(kind) {
    const title = $('#doc-title').value;
    if (kind === 'docx') return DocxWriter.toBlob(page, title);
    if (kind === 'txt') return new Blob([page.innerText], { type: 'text/plain' });
    if (kind === 'html') {
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${Util.esc(title)}</title>` +
        `<style>body{font:16px/1.5 Calibri,Arial,sans-serif;max-width:800px;margin:40px auto;padding:0 20px}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 6px}img{max-width:100%}</style>` +
        `</head><body>${page.innerHTML}</body></html>`;
      return new Blob([html], { type: 'text/html' });
    }
  }

  async function save(kind = 'docx') {
    try {
      const blob = await exportBlob(kind);
      await Util.saveBlob(blob, fileName(kind));
      await persist();
      updateStatus();
    } catch (e) {
      console.error(e);
      Util.toast('Save failed: ' + e.message);
    }
  }

  async function command(cmd) {
    $('#doc-menu').hidden = true;
    switch (cmd) {
      case 'save-docx': return save('docx');
      case 'save-html': return save('html');
      case 'save-txt': return save('txt');
      case 'save-pdf': await persist(); return window.print();
      case 'share': {
        const blob = await exportBlob('docx');
        return Util.shareBlob(blob, fileName('docx'));
      }
      case 'find':
        $('#doc-find').hidden = false;
        $('#find-text').focus();
        return;
      case 'count': {
        const text = page.innerText || '';
        const words = (text.match(/\S+/g) || []).length;
        const paras = page.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li').length;
        return Util.info('Word count', `<p>Words: <b>${words.toLocaleString()}</b><br>Characters (no spaces): <b>${text.replace(/\s/g, '').length.toLocaleString()}</b><br>Characters (with spaces): <b>${text.length.toLocaleString()}</b><br>Paragraphs: <b>${paras}</b></p>`);
      }
    }
  }

  function init() {
    page = $('#doc-page');
    document.execCommand('defaultParagraphSeparator', false, 'p');

    page.addEventListener('input', markDirty);
    document.addEventListener('selectionchange', () => {
      if (!$('#doc-view').hidden && page.contains(document.getSelection().anchorNode)) { saveSel(); refreshToolbar(); }
    });

    const tb = $('#doc-toolbar');
    tb.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); }); // keep text selection
    tb.addEventListener('click', e => {
      const b = e.target.closest('[data-exec]');
      if (b) exec(b.dataset.exec);
    });
    $('#doc-block').addEventListener('change', e => { restoreSel(); exec('formatBlock', '<' + e.target.value + '>'); });
    $('#doc-size').addEventListener('change', e => {
      if (e.target.value) { restoreSel(); exec('fontSize', e.target.value); }
      e.target.value = '';
    });
    $('#doc-color').addEventListener('input', e => { restoreSel(); exec('foreColor', e.target.value); });
    $('#doc-hilite').addEventListener('input', e => { restoreSel(); exec('hiliteColor', e.target.value); });
    $('#doc-table').addEventListener('click', () => { saveSel(); insertTable(); });
    $('#doc-link').addEventListener('click', insertLink);
    $('#doc-pagebreak').addEventListener('click', () => exec('insertHTML', '<div class="page-break" contenteditable="false"></div><p><br></p>'));
    $('#doc-image').addEventListener('click', () => { saveSel(); $('#doc-image-input').click(); });
    $('#doc-image-input').addEventListener('change', async e => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const url = await shrinkImage(f);
      restoreSel();
      exec('insertImage', url);
    });

    $('#doc-save').addEventListener('click', () => save('docx'));
    $('#doc-more').addEventListener('click', e => { e.stopPropagation(); $('#doc-menu').hidden = !$('#doc-menu').hidden; });
    $('#doc-menu').addEventListener('click', e => { const b = e.target.closest('[data-cmd]'); if (b) command(b.dataset.cmd); });
    $('#doc-title').addEventListener('change', markDirty);

    $('#find-next').addEventListener('click', findNext);
    $('#replace-one').addEventListener('click', replaceOne);
    $('#replace-all').addEventListener('click', replaceAll);
    $('#find-text').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); findNext(); } });
    $('#find-close').addEventListener('click', () => { $('#doc-find').hidden = true; });

    document.addEventListener('keydown', e => {
      if ($('#doc-view').hidden) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save('docx'); }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'h')) { e.preventDefault(); command('find'); }
    });
  }

  return { init, open, newDoc, persist, isDirty: () => dirty };
})();
