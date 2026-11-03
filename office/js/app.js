/* App shell: home screen, recent files, opening files, navigation, install/offline. */
'use strict';

(() => {
  const { $ } = Util;
  const DOC_EXT = ['docx', 'txt', 'html', 'htm'];
  const SHEET_EXT = ['xlsx', 'xlsm', 'xls', 'csv', 'ods'];

  function show(view) {
    for (const id of ['home', 'doc-view', 'sheet-view']) $('#' + id).hidden = id !== view;
    $('#doc-menu').hidden = true;
    $('#sheet-menu').hidden = true;
  }

  async function goHome(push = true) {
    if (!$('#doc-view').hidden) await DocEditor.persist();
    if (!$('#sheet-view').hidden) await SheetEditor.persist();
    show('home');
    if (push && location.hash) history.pushState(null, '', location.pathname);
    renderRecent();
  }

  function enter(view) {
    show(view);
    history.pushState({ view }, '', '#' + (view === 'doc-view' ? 'doc' : 'sheet'));
  }

  async function openEntry(entry) {
    try {
      if (entry.kind === 'doc') { enter('doc-view'); await DocEditor.open(entry); }
      else { enter('sheet-view'); await SheetEditor.open(entry); }
      $('#toast').hidden = true;
    } catch (e) {
      console.error(e);
      Util.toast('Could not open this file: ' + (e.message || e));
      goHome();
    }
  }

  async function openFile(file) {
    const ext = Util.extOf(file.name);
    if (ext === 'doc') return Util.toast('Old .doc files are not supported — save it as .docx first');
    if (ext === 'ppt' || ext === 'pptx') return Util.toast('Presentations are not supported yet');
    const kind = DOC_EXT.includes(ext) ? 'doc' : SHEET_EXT.includes(ext) ? 'sheet' : null;
    if (!kind) return Util.toast('Unsupported file type: .' + ext);
    Util.toast('Opening ' + file.name + '…', 1200);
    const data = await Util.readFile(file);
    await openEntry({ id: Util.newId(), name: file.name, kind, data, origExt: ext });
  }

  /* ---------- Recent list ---------- */
  function ago(t) {
    const s = (Date.now() - t) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    return new Date(t).toLocaleDateString();
  }
  async function renderRecent() {
    const list = await Util.recent.list();
    const ul = $('#recent-list');
    ul.innerHTML = '';
    $('#recent-empty').hidden = list.length > 0;
    $('#btn-clear-recent').hidden = !list.length;
    for (const e of list) {
      const li = document.createElement('li');
      li.innerHTML = `<span class="r-ico">${e.kind === 'doc' ? '📝' : '📊'}</span>
        <span class="r-name">${Util.esc(e.name)}</span><span class="r-date">${ago(e.date)}</span>
        <button class="r-del" title="Remove from list" aria-label="Remove">✕</button>`;
      li.addEventListener('click', async ev => {
        if (ev.target.closest('.r-del')) {
          ev.stopPropagation();
          await Util.recent.remove(e.id);
          return renderRecent();
        }
        const full = await Util.recent.get(e.id);
        if (full) openEntry(full);
      });
      ul.appendChild(li);
    }
  }

  /* ---------- Wiring ---------- */
  DocEditor.init();
  SheetEditor.init();

  $('#btn-open').addEventListener('click', () => $('#file-input').click());
  $('#file-input').addEventListener('change', e => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) openFile(f);
  });
  $('#btn-new-doc').addEventListener('click', async () => { enter('doc-view'); await DocEditor.newDoc(); $('#doc-page').focus(); });
  $('#btn-new-sheet').addEventListener('click', async () => { enter('sheet-view'); await SheetEditor.newSheet(); });
  $('#btn-clear-recent').addEventListener('click', async () => {
    if (await Util.confirmBox('Clear recent files?', 'This removes the list and the copies saved on this device. Files you saved to your storage are not affected.', 'Clear')) {
      await Util.recent.clear();
      renderRecent();
    }
  });
  document.querySelectorAll('[data-action="home"]').forEach(b => b.addEventListener('click', () => history.length > 1 && location.hash ? history.back() : goHome()));
  window.addEventListener('popstate', () => { if (!location.hash) goHome(false); });
  document.addEventListener('click', e => {
    if (!e.target.closest('.menu') && !e.target.closest('#doc-more') && !e.target.closest('#sheet-more')) {
      $('#doc-menu').hidden = true; $('#sheet-menu').hidden = true;
    }
  });

  // Drag & drop a file anywhere
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => {
    e.preventDefault();
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) openFile(f);
  });

  // Keep work safe when the tab is hidden or closed
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    if (!$('#doc-view').hidden) DocEditor.persist();
    if (!$('#sheet-view').hidden) SheetEditor.persist();
  });

  // Opened from the OS "Open with" menu (installed desktop app)
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async params => {
      if (params.files && params.files.length) {
        const f = await params.files[0].getFile();
        openFile(f);
      }
    });
  }

  // Install prompt
  let installEvt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installEvt = e;
    $('#install-hint').hidden = false;
  });
  $('#btn-install').addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    await installEvt.userChoice;
    installEvt = null;
    $('#install-hint').hidden = true;
  });

  // Offline support
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
  }

  if (location.hash) history.replaceState(null, '', location.pathname);
  show('home');
  renderRecent();
})();
