/* Excel-style spreadsheet editor: grid, selection, editing, formulas, formatting, sheets. */
'use strict';

const SheetEditor = (() => {
  const { $ } = Util;
  const K = XlsxIO.key;
  const DEF_W = 80, HEAD_W = 46, MAX_ROWS = 100000, MAX_COLS = 702;

  let model, current, si = 0;           // workbook, recent-entry, active sheet index
  let cache = [];                       // computed values per sheet
  let computing = new Set();
  let sel = { r1: 0, c1: 0, r2: 0, c2: 0 }, act = { r: 0, c: 0 };
  let nRows = 0, nCols = 0;             // rendered grid size
  let tdMap = new Map();
  let editing = null;                   // { r, c, input, original }
  let undoStack = [], redoStack = [], txn = null;
  let saveTimer = null, dirty = false;
  let clip = null;
  let grid, wrap, fbar, cellEd;

  const sheet = () => model.sheets[si];
  const cellAt = (r, c, s = sheet()) => s.cells.get(K(r, c));

  /* ================= Values ================= */
  function used(s = sheet()) {
    let r = -1, c = -1;
    for (const k of s.cells.keys()) { const rr = Math.floor(k / 16384), cc = k % 16384; if (rr > r) r = rr; if (cc > c) c = cc; }
    return { r, c };
  }
  function sheetIndexByName(name) {
    const n = name.toLowerCase();
    return model.sheets.findIndex(s => s.name.toLowerCase() === n);
  }
  function value(sIdx, r, c) {
    const s = model.sheets[sIdx];
    const cell = s.cells.get(K(r, c));
    if (!cell) return null;
    if (!cell.f) return cell.v === undefined || cell.v === '' ? null : cell.v;
    const cc = cache[sIdx] || (cache[sIdx] = new Map());
    const k = K(r, c);
    if (cc.has(k)) return cc.get(k);
    const ck = sIdx + ':' + k;
    if (computing.has(ck)) return Formula.E.CIRC;
    computing.add(ck);
    let v;
    try {
      v = Formula.evaluate(cell.f, makeCtx(sIdx, r, c));
    } finally { computing.delete(ck); }
    cc.set(k, v);
    return v;
  }
  function makeCtx(sIdx, row, col) {
    return {
      sheet: model.sheets[sIdx].name, row, col,
      cell(name, r, c) {
        const i = name === model.sheets[sIdx].name ? sIdx : sheetIndexByName(name);
        if (i < 0) throw Formula.E.REF;
        const v = value(i, r, c);
        if (Formula.isErr(v)) throw v;
        return v;
      },
      range(name, r1, c1, r2, c2) {
        const i = name === model.sheets[sIdx].name ? sIdx : sheetIndexByName(name);
        if (i < 0) throw Formula.E.REF;
        if ((r2 - r1 + 1) * (c2 - c1 + 1) > 2e6) throw Formula.E.NUM;
        const rows = [];
        for (let r = r1; r <= r2; r++) {
          const row = [];
          for (let c = c1; c <= c2; c++) row.push(value(i, r, c));
          rows.push(row);
        }
        return rows;
      },
      maxRow(name) { const i = sheetIndexByName(name); return i < 0 ? 0 : Math.max(0, used(model.sheets[i]).r); },
    };
  }
  function invalidate() { cache = model.sheets.map(() => new Map()); }

  const isDateFmt = z => !!z && /(^|[^"\\])[dmy]/i.test(z.replace(/"[^"]*"/g, '')) && !/^[#0.,%\s]+$/.test(z) && !/h|s/i.test(z.replace(/"[^"]*"/g, '').replace(/[dmy]/gi, ''));

  function display(v, z) {
    if (v == null) return '';
    if (Formula.isErr(v)) return v.code;
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') {
      try { return XLSX.SSF.format(z && z !== '@' ? z : 'General', v); } catch { return Formula.fmtNum(v); }
    }
    return String(v);
  }

  function rawOf(cell) {
    if (!cell) return '';
    if (cell.f) return '=' + cell.f;
    const v = cell.v;
    if (v == null) return '';
    if (typeof v === 'number') {
      if (cell.z && isDateFmt(cell.z)) { try { return XLSX.SSF.format(cell.z, v); } catch {} }
      if (cell.z && /%/.test(cell.z)) return Formula.fmtNum(v * 100) + '%';
      return Formula.fmtNum(v);
    }
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  }

  // Turn what the user typed into a cell value (+ maybe a number format).
  function parseInput(text, old) {
    const z = old && old.z;
    if (text === '') return { v: undefined };
    if (text[0] === '=' && text.length > 1) return { f: text.slice(1).trim() };
    if (z === '@') return { v: text };
    const t = text.trim();
    if (/^[-+]?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?([eE][-+]?\d+)?$/.test(t) && /\d/.test(t)) return { v: Number(t.replace(/,/g, '')) };
    let m;
    if ((m = /^([-+]?\d+(?:\.\d+)?)\s*%$/.exec(t))) return { v: Number(m[1]) / 100, z: z || '0%' };
    if ((m = /^([₹$€£])\s?([-+]?[\d,]*\.?\d+)$/.exec(t))) return { v: Number(m[2].replace(/,/g, '')), z: z || `"${m[1]}"#,##0.00` };
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t))) return dateVal(+m[1], +m[2], +m[3], z || 'yyyy-mm-dd');
    if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t))) return dateVal(+m[3], +m[2], +m[1], z || 'dd-mm-yyyy');
    if (/^(true|false)$/i.test(t)) return { v: t.toUpperCase() === 'TRUE' };
    return { v: text };
  }
  function dateVal(y, mo, d, z) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return { v: `${d}-${mo}-${y}` };
    return { v: (Date.UTC(y, mo - 1, d) - Date.UTC(1899, 11, 30)) / 864e5, z };
  }

  /* ================= Undo / mutation ================= */
  function begin() { txn = { type: 'delta', si, before: new Map() }; }
  function setCell(r, c, cell) {
    const k = K(r, c);
    if (txn && txn.type === 'delta' && !txn.before.has(k)) txn.before.set(k, sheet().cells.get(k));
    const empty = !cell || (cell.v === undefined && !cell.f && !cell.z && !(cell.s && Object.keys(cell.s).length));
    if (empty) sheet().cells.delete(k);
    else sheet().cells.set(k, cell);
  }
  function commit() {
    if (!txn) return;
    if (txn.type === 'delta') {
      if (!txn.before.size) { txn = null; return; }
      const s = model.sheets[txn.si];
      txn.after = new Map([...txn.before.keys()].map(k => [k, s.cells.get(k)]));
    }
    undoStack.push(txn);
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
    txn = null;
    changed();
  }
  function snapshot() {
    return { sheets: model.sheets.map(s => ({ name: s.name, colW: Object.assign({}, s.colW), merges: s.merges.slice(), cells: new Map(s.cells) })), si };
  }
  function beginSnap() { txn = { type: 'snap', before: snapshot() }; }
  function commitSnap() {
    if (!txn) return;
    txn.after = snapshot();
    undoStack.push(txn);
    if (undoStack.length > 30) undoStack.shift();
    redoStack = [];
    txn = null;
    changed(true);
  }
  function applyState(st) {
    model.sheets = st.sheets.map(s => ({ name: s.name, colW: Object.assign({}, s.colW), merges: s.merges.slice(), cells: new Map(s.cells) }));
    si = Math.min(st.si, model.sheets.length - 1);
  }
  function undoRedo(isUndo) {
    if (editing) cancelEdit();
    const from = isUndo ? undoStack : redoStack, to = isUndo ? redoStack : undoStack;
    const t = from.pop();
    if (!t) return Util.toast(isUndo ? 'Nothing to undo' : 'Nothing to redo');
    to.push(t);
    if (t.type === 'delta') {
      const s = model.sheets[t.si];
      const src = isUndo ? t.before : t.after;
      for (const [k, cell] of src) { if (cell) s.cells.set(k, cell); else s.cells.delete(k); }
      if (si !== t.si) { si = t.si; changed(true); return; }
      changed();
    } else {
      applyState(isUndo ? t.before : t.after);
      changed(true);
    }
  }

  function changed(structural) {
    invalidate();
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 1500);
    if (structural) build(); else refreshAll();
    showSelection();
  }

  /* ================= Rendering ================= */
  const colW = c => { const w = sheet().colW[c]; return w === undefined ? DEF_W : w; };

  function build() {
    const u = used();
    nRows = Math.max(nRows, u.r + 40, act.r + 20, 60);
    nCols = Math.max(Math.min(MAX_COLS, Math.max(u.c + 6, act.c + 4, 15)), nCols);
    nRows = Math.min(nRows, MAX_ROWS);
    renderTable();
    renderTabs();
  }

  function mergeInfo() {
    const covered = new Set(), spans = new Map();
    for (const m of sheet().merges) {
      spans.set(K(m.r1, m.c1), m);
      for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) covered.add(K(r, c));
    }
    return { covered, spans };
  }

  function renderTable() {
    tdMap = new Map();
    let total = HEAD_W;
    let cg = `<colgroup><col style="width:${HEAD_W}px">`;
    for (let c = 0; c < nCols; c++) { const w = colW(c); total += w; cg += `<col style="width:${w}px">`; }
    cg += '</colgroup>';
    let head = '<thead><tr><th class="corner" data-corner="1"></th>';
    for (let c = 0; c < nCols; c++) head += `<th data-col="${c}" style="position:sticky">${Formula.numToCol(c)}<span class="resizer" data-resize="${c}"></span></th>`;
    head += '</tr></thead>';
    grid.style.width = total + 'px';
    grid.innerHTML = cg + head + '<tbody></tbody>';
    appendRows(0, nRows);
  }

  function appendRows(from, to) {
    const tb = grid.tBodies[0];
    const { covered, spans } = mergeInfo();
    const frag = document.createDocumentFragment();
    for (let r = from; r < to; r++) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = r + 1;
      th.dataset.row = r;
      tr.appendChild(th);
      for (let c = 0; c < nCols; c++) {
        const k = K(r, c);
        if (covered.has(k)) continue;
        const td = document.createElement('td');
        td.dataset.r = r; td.dataset.c = c;
        const m = spans.get(k);
        if (m) { td.rowSpan = m.r2 - m.r1 + 1; td.colSpan = Math.min(m.c2, nCols - 1) - m.c1 + 1; }
        paintCell(td, r, c);
        tdMap.set(k, td);
        tr.appendChild(td);
      }
      frag.appendChild(tr);
    }
    tb.appendChild(frag);
  }

  function paintCell(td, r, c) {
    const cell = cellAt(r, c);
    td.className = '';
    td.removeAttribute('style');
    if (!cell) { td.textContent = ''; return; }
    const v = cell.f ? value(si, r, c) : cell.v;
    td.textContent = display(v, cell.z);
    const s = cell.s || {};
    if (Formula.isErr(v)) td.classList.add('err');
    if (s.align) td.style.textAlign = s.align;
    else if (typeof v === 'number') td.classList.add('num');
    else if (typeof v === 'boolean') td.style.textAlign = 'center';
    if (s.b) td.style.fontWeight = '700';
    if (s.i) td.style.fontStyle = 'italic';
    if (s.u) td.style.textDecoration = 'underline';
    if (s.color) td.style.color = '#' + s.color;
    if (s.fill) td.style.backgroundColor = '#' + s.fill;
  }

  function refreshAll() {
    for (const [k, td] of tdMap) paintCell(td, Math.floor(k / 16384), k % 16384);
    updateStatus();
  }

  function renderTabs() {
    const tabs = $('#tabs');
    tabs.innerHTML = '';
    model.sheets.forEach((s, i) => {
      const b = document.createElement('button');
      b.textContent = s.name;
      b.className = i === si ? 'on' : '';
      b.onclick = () => { if (i === si) sheetDialog(); else switchSheet(i); };
      tabs.appendChild(b);
    });
  }

  function switchSheet(i) {
    if (editing) commitEdit('none');
    si = i;
    model.active = i;
    sel = { r1: 0, c1: 0, r2: 0, c2: 0 }; act = { r: 0, c: 0 };
    nRows = 0; nCols = 0;
    build();
    wrap.scrollTop = 0; wrap.scrollLeft = 0;
    showSelection();
  }

  /* ================= Selection ================= */
  let selMarked = [];
  function showSelection() {
    for (const el of selMarked) el.classList.remove('in-sel', 'active', 'hl');
    selMarked = [];
    const multi = sel.r1 !== sel.r2 || sel.c1 !== sel.c2;
    const r2 = Math.min(sel.r2, nRows - 1), c2 = Math.min(sel.c2, nCols - 1);
    if (multi && (r2 - sel.r1 + 1) * (c2 - sel.c1 + 1) < 60000) {
      for (let r = sel.r1; r <= r2; r++) for (let c = sel.c1; c <= c2; c++) {
        const td = tdMap.get(K(r, c));
        if (td) { td.classList.add('in-sel'); selMarked.push(td); }
      }
    }
    const a = tdMap.get(K(act.r, act.c));
    if (a) { a.classList.add('active'); selMarked.push(a); }
    const heads = grid.tHead.rows[0].cells;
    for (let c = sel.c1; c <= c2; c++) { const th = heads[c + 1]; if (th) { th.classList.add('hl'); selMarked.push(th); } }
    const rows = grid.tBodies[0].rows;
    for (let r = sel.r1; r <= r2; r++) { const th = rows[r] && rows[r].cells[0]; if (th) { th.classList.add('hl'); selMarked.push(th); } }
    $('#cell-name').textContent = multi ? `${Formula.addr(sel.r1, sel.c1)}:${Formula.addr(sel.r2, sel.c2)}` : Formula.addr(act.r, act.c);
    if (!editing) fbar.value = rawOf(cellAt(act.r, act.c));
    const cell = cellAt(act.r, act.c);
    const s = (cell && cell.s) || {};
    for (const [k, on] of [['bold', s.b], ['italic', s.i], ['underline', s.u], ['left', s.align === 'left'], ['center', s.align === 'center'], ['right', s.align === 'right']]) {
      const b = document.querySelector(`#sheet-toolbar [data-sc="${k}"]`);
      if (b) b.classList.toggle('on', !!on);
    }
    $('#sheet-fmt').value = (cell && cell.z) || 'General';
    if ($('#sheet-fmt').selectedIndex < 0) $('#sheet-fmt').value = 'General';
    updateStatus();
  }

  function mergeAt(r, c) { return sheet().merges.find(m => r >= m.r1 && r <= m.r2 && c >= m.c1 && c <= m.c2); }

  function select(r, c, extend) {
    r = Math.max(0, Math.min(MAX_ROWS - 1, r));
    c = Math.max(0, Math.min(MAX_COLS - 1, c));
    if (extend) {
      sel = { r1: Math.min(act.r, r), c1: Math.min(act.c, c), r2: Math.max(act.r, r), c2: Math.max(act.c, c) };
    } else {
      const m = mergeAt(r, c);
      if (m) { act = { r: m.r1, c: m.c1 }; sel = { r1: m.r1, c1: m.c1, r2: m.r2, c2: m.c2 }; }
      else { act = { r, c }; sel = { r1: r, c1: c, r2: r, c2: c }; }
    }
    ensureRendered(Math.max(r, act.r), Math.max(c, act.c));
    showSelection();
    scrollIntoView(extend ? r : act.r, extend ? c : act.c);
  }

  function ensureRendered(r, c) {
    if (c >= nCols) { nCols = Math.min(MAX_COLS, c + 10); renderTable(); }
    if (r >= nRows) { const old = nRows; nRows = Math.min(MAX_ROWS, r + 50); appendRows(old, nRows); }
  }

  function scrollIntoView(r, c) {
    const td = tdMap.get(K(r, c));
    if (!td) return;
    const top = td.offsetTop, left = td.offsetLeft + grid.offsetLeft, hh = grid.tHead.offsetHeight;
    if (top - hh < wrap.scrollTop) wrap.scrollTop = top - hh;
    else if (top + td.offsetHeight > wrap.scrollTop + wrap.clientHeight) wrap.scrollTop = top + td.offsetHeight - wrap.clientHeight;
    if (left - HEAD_W < wrap.scrollLeft) wrap.scrollLeft = left - HEAD_W;
    else if (left + td.offsetWidth > wrap.scrollLeft + wrap.clientWidth) wrap.scrollLeft = left + td.offsetWidth - wrap.clientWidth;
  }

  function moveBy(dr, dc, extend) {
    if (extend) {
      // Move the far corner of the selection
      const far = { r: sel.r1 === act.r ? sel.r2 : sel.r1, c: sel.c1 === act.c ? sel.c2 : sel.c1 };
      select(far.r + dr, far.c + dc, true);
    } else {
      const m = mergeAt(act.r, act.c);
      let r = act.r + dr, c = act.c + dc;
      if (m) { if (dr > 0) r = m.r2 + 1; if (dc > 0) c = m.c2 + 1; }
      select(r, c, false);
    }
  }

  function selCells(fn, limitToUsed = true) {
    const u = used();
    const r2 = limitToUsed && sel.r2 - sel.r1 > 5000 ? Math.max(u.r, sel.r1) : sel.r2;
    const c2 = limitToUsed && sel.c2 - sel.c1 > 200 ? Math.max(u.c, sel.c1) : sel.c2;
    for (let r = sel.r1; r <= r2; r++) for (let c = sel.c1; c <= c2; c++) fn(r, c);
  }

  function updateStatus() {
    const multi = sel.r1 !== sel.r2 || sel.c1 !== sel.c2;
    let txt = '';
    if (multi) {
      let sum = 0, n = 0, cnt = 0;
      const u = used();
      for (let r = sel.r1; r <= Math.min(sel.r2, u.r); r++) for (let c = sel.c1; c <= Math.min(sel.c2, u.c); c++) {
        const v = value(si, r, c);
        if (v != null && v !== '') cnt++;
        if (typeof v === 'number') { sum += v; n++; }
      }
      txt = n ? `Sum ${Formula.fmtNum(+sum.toFixed(10))} · Avg ${Formula.fmtNum(+(sum / n).toFixed(10))} · Count ${cnt}` : `Count ${cnt}`;
    }
    $('#sheet-status').textContent = txt || (dirty ? 'editing' : 'saved on device');
  }

  /* ================= Editing ================= */
  function startEdit(initial, viaBar) {
    if (editing) return;
    const cell = cellAt(act.r, act.c);
    const original = rawOf(cell);
    const text = initial !== undefined ? initial : original;
    if (viaBar) {
      editing = { r: act.r, c: act.c, input: fbar, original };
      return;
    }
    const td = tdMap.get(K(act.r, act.c));
    if (!td) return;
    editing = { r: act.r, c: act.c, input: cellEd, original };
    cellEd.hidden = false;
    cellEd.style.left = (grid.offsetLeft + td.offsetLeft) + 'px';
    cellEd.style.top = (grid.offsetTop + td.offsetTop) + 'px';
    cellEd.style.minWidth = td.offsetWidth + 'px';
    cellEd.style.width = Math.max(td.offsetWidth, Math.min(400, (text.length + 2) * 8)) + 'px';
    cellEd.style.height = td.offsetHeight + 'px';
    const cs = getComputedStyle(td);
    cellEd.style.fontWeight = cs.fontWeight;
    cellEd.style.fontStyle = cs.fontStyle;
    cellEd.style.textAlign = 'left';
    cellEd.value = text;
    fbar.value = text;
    cellEd.focus();
    const end = text.length;
    cellEd.setSelectionRange(end, end);
  }

  function commitEdit(move) {
    if (!editing) return;
    const { r, c, input, original } = editing;
    const text = input.value;
    editing = null;
    cellEd.hidden = true;
    if (text !== original) {
      const old = cellAt(r, c);
      const parsed = parseInput(text, old);
      begin();
      const next = Object.assign({}, old || {});
      delete next.v; delete next.f;
      if (parsed.f) next.f = parsed.f;
      else if (parsed.v !== undefined) next.v = parsed.v;
      if (parsed.z && (!old || !old.z)) next.z = parsed.z;
      setCell(r, c, next);
      commit();
    }
    if (input === fbar) fbar.blur();
    grid.focus({ preventScroll: true });
    if (move === 'down') moveBy(1, 0);
    else if (move === 'up') moveBy(-1, 0);
    else if (move === 'right') moveBy(0, 1);
    else if (move === 'left') moveBy(0, -1);
    else showSelection();
  }

  function cancelEdit() {
    if (!editing) return;
    editing = null;
    cellEd.hidden = true;
    fbar.blur();
    grid.focus({ preventScroll: true });
    showSelection();
  }

  // While typing a formula, tapping a cell inserts its reference.
  function wantsRef() {
    if (!editing) return false;
    const inp = editing.input;
    const v = inp.value, pos = inp.selectionStart ?? v.length;
    return v[0] === '=' && /[=(,:+\-*/^&<>]\s*$/.test(v.slice(0, pos));
  }
  function insertRef(text) {
    const inp = editing.input;
    const pos = inp.selectionStart ?? inp.value.length;
    inp.value = inp.value.slice(0, pos) + text + inp.value.slice(inp.selectionEnd ?? pos);
    inp.setSelectionRange(pos + text.length, pos + text.length);
    if (inp === cellEd) fbar.value = inp.value; else cellEd.value = inp.value;
  }

  function editorKey(e) {
    const k = e.key;
    if (k === 'Enter') { e.preventDefault(); commitEdit(e.shiftKey ? 'up' : 'down'); }
    else if (k === 'Tab') { e.preventDefault(); commitEdit(e.shiftKey ? 'left' : 'right'); }
    else if (k === 'Escape') { e.preventDefault(); cancelEdit(); }
    else if (editing && editing.input === cellEd && !editing.input.value.startsWith('=') && ['ArrowUp', 'ArrowDown'].includes(k)) {
      e.preventDefault(); commitEdit(k === 'ArrowUp' ? 'up' : 'down');
    }
  }

  /* ================= Formatting & commands ================= */
  function applyStyle(fn) {
    begin();
    selCells((r, c) => {
      const old = cellAt(r, c) || {};
      const s = Object.assign({}, old.s || {});
      fn(s);
      for (const k of Object.keys(s)) if (s[k] === undefined || s[k] === false || s[k] === '') delete s[k];
      const next = Object.assign({}, old, { s });
      if (!Object.keys(s).length) delete next.s;
      setCell(r, c, next);
    });
    commit();
  }
  function toggle(prop) {
    const cur = cellAt(act.r, act.c);
    const on = !(cur && cur.s && cur.s[prop]);
    applyStyle(s => { s[prop] = on; });
  }
  function setFormat(z) {
    begin();
    selCells((r, c) => {
      const old = cellAt(r, c) || {};
      const next = Object.assign({}, old);
      if (z === 'General') delete next.z; else next.z = z;
      if (z === '@' && typeof next.v === 'number') next.v = rawOf(Object.assign({}, old, { z: undefined }));
      if (z !== '@' && z !== 'General' && typeof next.v === 'string' && next.v.trim() && !isNaN(+next.v.replace(/,/g, ''))) next.v = +next.v.replace(/,/g, '');
      setCell(r, c, next);
    });
    commit();
  }

  function clearSelection() {
    begin();
    selCells((r, c) => {
      const old = cellAt(r, c);
      if (!old) return;
      const next = Object.assign({}, old);
      delete next.v; delete next.f;
      setCell(r, c, next);
    });
    commit();
  }

  function autoSum() {
    const multi = sel.r1 !== sel.r2 || sel.c1 !== sel.c2;
    begin();
    if (multi) {
      // Sum each column of the selection into the row below it
      const r = sel.r2 + 1;
      for (let c = sel.c1; c <= sel.c2; c++) setCell(r, c, Object.assign({}, cellAt(r, c) || {}, { f: `SUM(${Formula.addr(sel.r1, c)}:${Formula.addr(sel.r2, c)})`, v: undefined }));
      commit();
      return select(r, sel.c1);
    }
    const { r, c } = act;
    let top = r - 1;
    while (top >= 0 && typeof value(si, top, c) === 'number') top--;
    let f;
    if (top < r - 1) f = `SUM(${Formula.addr(top + 1, c)}:${Formula.addr(r - 1, c)})`;
    else {
      let left = c - 1;
      while (left >= 0 && typeof value(si, r, left) === 'number') left--;
      f = left < c - 1 ? `SUM(${Formula.addr(r, left + 1)}:${Formula.addr(r, c - 1)})` : null;
    }
    txn = null;
    if (!f) { startEdit('=SUM()'); cellEd.setSelectionRange(5, 5); return; }
    begin();
    setCell(r, c, Object.assign({}, cellAt(r, c) || {}, { f, v: undefined }));
    commit();
  }

  /* --- insert / delete rows & columns --- */
  function structural(axis, at, delta) {
    beginSnap();
    const target = sheet().name;
    // shift references in every formula in the workbook
    model.sheets.forEach(s => {
      for (const [k, cell] of s.cells) if (cell.f) s.cells.set(k, Object.assign({}, cell, { f: Formula.shift(cell.f, s.name, target, axis, at, delta) }));
    });
    const s = sheet();
    const moved = new Map();
    for (const [k, cell] of s.cells) {
      let r = Math.floor(k / 16384), c = k % 16384;
      let p = axis === 'row' ? r : c;
      if (delta < 0 && p >= at && p < at - delta) continue;
      if (p >= at) p += delta;
      if (axis === 'row') r = p; else c = p;
      moved.set(K(r, c), cell);
    }
    s.cells = moved;
    if (axis === 'col') {
      const w = {};
      for (const [c, v] of Object.entries(s.colW)) {
        let p = +c;
        if (delta < 0 && p >= at && p < at - delta) continue;
        if (p >= at) p += delta;
        w[p] = v;
      }
      s.colW = w;
    }
    s.merges = s.merges.map(m => {
      const a = axis === 'row' ? ['r1', 'r2'] : ['c1', 'c2'];
      const o = Object.assign({}, m);
      for (const key of a) {
        if (delta > 0 && o[key] >= at) o[key] += delta;
        if (delta < 0) { if (o[key] >= at - delta) o[key] += delta; else if (o[key] >= at) o[key] = key.endsWith('1') ? at : at - 1; }
      }
      return o;
    }).filter(o => o.r2 >= o.r1 && o.c2 >= o.c1 && (o.r2 > o.r1 || o.c2 > o.c1));
    commitSnap();
  }

  function sortBy(desc) {
    const u = used();
    if (u.r < 0) return;
    const multiRow = sel.r2 > sel.r1;
    const r1 = multiRow ? sel.r1 : (looksLikeHeader() ? 1 : 0);
    const r2 = multiRow ? Math.min(sel.r2, u.r) : u.r;
    const c1 = multiRow && sel.c2 > sel.c1 ? sel.c1 : 0, c2 = multiRow && sel.c2 > sel.c1 ? sel.c2 : u.c;
    const key = act.c;
    const rows = [];
    for (let r = r1; r <= r2; r++) rows.push({ r, v: value(si, r, key) });
    rows.sort((a, b) => {
      const x = a.v, y = b.v;
      if (x == null && y == null) return 0;
      if (x == null) return 1;            // blanks always last
      if (y == null) return -1;
      const tx = typeof x === 'number' ? 0 : 1, ty = typeof y === 'number' ? 0 : 1;
      let d = tx - ty || (tx === 0 ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' }));
      return desc ? -d : d;
    });
    begin();
    const snap = new Map();
    for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) snap.set(K(r, c), cellAt(r, c));
    rows.forEach((row, i) => {
      const nr = r1 + i;
      for (let c = c1; c <= c2; c++) {
        let cell = snap.get(K(row.r, c));
        if (cell && cell.f && nr !== row.r) cell = Object.assign({}, cell, { f: Formula.translate(cell.f, nr - row.r, 0) });
        setCell(nr, c, cell ? Object.assign({}, cell) : null);
      }
    });
    commit();
    Util.toast(`Sorted rows ${r1 + 1}–${r2 + 1} by column ${Formula.numToCol(key)}`);
  }
  function looksLikeHeader() {
    const u = used();
    let textCells = 0, n = 0;
    for (let c = 0; c <= u.c; c++) { const v = value(si, 0, c); if (v != null) { n++; if (typeof v === 'string') textCells++; } }
    const below = value(si, 1, act.c);
    return n > 0 && textCells === n && (typeof below === 'number' || u.r > 0);
  }

  function toggleMerge() {
    const s = sheet();
    // Selecting a merged cell selects the whole merge, so an exact match means "unmerge"
    const existing = s.merges.findIndex(m => m.r1 === sel.r1 && m.c1 === sel.c1 && m.r2 === sel.r2 && m.c2 === sel.c2);
    beginSnap();
    if (existing >= 0) s.merges.splice(existing, 1);
    else {
      if (sel.r1 === sel.r2 && sel.c1 === sel.c2) { txn = null; return Util.toast('Select several cells to merge'); }
      s.merges = s.merges.filter(m => m.r2 < sel.r1 || m.r1 > sel.r2 || m.c2 < sel.c1 || m.c1 > sel.c2);
      for (let r = sel.r1; r <= sel.r2; r++) for (let c = sel.c1; c <= sel.c2; c++) if (r !== sel.r1 || c !== sel.c1) {
        const old = s.cells.get(K(r, c));
        if (old) { const n = Object.assign({}, old); delete n.v; delete n.f; if (n.s || n.z) s.cells.set(K(r, c), n); else s.cells.delete(K(r, c)); }
      }
      s.merges.push({ r1: sel.r1, c1: sel.c1, r2: sel.r2, c2: sel.c2 });
      const tl = s.cells.get(K(sel.r1, sel.c1)) || {};
      s.cells.set(K(sel.r1, sel.c1), Object.assign({}, tl, { s: Object.assign({}, tl.s || {}, { align: (tl.s && tl.s.align) || 'center' }) }));
    }
    commitSnap();
  }

  /* --- clipboard --- */
  function copySelection(cut) {
    const rows = [];
    const cells = [];
    for (let r = sel.r1; r <= sel.r2; r++) {
      const line = [], crow = [];
      for (let c = sel.c1; c <= sel.c2; c++) {
        const cell = cellAt(r, c);
        line.push(display(cell && cell.f ? value(si, r, c) : cell && cell.v, cell && cell.z));
        crow.push(cell ? Object.assign({}, cell) : null);
      }
      rows.push(line.join('\t'));
      cells.push(crow);
    }
    const text = rows.join('\n');
    clip = { text, cells, r: sel.r1, c: sel.c1, cut: !!cut, si };
    return text;
  }
  function pasteText(text) {
    if (editing) return;
    begin();
    if (clip && text === clip.text) {
      clip.cells.forEach((row, i) => row.forEach((cell, j) => {
        const r = act.r + i, c = act.c + j;
        if (cell && cell.f && !clip.cut) cell = Object.assign({}, cell, { f: Formula.translate(cell.f, act.r - clip.r, act.c - clip.c) });
        setCell(r, c, cell ? Object.assign({}, cell) : null);
      }));
      if (clip.cut && clip.si === si) {
        clip.cells.forEach((row, i) => row.forEach((_, j) => {
          const r = clip.r + i, c = clip.c + j;
          if (r < act.r || r >= act.r + clip.cells.length || c < act.c || c >= act.c + row.length) setCell(r, c, null);
        }));
        clip = null;
      }
    } else {
      const lines = text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n');
      lines.forEach((line, i) => line.split('\t').forEach((t, j) => {
        const old = cellAt(act.r + i, act.c + j);
        const p = parseInput(t, old);
        const next = Object.assign({}, old || {});
        delete next.v; delete next.f;
        if (p.f) next.f = p.f; else if (p.v !== undefined) next.v = p.v;
        if (p.z && !next.z) next.z = p.z;
        setCell(act.r + i, act.c + j, next);
      }));
    }
    commit();
  }

  /* --- find --- */
  function findNext() {
    const q = $('#sfind-text').value.toLowerCase();
    if (!q) return;
    const u = used();
    const total = (u.r + 1) * (u.c + 1);
    let idx = act.r * (u.c + 1) + act.c;
    for (let i = 1; i <= total; i++) {
      const p = (idx + i) % total;
      const r = Math.floor(p / (u.c + 1)), c = p % (u.c + 1);
      const cell = cellAt(r, c);
      if (!cell) continue;
      const shown = display(cell.f ? value(si, r, c) : cell.v, cell.z).toLowerCase();
      if (shown.includes(q) || rawOf(cell).toLowerCase().includes(q)) return select(r, c);
    }
    Util.toast('Not found');
  }

  /* --- sheets --- */
  function sheetDialog() {
    const dlg = $('#dialog');
    const s = sheet();
    $('#dialog-form').innerHTML = `<h3>Sheet</h3><label for="sh-name">Name</label><input id="sh-name" value="${Util.esc(s.name)}" maxlength="31">
      <div class="actions"><button value="delete" type="submit">Delete sheet</button><button value="cancel" type="submit">Cancel</button>
      <button value="ok" class="primary" type="submit">Rename</button></div>`;
    dlg.onclose = async () => {
      if (dlg.returnValue === 'ok') {
        const name = $('#sh-name').value.trim().replace(/[\\/?*[\]:]/g, '').slice(0, 31);
        if (!name || name === s.name) return;
        if (sheetIndexByName(name) >= 0) return Util.toast('A sheet with that name exists');
        beginSnap();
        const old = s.name;
        const re = new RegExp(`(^|[^\\w.'])('?)${old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "''")}\\2!`, 'gi');
        const q = /^[A-Za-z_][\w.]*$/.test(name) ? name : `'${name.replace(/'/g, "''")}'`;
        model.sheets.forEach(sh => { for (const [k, c] of sh.cells) if (c.f && c.f.includes('!')) sh.cells.set(k, Object.assign({}, c, { f: c.f.replace(re, (m, a) => `${a}${q}!`) })); });
        s.name = name;
        commitSnap();
      } else if (dlg.returnValue === 'delete') {
        if (model.sheets.length === 1) return Util.toast('A workbook needs at least one sheet');
        if (!(await Util.confirmBox('Delete sheet?', `"${s.name}" and everything on it will be removed.`, 'Delete'))) return;
        beginSnap();
        model.sheets.splice(si, 1);
        si = Math.max(0, si - 1);
        commitSnap();
        switchSheet(si);
      }
    };
    dlg.returnValue = '';
    dlg.showModal();
  }
  function addSheet() {
    let n = model.sheets.length + 1;
    while (sheetIndexByName('Sheet' + n) >= 0) n++;
    beginSnap();
    model.sheets.push(XlsxIO.emptySheet('Sheet' + n));
    commitSnap();
    switchSheet(model.sheets.length - 1);
  }

  /* ================= Open / save ================= */
  async function open(entry) {
    current = entry;
    $('#sheet-title').value = Util.baseName(entry.name);
    if (entry.json) model = XlsxIO.fromJSON(entry.json);
    else if (entry.data) model = await XlsxIO.read(entry.data, entry.name);
    else model = { sheets: [XlsxIO.emptySheet('Sheet1')] };
    si = Math.min(model.active || 0, model.sheets.length - 1);
    undoStack = []; redoStack = []; clip = null; editing = null;
    cellEd.hidden = true;
    sel = { r1: 0, c1: 0, r2: 0, c2: 0 }; act = { r: 0, c: 0 };
    nRows = 0; nCols = 0;
    invalidate();
    build();
    wrap.scrollTop = 0; wrap.scrollLeft = 0;
    dirty = false;
    showSelection();
    if (!entry.json) await persist();
  }
  function newSheet() {
    return open({ id: Util.newId(), name: 'Spreadsheet.xlsx', kind: 'sheet' });
  }
  function fileName(ext) { return Util.baseName($('#sheet-title').value) + '.' + ext; }

  async function persist() {
    if (!current) return;
    clearTimeout(saveTimer);
    model.active = si;
    current.json = XlsxIO.toJSON(model);
    current.name = fileName(current.origExt === 'csv' ? 'csv' : 'xlsx');
    current.kind = 'sheet';
    delete current.data;
    await Util.recent.put(current);
    dirty = false;
    updateStatus();
  }

  const valueOf = (s, r, c) => value(s, r, c);

  function csvBlob() {
    const u = used();
    const lines = [];
    for (let r = 0; r <= u.r; r++) {
      const row = [];
      for (let c = 0; c <= u.c; c++) {
        const cell = cellAt(r, c);
        let t = cell ? display(cell.f ? value(si, r, c) : cell.v, cell.z) : '';
        if (/[",\n\r]/.test(t)) t = '"' + t.replace(/"/g, '""') + '"';
        row.push(t);
      }
      lines.push(row.join(','));
    }
    return new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv' });
  }

  async function exportBlob(kind) {
    if (editing) commitEdit('none');
    if (kind === 'xlsx') return XlsxIO.writeXlsx(model, valueOf);
    if (kind === 'csv') return csvBlob();
    if (kind === 'ods') return XlsxIO.writeOther(model, valueOf, 'ods');
  }
  async function save(kind) {
    kind = kind || (current && current.origExt === 'csv' ? 'csv' : 'xlsx');
    try {
      const blob = await exportBlob(kind);
      await Util.saveBlob(blob, fileName(kind));
      await persist();
    } catch (e) {
      console.error(e);
      Util.toast('Save failed: ' + e.message);
    }
  }

  function printSheet() {
    const u = used();
    ensureRendered(u.r, u.c);
    window.print();
  }

  async function command(cmd) {
    $('#sheet-menu').hidden = true;
    switch (cmd) {
      case 'save-xlsx': return save('xlsx');
      case 'save-csv': return save('csv');
      case 'save-ods': return save('ods');
      case 'save-pdf': await persist(); return printSheet();
      case 'share': return Util.shareBlob(await exportBlob('xlsx'), fileName('xlsx'));
      case 'find': $('#sheet-find').hidden = false; return $('#sfind-text').focus();
      case 'sort-asc': return sortBy(false);
      case 'sort-desc': return sortBy(true);
      case 'merge': return toggleMerge();
      case 'help': return Util.info('Formulas', `<p>Start with <code>=</code>, e.g. <code>=A1+B1</code>, <code>=SUM(A1:A10)</code>,
        <code>=IF(B2&gt;100,"High","Low")</code>, <code>=VLOOKUP(E2,A:C,3,FALSE)</code>.</p>
        <p>While typing a formula, tap a cell to insert its address.</p>
        <p>Supported functions:<br>${Formula.functionNames().map(n => `<code>${n}</code>`).join(' ')}</p>`);
    }
  }

  async function toolbar(cmd) {
    if (editing && !['undo', 'redo'].includes(cmd)) commitEdit('none');
    switch (cmd) {
      case 'undo': return undoRedo(true);
      case 'redo': return undoRedo(false);
      case 'bold': return toggle('b');
      case 'italic': return toggle('i');
      case 'underline': return toggle('u');
      case 'left': case 'center': case 'right': {
        const cur = cellAt(act.r, act.c);
        const on = cur && cur.s && cur.s.align === cmd;
        return applyStyle(s => { s.align = on ? undefined : cmd; });
      }
      case 'nofill': return applyStyle(s => { s.fill = undefined; s.color = undefined; });
      case 'sum': return autoSum();
      case 'row-add': return structural('row', sel.r1, sel.r2 - sel.r1 + 1);
      case 'col-add': return structural('col', sel.c1, sel.c2 - sel.c1 + 1);
      case 'row-del': return structural('row', sel.r1, -(sel.r2 - sel.r1 + 1));
      case 'col-del': return structural('col', sel.c1, -(sel.c2 - sel.c1 + 1));
      case 'copy': {
        const t = copySelection(false);
        try { await navigator.clipboard.writeText(t); } catch {}
        return Util.toast('Copied');
      }
      case 'paste': {
        let t = null;
        try { t = await navigator.clipboard.readText(); } catch {}
        if (t == null && clip) t = clip.text;
        if (t == null) return Util.toast('Nothing to paste');
        return pasteText(t);
      }
    }
  }

  /* ================= Events ================= */
  function cellFromEvent(e) {
    const td = e.target.closest && e.target.closest('td[data-r]');
    return td ? { r: +td.dataset.r, c: +td.dataset.c, td } : null;
  }

  function init() {
    grid = $('#grid'); wrap = $('#grid-wrap'); fbar = $('#formula-input'); cellEd = $('#cell-editor');
    grid.tabIndex = 0;

    let dragging = false, tapEdit = false;
    grid.addEventListener('pointerdown', e => {
      const resize = e.target.dataset && e.target.dataset.resize;
      if (resize !== undefined) return startResize(e, +resize);
      const th = e.target.closest('th');
      if (th) {
        if (editing) commitEdit('none');
        const u = used();
        if (th.dataset.col !== undefined) {
          const c = +th.dataset.col;
          if (e.shiftKey) { sel = { r1: 0, r2: Math.max(u.r, nRows - 1), c1: Math.min(act.c, c), c2: Math.max(act.c, c) }; }
          else { act = { r: 0, c }; sel = { r1: 0, c1: c, r2: Math.max(u.r, nRows - 1), c2: c }; }
        } else if (th.dataset.row !== undefined) {
          const r = +th.dataset.row;
          if (e.shiftKey) { sel = { r1: Math.min(act.r, r), r2: Math.max(act.r, r), c1: 0, c2: Math.max(u.c, nCols - 1) }; }
          else { act = { r, c: 0 }; sel = { r1: r, c1: 0, r2: r, c2: Math.max(u.c, nCols - 1) }; }
        } else if (th.dataset.corner) {
          act = { r: 0, c: 0 }; sel = { r1: 0, c1: 0, r2: Math.max(u.r, 0), c2: Math.max(u.c, 0) };
        }
        showSelection();
        return;
      }
      const hit = cellFromEvent(e);
      if (!hit) return;
      if (wantsRef()) {
        e.preventDefault();
        insertRef(Formula.addr(hit.r, hit.c));
        return;
      }
      if (editing) commitEdit('none');
      const wasActive = act.r === hit.r && act.c === hit.c && sel.r1 === sel.r2 && sel.c1 === sel.c2;
      select(hit.r, hit.c, e.shiftKey);
      tapEdit = false;
      if (e.pointerType === 'mouse') {
        dragging = true;
        grid.focus({ preventScroll: true });
        e.preventDefault();
      } else if (wasActive) {
        // a second tap on the same cell opens the editor (done on "click" so the phone keyboard can open)
        tapEdit = true;
      }
    });
    grid.addEventListener('click', e => {
      if (tapEdit && !editing && cellFromEvent(e)) startEdit();
      tapEdit = false;
    });
    grid.addEventListener('pointermove', e => {
      if (!dragging) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const td = el && el.closest && el.closest('td[data-r]');
      if (td) {
        const r = +td.dataset.r, c = +td.dataset.c;
        const far = { r: sel.r1 === act.r ? sel.r2 : sel.r1, c: sel.c1 === act.c ? sel.c2 : sel.c1 };
        if (r !== far.r || c !== far.c) {
          sel = { r1: Math.min(act.r, r), c1: Math.min(act.c, c), r2: Math.max(act.r, r), c2: Math.max(act.c, c) };
          showSelection();
        }
      }
    });
    window.addEventListener('pointerup', () => { dragging = false; });
    grid.addEventListener('dblclick', e => { const hit = cellFromEvent(e); if (hit && !editing) startEdit(); });

    wrap.addEventListener('scroll', () => {
      if (wrap.scrollTop + wrap.clientHeight > wrap.scrollHeight - 300 && nRows < MAX_ROWS) {
        const old = nRows; nRows = Math.min(MAX_ROWS, nRows + 100); appendRows(old, nRows); showSelection();
      }
      if (wrap.scrollLeft + wrap.clientWidth > wrap.scrollWidth - 200 && nCols < MAX_COLS) {
        const top = wrap.scrollTop, left = wrap.scrollLeft;
        nCols = Math.min(MAX_COLS, nCols + 10); renderTable(); showSelection();
        wrap.scrollTop = top; wrap.scrollLeft = left;
      }
    }, { passive: true });

    document.addEventListener('keydown', e => {
      if ($('#sheet-view').hidden || $('#dialog').open) return;
      const ae = document.activeElement;
      const inField = ae && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA');
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); return save(); }
      if (inField) return;
      const k = e.key;
      if (mod) {
        const l = k.toLowerCase();
        if (l === 'z') { e.preventDefault(); return undoRedo(!e.shiftKey); }
        if (l === 'y') { e.preventDefault(); return undoRedo(false); }
        if (l === 'b') { e.preventDefault(); return toggle('b'); }
        if (l === 'i') { e.preventDefault(); return toggle('i'); }
        if (l === 'u') { e.preventDefault(); return toggle('u'); }
        if (l === 'a') { e.preventDefault(); const u = used(); act = { r: 0, c: 0 }; sel = { r1: 0, c1: 0, r2: Math.max(0, u.r), c2: Math.max(0, u.c) }; return showSelection(); }
        if (l === 'f') { e.preventDefault(); return command('find'); }
        return;
      }
      const arrows = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
      if (arrows[k]) { e.preventDefault(); return moveBy(...arrows[k], e.shiftKey); }
      if (k === 'Enter') { e.preventDefault(); return moveBy(e.shiftKey ? -1 : 1, 0); }
      if (k === 'Tab') { e.preventDefault(); return moveBy(0, e.shiftKey ? -1 : 1); }
      if (k === 'F2') { e.preventDefault(); return startEdit(); }
      if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); return clearSelection(); }
      if (k === 'PageDown') { e.preventDefault(); return moveBy(Math.floor(wrap.clientHeight / 27), 0); }
      if (k === 'PageUp') { e.preventDefault(); return moveBy(-Math.floor(wrap.clientHeight / 27), 0); }
      if (k === 'Home') { e.preventDefault(); return select(act.r, 0); }
      if (k.length === 1 && !e.altKey) { e.preventDefault(); startEdit(k); }
    });

    document.addEventListener('copy', e => {
      if ($('#sheet-view').hidden || isTextFocus()) return;
      e.preventDefault(); e.clipboardData.setData('text/plain', copySelection(false));
    });
    document.addEventListener('cut', e => {
      if ($('#sheet-view').hidden || isTextFocus()) return;
      e.preventDefault(); e.clipboardData.setData('text/plain', copySelection(true));
    });
    document.addEventListener('paste', e => {
      if ($('#sheet-view').hidden || isTextFocus()) return;
      e.preventDefault(); pasteText(e.clipboardData.getData('text/plain'));
    });

    cellEd.addEventListener('keydown', editorKey);
    cellEd.addEventListener('input', () => { fbar.value = cellEd.value; });
    fbar.addEventListener('focus', () => { if (!editing) startEdit(undefined, true); });
    fbar.addEventListener('input', () => { if (!editing) startEdit(undefined, true); if (editing.input === cellEd) cellEd.value = fbar.value; });
    fbar.addEventListener('keydown', editorKey);
    fbar.addEventListener('blur', () => { setTimeout(() => { if (editing && editing.input === fbar && document.activeElement !== fbar) commitEdit('none'); }, 150); });
    cellEd.addEventListener('blur', () => { setTimeout(() => { if (editing && editing.input === cellEd && document.activeElement !== cellEd && document.activeElement !== fbar) commitEdit('none'); }, 150); });

    const tb = $('#sheet-toolbar');
    tb.addEventListener('mousedown', e => { if (e.target.closest('button') && editing) e.preventDefault(); });
    tb.addEventListener('click', e => { const b = e.target.closest('[data-sc]'); if (b) toolbar(b.dataset.sc); });
    $('#sheet-color').addEventListener('input', e => { if (editing) commitEdit('none'); applyStyle(s => { s.color = e.target.value.slice(1).toUpperCase(); }); });
    $('#sheet-fill').addEventListener('input', e => { if (editing) commitEdit('none'); applyStyle(s => { s.fill = e.target.value.slice(1).toUpperCase(); }); });
    $('#sheet-fmt').addEventListener('change', e => { if (editing) commitEdit('none'); setFormat(e.target.value); });

    $('#sheet-save').addEventListener('click', () => save());
    $('#sheet-more').addEventListener('click', e => { e.stopPropagation(); $('#sheet-menu').hidden = !$('#sheet-menu').hidden; });
    $('#sheet-menu').addEventListener('click', e => { const b = e.target.closest('[data-cmd]'); if (b) command(b.dataset.cmd); });
    $('#tab-add').addEventListener('click', addSheet);
    $('#sheet-title').addEventListener('change', () => { dirty = true; persist(); });
    $('#sfind-next').addEventListener('click', findNext);
    $('#sfind-text').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); findNext(); } });
    $('#sfind-close').addEventListener('click', () => { $('#sheet-find').hidden = true; });
  }

  function isTextFocus() {
    const ae = document.activeElement;
    return ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
  }

  function startResize(e, c) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX, startW = colW(c);
    const col = grid.querySelector('colgroup').children[c + 1];
    const move = ev => {
      const w = Math.max(20, startW + ev.clientX - startX);
      col.style.width = w + 'px';
      grid.style.width = (parseFloat(grid.style.width) + w - (parseFloat(col.dataset.w || startW))) + 'px';
      col.dataset.w = w;
    };
    const up = ev => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const w = Math.max(20, startW + ev.clientX - startX);
      if (w !== startW) {
        beginSnap();
        sheet().colW[c] = w;
        commitSnap();
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  return { init, open, newSheet, persist, isDirty: () => dirty, _debug: () => ({ model, value }) };
})();
