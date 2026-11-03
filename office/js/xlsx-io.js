/* Reading and writing spreadsheet files.
   Reading uses SheetJS (xlsx/xlsm/xls/ods/csv) plus a light parser for cell styles in .xlsx.
   Writing .xlsx is done here directly so bold/italic/colours/fills/alignment are kept. */
'use strict';

const XlsxIO = (() => {
  const X = Util.xml;
  const key = (r, c) => r * 16384 + c;

  function emptySheet(name) { return { name, cells: new Map(), colW: {}, merges: [] }; }

  /* ---------- Reading ---------- */
  async function read(data, filename) {
    const ext = Util.extOf(filename);
    let wb;
    if (ext === 'csv' || ext === 'txt') {
      let text = new TextDecoder('utf-8').decode(data);
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      // raw: keep text exactly as written (no date re-formatting); plain numbers are converted below
      wb = XLSX.read(text, { type: 'string', raw: true, cellFormula: false, cellNF: true, cellDates: false });
      for (const ws of Object.values(wb.Sheets)) for (const k of Object.keys(ws)) {
        const c = ws[k];
        if (k[0] !== '!' && c.t === 's' && /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(c.v.trim()) && !/^0\d/.test(c.v.trim())) { c.t = 'n'; c.v = Number(c.v); }
      }
    } else {
      wb = XLSX.read(new Uint8Array(data), { type: 'array', cellFormula: true, cellNF: true, cellDates: false, cellStyles: true });
    }
    let styleMaps = null;
    if (ext === 'xlsx' || ext === 'xlsm') {
      try { styleMaps = await readStyles(data); } catch (e) { console.warn('style read failed', e); }
    }
    const model = { sheets: [] };
    wb.SheetNames.forEach((name, si) => {
      const ws = wb.Sheets[name];
      const sh = emptySheet(name);
      const smap = styleMaps && styleMaps.sheets[si];
      for (const k of Object.keys(ws)) {
        if (k[0] === '!') continue;
        const c = ws[k];
        const pos = XLSX.utils.decode_cell(k);
        const cell = {};
        if (c.f) cell.f = c.f;
        if (c.t === 'e') cell.v = c.w || '#N/A';
        else if (c.t === 'd') cell.v = c.w || String(c.v);
        else if (c.t !== 'z' && c.v !== undefined) cell.v = c.v;
        if (c.z && c.z !== 'General') cell.z = String(c.z);
        if (smap) {
          const s = smap.get(k);
          if (s != null && styleMaps.xfs[s]) {
            const st = styleMaps.xfs[s];
            if (Object.keys(st).length) cell.s = Object.assign({}, st);
          }
        }
        if (cell.v === undefined && !cell.f && !cell.s) continue;
        sh.cells.set(key(pos.r, pos.c), cell);
      }
      // Style-only cells that SheetJS skipped (e.g. coloured empty cells)
      if (smap) {
        for (const [ref, s] of smap) {
          const pos = XLSX.utils.decode_cell(ref);
          const kk = key(pos.r, pos.c);
          if (!sh.cells.has(kk) && styleMaps.xfs[s] && (styleMaps.xfs[s].fill)) sh.cells.set(kk, { s: Object.assign({}, styleMaps.xfs[s]) });
        }
      }
      (ws['!cols'] || []).forEach((col, i) => {
        if (!col) return;
        const px = col.wpx || (col.wch ? Math.round(col.wch * 7 + 5) : col.width ? Math.round(col.width * 7) : 0);
        if (px && Math.abs(px - 72) > 2) sh.colW[i] = col.hidden ? 0 : Math.max(20, Math.min(800, px));
      });
      sh.merges = (ws['!merges'] || []).map(m => ({ r1: m.s.r, c1: m.s.c, r2: m.e.r, c2: m.e.c }));
      model.sheets.push(sh);
    });
    if (!model.sheets.length) model.sheets.push(emptySheet('Sheet1'));
    return model;
  }

  // Parse styles.xml (fonts, fills, alignment) and each sheet's cell->style index.
  async function readStyles(data) {
    const zip = await JSZip.loadAsync(data);
    const dp = new DOMParser();
    const getXml = async p => { const f = zip.file(p); return f ? dp.parseFromString(await f.async('string'), 'application/xml') : null; };
    const rgb = el => { const v = el && el.getAttribute('rgb'); return v && /^[0-9A-Fa-f]{6,8}$/.test(v) ? v.slice(-6).toUpperCase() : null; };
    const xfs = [];
    const st = await getXml('xl/styles.xml');
    if (st) {
      const byTag = (root, tag) => root ? [...root.getElementsByTagName(tag)] : [];
      const fontsEl = st.getElementsByTagName('fonts')[0];
      const fonts = byTag(fontsEl, 'font').map(f => {
        const o = {};
        const b = f.getElementsByTagName('b')[0], i = f.getElementsByTagName('i')[0], u = f.getElementsByTagName('u')[0];
        if (b && b.getAttribute('val') !== '0' && b.getAttribute('val') !== 'false') o.b = true;
        if (i && i.getAttribute('val') !== '0' && i.getAttribute('val') !== 'false') o.i = true;
        if (u && u.getAttribute('val') !== 'none') o.u = true;
        const c = rgb(f.getElementsByTagName('color')[0]);
        if (c && c !== '000000') o.color = c;
        return o;
      });
      const fillsEl = st.getElementsByTagName('fills')[0];
      const fills = byTag(fillsEl, 'fill').map(f => {
        const p = f.getElementsByTagName('patternFill')[0];
        if (!p || p.getAttribute('patternType') !== 'solid') return null;
        return rgb(p.getElementsByTagName('fgColor')[0]);
      });
      const cellXfs = st.getElementsByTagName('cellXfs')[0];
      for (const xf of byTag(cellXfs, 'xf')) {
        const o = Object.assign({}, fonts[+xf.getAttribute('fontId') || 0] || {});
        const fill = fills[+xf.getAttribute('fillId') || 0];
        if (fill) o.fill = fill;
        const al = xf.getElementsByTagName('alignment')[0];
        const h = al && al.getAttribute('horizontal');
        if (h === 'left' || h === 'center' || h === 'right') o.align = h;
        xfs.push(o);
      }
    }
    // Map sheets in workbook order to their xml parts
    const wbx = await getXml('xl/workbook.xml');
    const rels = await getXml('xl/_rels/workbook.xml.rels');
    const relMap = {};
    if (rels) for (const r of rels.getElementsByTagName('Relationship')) relMap[r.getAttribute('Id')] = r.getAttribute('Target');
    const sheets = [];
    if (wbx) {
      for (const s of wbx.getElementsByTagName('sheet')) {
        const rid = s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        let target = relMap[rid] || '';
        target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
        const f = zip.file(target);
        const map = new Map();
        if (f) {
          const txt = await f.async('string');
          const re = /<c\b([^>]*?)\/?>/g;
          let m;
          while ((m = re.exec(txt))) {
            const attrs = m[1];
            const r = /\br="([A-Z]+\d+)"/.exec(attrs), sIdx = /\bs="(\d+)"/.exec(attrs);
            if (r && sIdx && sIdx[1] !== '0') map.set(r[1], +sIdx[1]);
          }
        }
        sheets.push(map);
      }
    }
    return { xfs, sheets };
  }

  /* ---------- Writing .xlsx ---------- */
  // valueOf(sheetIndex, r, c, cell) -> computed value for formula cells
  async function writeXlsx(model, valueOf) {
    const zip = new JSZip();
    const fonts = ['<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>'];
    const fontIdx = new Map([['', 0]]);
    const fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
    const fillIdx = new Map([['', 0]]);
    const numFmts = [];
    const fmtIdx = new Map([['General', 0], ['@', 49]]);
    const xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    const xfIdx = new Map([['0|0|0|', 0]]);

    function styleId(cell) {
      const s = cell.s || {};
      const fk = (s.b ? 'b' : '') + (s.i ? 'i' : '') + (s.u ? 'u' : '') + (s.color ? s.color : '');
      let f = fontIdx.get(fk);
      if (f === undefined) {
        f = fonts.length;
        fonts.push(`<font>${s.b ? '<b/>' : ''}${s.i ? '<i/>' : ''}${s.u ? '<u/>' : ''}<sz val="11"/>` +
          `${s.color ? `<color rgb="FF${s.color}"/>` : '<color theme="1"/>'}<name val="Calibri"/><family val="2"/><scheme val="minor"/></font>`);
        fontIdx.set(fk, f);
      }
      let fl = fillIdx.get(s.fill || '');
      if (fl === undefined) {
        fl = fills.length;
        fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="FF${s.fill}"/><bgColor indexed="64"/></patternFill></fill>`);
        fillIdx.set(s.fill, fl);
      }
      const z = cell.z || 'General';
      let n = fmtIdx.get(z);
      if (n === undefined) {
        n = 164 + numFmts.length;
        numFmts.push(`<numFmt numFmtId="${n}" formatCode="${X(z)}"/>`);
        fmtIdx.set(z, n);
      }
      const al = s.align || '';
      const k = `${n}|${f}|${fl}|${al}`;
      let x = xfIdx.get(k);
      if (x === undefined) {
        x = xfs.length;
        xfs.push(`<xf numFmtId="${n}" fontId="${f}" fillId="${fl}" borderId="0" xfId="0"` +
          `${n ? ' applyNumberFormat="1"' : ''}${f ? ' applyFont="1"' : ''}${fl ? ' applyFill="1"' : ''}` +
          (al ? ` applyAlignment="1"><alignment horizontal="${al}"/></xf>` : '/>'));
        xfIdx.set(k, x);
      }
      return x;
    }

    const numStr = n => (Number.isFinite(n) ? String(n).toUpperCase() : '0');

    model.sheets.forEach((sh, si) => {
      const rows = new Map();
      let maxR = 0, maxC = 0;
      for (const [k, cell] of sh.cells) {
        const r = Math.floor(k / 16384), c = k % 16384;
        if (!rows.has(r)) rows.set(r, []);
        rows.get(r).push([c, cell]);
        maxR = Math.max(maxR, r); maxC = Math.max(maxC, c);
      }
      let sd = '';
      for (const r of [...rows.keys()].sort((a, b) => a - b)) {
        sd += `<row r="${r + 1}">`;
        for (const [c, cell] of rows.get(r).sort((a, b) => a[0] - b[0])) {
          const ref = Formula.addr(r, c);
          const s = styleId(cell);
          const sa = s ? ` s="${s}"` : '';
          if (cell.f) {
            const v = valueOf(si, r, c, cell);
            const f = `<f>${X(cell.f)}</f>`;
            if (Formula.isErr(v)) sd += `<c r="${ref}"${sa} t="e">${f}<v>${X(v.code)}</v></c>`;
            else if (typeof v === 'number') sd += `<c r="${ref}"${sa}>${f}<v>${numStr(v)}</v></c>`;
            else if (typeof v === 'boolean') sd += `<c r="${ref}"${sa} t="b">${f}<v>${v ? 1 : 0}</v></c>`;
            else sd += `<c r="${ref}"${sa} t="str">${f}<v>${X(v == null ? '' : v)}</v></c>`;
          } else if (typeof cell.v === 'number') sd += `<c r="${ref}"${sa}><v>${numStr(cell.v)}</v></c>`;
          else if (typeof cell.v === 'boolean') sd += `<c r="${ref}"${sa} t="b"><v>${cell.v ? 1 : 0}</v></c>`;
          else if (cell.v != null && cell.v !== '') {
            const t = String(cell.v);
            if (/^#(DIV\/0!|VALUE!|REF!|NAME\?|N\/A|NUM!|NULL!)$/.test(t)) sd += `<c r="${ref}"${sa} t="e"><v>${t}</v></c>`;
            else sd += `<c r="${ref}"${sa} t="inlineStr"><is><t xml:space="preserve">${X(t)}</t></is></c>`;
          } else if (s) sd += `<c r="${ref}"${sa}/>`;
        }
        sd += '</row>';
      }
      const colKeys = Object.keys(sh.colW).map(Number).sort((a, b) => a - b);
      const cols = colKeys.length ? '<cols>' + colKeys.map(c => {
        const px = sh.colW[c];
        return px === 0 ? `<col min="${c + 1}" max="${c + 1}" width="0" hidden="1" customWidth="1"/>`
          : `<col min="${c + 1}" max="${c + 1}" width="${Math.max(1, (px - 5) / 7).toFixed(2)}" customWidth="1"/>`;
      }).join('') + '</cols>' : '';
      const merges = sh.merges.length ? `<mergeCells count="${sh.merges.length}">` +
        sh.merges.map(m => `<mergeCell ref="${Formula.addr(m.r1, m.c1)}:${Formula.addr(m.r2, m.c2)}"/>`).join('') + '</mergeCells>' : '';
      zip.file(`xl/worksheets/sheet${si + 1}.xml`,
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<dimension ref="A1:${Formula.addr(maxR, maxC)}"/>` +
        `<sheetViews><sheetView workbookViewId="0"${si === 0 ? ' tabSelected="1"' : ''}/></sheetViews>` +
        '<sheetFormatPr defaultRowHeight="15"/>' + cols + `<sheetData>${sd}</sheetData>` + merges +
        '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>');
    });

    zip.file('xl/styles.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (numFmts.length ? `<numFmts count="${numFmts.length}">${numFmts.join('')}</numFmts>` : '') +
      `<fonts count="${fonts.length}">${fonts.join('')}</fonts>` +
      `<fills count="${fills.length}">${fills.join('')}</fills>` +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>');

    const n = model.sheets.length;
    zip.file('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      model.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>');
    zip.file('_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>');
    zip.file('xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      model.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      '</Relationships>');
    zip.file('xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<bookViews><workbookView/></bookViews><sheets>' +
      model.sheets.map((s, i) => `<sheet name="${X(s.name.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
      '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
    return zip.generateAsync({ type: 'blob', mimeType: Util.MIME.xlsx, compression: 'DEFLATE' });
  }

  /* ---------- Other formats via SheetJS (values + formulas, no styling) ---------- */
  function writeOther(model, valueOf, bookType) {
    const wb = XLSX.utils.book_new();
    model.sheets.forEach((sh, si) => {
      const ws = {};
      let maxR = 0, maxC = 0;
      for (const [k, cell] of sh.cells) {
        const r = Math.floor(k / 16384), c = k % 16384;
        let v = cell.f ? valueOf(si, r, c, cell) : cell.v;
        if (v == null && !cell.f) continue;
        maxR = Math.max(maxR, r); maxC = Math.max(maxC, c);
        const o = {};
        if (Formula.isErr(v)) {
          const codes = { '#NULL!': 0x00, '#DIV/0!': 0x07, '#VALUE!': 0x0f, '#REF!': 0x17, '#NAME?': 0x1d, '#NUM!': 0x24, '#N/A': 0x2a };
          o.t = 'e'; o.v = codes[v.code] ?? 0x0f; o.w = v.code;
        }
        else if (typeof v === 'number') { o.t = 'n'; o.v = v; }
        else if (typeof v === 'boolean') { o.t = 'b'; o.v = v; }
        else { o.t = 's'; o.v = v == null ? '' : String(v); }
        if (cell.f) o.f = cell.f;
        if (cell.z) o.z = cell.z;
        ws[Formula.addr(r, c)] = o;
      }
      ws['!ref'] = 'A1:' + Formula.addr(maxR, maxC);
      if (sh.merges.length) ws['!merges'] = sh.merges.map(m => ({ s: { r: m.r1, c: m.c1 }, e: { r: m.r2, c: m.c2 } }));
      XLSX.utils.book_append_sheet(wb, ws, sh.name.slice(0, 31));
    });
    const out = XLSX.write(wb, { bookType, type: 'array' });
    return new Blob([out], { type: Util.MIME[bookType] || 'application/octet-stream' });
  }

  /* ---------- Autosave serialisation ---------- */
  function toJSON(model) {
    return {
      sheets: model.sheets.map(s => ({ name: s.name, colW: s.colW, merges: s.merges, cells: [...s.cells] })),
      active: model.active || 0,
    };
  }
  function fromJSON(o) {
    return {
      active: o.active || 0,
      sheets: o.sheets.map(s => ({ name: s.name, colW: s.colW || {}, merges: s.merges || [], cells: new Map(s.cells) })),
    };
  }

  return { read, writeXlsx, writeOther, emptySheet, toJSON, fromJSON, key };
})();
