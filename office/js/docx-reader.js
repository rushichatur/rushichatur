/* Reads a .docx into editable HTML, keeping the formatting our editor understands:
   headings, bold/italic/underline/strike, colours, highlight, font size/family, sub/superscript,
   alignment, indents, bullet/numbered lists (nested), tables (merged cells, shading), links,
   images, line and page breaks. */
'use strict';

const DocxReader = (() => {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const HIGHLIGHT = {
    yellow: 'FFFF00', green: '00FF00', cyan: '00FFFF', magenta: 'FF00FF', blue: '0000FF', red: 'FF0000',
    darkBlue: '000080', darkCyan: '008080', darkGreen: '008000', darkMagenta: '800080', darkRed: '800000',
    darkYellow: '808000', darkGray: '808080', lightGray: 'C0C0C0', black: '000000', white: 'FFFFFF',
  };

  const kids = (el, name) => el ? [...el.childNodes].filter(n => n.nodeType === 1 && (!name || n.localName === name)) : [];
  const kid = (el, name) => kids(el, name)[0] || null;
  const wv = (el, attr = 'val') => el ? (el.getAttributeNS(W, attr) ?? el.getAttribute('w:' + attr)) : null;
  const onOff = el => { if (!el) return undefined; const v = wv(el); return !(v === '0' || v === 'false' || v === 'off' || v === 'none'); };

  function parseRPr(rPr) {
    const o = {};
    if (!rPr) return o;
    for (const el of kids(rPr)) {
      switch (el.localName) {
        case 'b': o.b = onOff(el); break;
        case 'i': o.i = onOff(el); break;
        case 'u': o.u = wv(el) !== 'none' && wv(el) !== '0'; break;
        case 'strike': case 'dstrike': o.strike = onOff(el); break;
        case 'color': { const v = wv(el); if (v && v !== 'auto' && /^[0-9A-Fa-f]{6}$/.test(v)) o.color = v.toUpperCase(); break; }
        case 'sz': { const v = parseInt(wv(el), 10); if (v) o.sz = v / 2; break; }
        case 'highlight': { const v = HIGHLIGHT[wv(el)]; if (v) o.bg = v; break; }
        case 'shd': { const v = wv(el, 'fill'); if (v && v !== 'auto' && /^[0-9A-Fa-f]{6}$/.test(v)) o.bg = o.bg || v.toUpperCase(); break; }
        case 'vertAlign': { const v = wv(el); if (v === 'superscript' || v === 'subscript') o.va = v; break; }
        case 'rFonts': { const v = wv(el, 'ascii') || wv(el, 'hAnsi'); if (v) o.font = v; break; }
        case 'rStyle': o.rStyle = wv(el); break;
        case 'vanish': o.hidden = onOff(el); break;
      }
    }
    return o;
  }

  async function toHtml(arrayBuffer) {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const dp = new DOMParser();
    const load = async p => { const f = zip.file(p); return f ? dp.parseFromString(await f.async('string'), 'application/xml') : null; };
    const doc = await load('word/document.xml');
    if (!doc) throw new Error('Not a Word document');
    const stylesXml = await load('word/styles.xml');
    const numXml = await load('word/numbering.xml');
    const relsXml = await load('word/_rels/document.xml.rels');

    /* relationships */
    const rels = {};
    if (relsXml) for (const r of relsXml.getElementsByTagName('Relationship')) rels[r.getAttribute('Id')] = { target: r.getAttribute('Target'), external: r.getAttribute('TargetMode') === 'External' };

    /* styles */
    const styles = {};
    let defaultRPr = {}, defaultPStyle = null;
    if (stylesXml) {
      const dd = stylesXml.getElementsByTagNameNS(W, 'rPrDefault')[0];
      if (dd) defaultRPr = parseRPr(kid(dd, 'rPr'));
      for (const s of stylesXml.getElementsByTagNameNS(W, 'style')) {
        const id = wv(s, 'styleId');
        const pPr = kid(s, 'pPr');
        styles[id] = {
          type: wv(s, 'type'),
          name: (wv(kid(s, 'name')) || '').toLowerCase(),
          basedOn: wv(kid(s, 'basedOn')),
          rPr: parseRPr(kid(s, 'rPr')),
          jc: pPr ? wv(kid(pPr, 'jc')) : null,
          numPr: pPr ? kid(pPr, 'numPr') : null,
          outline: pPr && kid(pPr, 'outlineLvl') ? +wv(kid(pPr, 'outlineLvl')) : null,
        };
        if (wv(s, 'default') === '1' && wv(s, 'type') === 'paragraph') defaultPStyle = id;
      }
    }
    const styleChain = id => { const out = []; const seen = new Set(); while (id && styles[id] && !seen.has(id)) { seen.add(id); out.unshift(styles[id]); id = styles[id].basedOn; } return out; };
    const styleRPr = id => Object.assign({}, ...styleChain(id).map(s => s.rPr));
    const styleProp = (id, key) => { const ch = styleChain(id); for (let i = ch.length - 1; i >= 0; i--) if (ch[i][key] != null) return ch[i][key]; return null; };
    // The editor's own defaults; only differences from these are written as inline styles
    const BASE_SZ = 11, BASE_FONT = 'Calibri';

    function headingLevel(id) {
      for (const st of styleChain(id).reverse()) {
        const hm = /^heading (\d)$/.exec(st.name);
        if (hm) return +hm[1];
        if (st.name === 'title') return 1;
        if (st.name === 'subtitle') return 2;
      }
      const im = /^Heading(\d)$/i.exec(id || '');
      return im ? +im[1] : 0;
    }

    /* numbering */
    const absFmt = {}, numToAbs = {};
    if (numXml) {
      for (const a of numXml.getElementsByTagNameNS(W, 'abstractNum')) {
        const lv = {};
        for (const l of kids(a, 'lvl')) lv[+wv(l, 'ilvl')] = { fmt: wv(kid(l, 'numFmt')), start: +(wv(kid(l, 'start')) || 1) };
        absFmt[wv(a, 'abstractNumId')] = lv;
      }
      for (const n of numXml.getElementsByTagNameNS(W, 'num')) numToAbs[wv(n, 'numId')] = wv(kid(n, 'abstractNumId'));
    }
    const listInfo = (numId, lvl) => {
      const a = absFmt[numToAbs[numId]];
      const l = a && a[lvl];
      if (!l || l.fmt === 'none') return null;
      return { tag: l.fmt === 'bullet' ? 'ul' : 'ol', start: l.start };
    };

    /* images */
    const mediaCache = {};
    async function imageData(rid) {
      const rel = rels[rid];
      if (!rel || rel.external) return null;
      const path = rel.target.startsWith('/') ? rel.target.slice(1) : 'word/' + rel.target.replace(/^\.\//, '');
      if (mediaCache[path] !== undefined) return mediaCache[path];
      const f = zip.file(path);
      const ext = path.split('.').pop().toLowerCase();
      const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' }[ext];
      mediaCache[path] = f && mime ? `data:${mime};base64,${await f.async('base64')}` : null;
      return mediaCache[path];
    }

    const H = document.implementation.createHTMLDocument('');
    const out = H.createElement('div');

    /* ---- runs ---- */
    function styleSpan(props, text) {
      // returns an element/text node wrapping text with formatting
      let node = H.createTextNode(text);
      const css = [];
      if (props.color) css.push(`color:#${props.color}`);
      if (props.bg) css.push(`background-color:#${props.bg}`);
      if (props.sz && Math.abs(props.sz - BASE_SZ) > 0.01) css.push(`font-size:${props.sz}pt`);
      if (props.font && props.font !== BASE_FONT) css.push(`font-family:'${props.font.replace(/'/g, '')}'`);
      if (text.includes('\t')) css.push('white-space:pre');
      if (css.length) { const s = H.createElement('span'); s.setAttribute('style', css.join(';')); s.appendChild(node); node = s; }
      for (const [k, tag] of [['va', null], ['strike', 's'], ['u', 'u'], ['i', 'i'], ['b', 'b']]) {
        if (k === 'va') { if (props.va) { const e = H.createElement(props.va === 'superscript' ? 'sup' : 'sub'); e.appendChild(node); node = e; } continue; }
        if (props[k]) { const e = H.createElement(tag); e.appendChild(node); node = e; }
      }
      return node;
    }

    // Converts the inline children of a paragraph. tgt() gives the element to append to;
    // ctx.pageBreak() starts a new paragraph after a page break.
    async function inline(parent, pProps, tgt, ctx) {
      for (const el of kids(parent)) {
        switch (el.localName) {
          case 'r': await run(el, pProps, tgt, ctx); break;
          case 'hyperlink': {
            const rid = el.getAttributeNS(R, 'id');
            const rel = rid && rels[rid];
            if (rel && rel.external && /^(https?:|mailto:)/i.test(rel.target)) {
              const a = H.createElement('a');
              a.setAttribute('href', rel.target);
              tgt().appendChild(a);
              await inline(el, Object.assign({}, pProps, { inLink: true }), () => a, ctx);
            } else await inline(el, pProps, tgt, ctx);
            break;
          }
          case 'ins': case 'smartTag': case 'customXml': case 'fldSimple': case 'bdo': case 'dir':
            await inline(el, pProps, tgt, ctx); break;
          case 'sdt': await inline(kid(el, 'sdtContent'), pProps, tgt, ctx); break;
        }
      }
    }

    async function run(r, pProps, tgt, ctx) {
      const direct = parseRPr(kid(r, 'rPr'));
      const props = Object.assign({}, pProps, direct.rStyle ? styleRPr(direct.rStyle) : {}, direct);
      if (props.hidden) return;
      if (pProps.inLink) { delete props.u; if (props.color === '0563C1' || props.color === '0000FF') delete props.color; }
      let buf = '';
      const flush = () => { if (buf) { tgt().appendChild(styleSpan(props, buf)); buf = ''; } };
      for (const el of kids(r)) {
        switch (el.localName) {
          case 't': buf += el.textContent; break;
          case 'tab': buf += '\t'; break;
          case 'noBreakHyphen': buf += '‑'; break;
          case 'softHyphen': break;
          case 'sym': {
            let code = parseInt(el.getAttributeNS(W, 'char') || '', 16);
            if (code >= 0xf000) code -= 0xf000; // symbol-font private range
            if (code > 31) buf += String.fromCharCode(code);
            break;
          }
          case 'br': case 'cr':
            flush();
            if (wv(el, 'type') === 'page') ctx.pageBreak(); else tgt().appendChild(H.createElement('br'));
            break;
          case 'lastRenderedPageBreak': break;
          case 'drawing': case 'pict': case 'object': {
            flush();
            const blip = el.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main', 'blip')[0];
            const vimg = el.getElementsByTagNameNS('urn:schemas-microsoft-com:vml', 'imagedata')[0];
            const rid = blip ? (blip.getAttributeNS(R, 'embed') || blip.getAttributeNS(R, 'link')) : vimg ? vimg.getAttributeNS(R, 'id') : null;
            const src = rid && await imageData(rid);
            if (src) {
              const img = H.createElement('img');
              img.setAttribute('src', src);
              const ext = el.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'extent')[0];
              if (ext) {
                img.setAttribute('width', Math.round(+ext.getAttribute('cx') / 9525));
                img.setAttribute('height', Math.round(+ext.getAttribute('cy') / 9525));
              }
              tgt().appendChild(img);
            }
            break;
          }
        }
      }
      flush();
    }

    /* ---- paragraphs & lists ---- */
    let listStack = []; // [{lvl, numId, el(list), lastLi}]
    function closeLists() { listStack = []; }

    async function paragraph(p, container) {
      const pPr = kid(p, 'pPr');
      const sid = (pPr && wv(kid(pPr, 'pStyle'))) || defaultPStyle;
      const level = headingLevel(sid);
      const pStyleRPr = styleRPr(sid);
      // Headings get their look from the editor's heading styles, so their style's size/colour isn't repeated per run
      const pProps = level ? {} : Object.assign({}, defaultRPr, pStyleRPr);
      delete pProps.rStyle;

      let numPr = pPr && kid(pPr, 'numPr');
      if (!numPr) numPr = styleProp(sid, 'numPr');
      let list = null;
      if (numPr) {
        const numId = wv(kid(numPr, 'numId'));
        const lvl = +(wv(kid(numPr, 'ilvl')) || 0);
        if (numId && numId !== '0') { const li = listInfo(numId, lvl); if (li) list = Object.assign(li, { numId, lvl }); }
      }

      const jc = (pPr && wv(kid(pPr, 'jc'))) || styleProp(sid, 'jc');
      const align = { center: 'center', right: 'right', end: 'right', both: 'justify', distribute: 'justify' }[jc];
      const ind = pPr && kid(pPr, 'ind');
      const left = ind ? parseInt(wv(ind, 'left') || wv(ind, 'start') || '0', 10) : 0;

      const tag = level ? 'h' + Math.min(level, 6) : 'p';
      const make = () => {
        const e = H.createElement(list ? 'li' : tag);
        if (align) e.style.textAlign = align;
        if (!list && left > 0) e.style.marginLeft = Math.round(left / 15) + 'px';
        return e;
      };
      let cur = make();
      const pieces = [cur];
      const ctx = {
        pageBreak() {
          const br = H.createElement('div');
          br.className = 'page-break';
          br.setAttribute('contenteditable', 'false');
          cur = make();
          pieces.push(br, cur);
        },
      };
      await inline(p, pProps, () => cur, ctx);
      // Empty paragraphs keep their height (but drop an empty one left over after a trailing page break)
      if (pieces.length > 1 && !cur.textContent && !cur.querySelector('img,br')) pieces.pop();
      for (const e of pieces) if (e.tagName !== 'DIV' && !e.textContent && !e.querySelector('img')) e.appendChild(H.createElement('br'));

      if (!list) {
        closeLists();
        for (const e of pieces) container.appendChild(e);
        return;
      }
      // place <li> into the right (possibly nested) list
      while (listStack.length && listStack[listStack.length - 1].lvl > list.lvl) listStack.pop();
      let top = listStack[listStack.length - 1];
      // A different numbered list restarts numbering; bullets with a different list id just continue
      if (top && top.lvl === list.lvl && (top.el.tagName.toLowerCase() !== list.tag || (list.tag === 'ol' && top.numId !== list.numId))) { listStack.pop(); top = listStack[listStack.length - 1]; }
      if (!top || top.lvl < list.lvl) {
        const L = H.createElement(list.tag);
        if (list.tag === 'ol' && list.start > 1) L.setAttribute('start', list.start);
        if (top && top.lastLi) top.lastLi.appendChild(L); else container.appendChild(L);
        top = { lvl: list.lvl, numId: list.numId, el: L, lastLi: null };
        listStack.push(top);
      }
      top.el.appendChild(pieces[0]);
      top.lastLi = pieces[0];
      for (const e of pieces.slice(1)) { if (e.tagName === 'DIV') pieces[0].appendChild(H.createElement('br')); else while (e.firstChild) pieces[0].appendChild(e.firstChild); }
    }

    async function table(tbl, container) {
      closeLists();
      const t = H.createElement('table');
      const tb = H.createElement('tbody');
      t.appendChild(tb);
      const vOrigin = {}; // grid column -> td that started a vertical merge
      for (const tr of kids(tbl, 'tr')) {
        const row = H.createElement('tr');
        let col = 0;
        for (const tc of kids(tr).flatMap(n => n.localName === 'sdt' ? kids(kid(n, 'sdtContent'), 'tc') : n.localName === 'tc' ? [n] : [])) {
          const tcPr = kid(tc, 'tcPr');
          const span = tcPr && kid(tcPr, 'gridSpan') ? +wv(kid(tcPr, 'gridSpan')) || 1 : 1;
          const vm = tcPr && kid(tcPr, 'vMerge');
          if (vm && wv(vm) !== 'restart') {
            const o = vOrigin[col];
            if (o) { o.rowSpan = (o.rowSpan || 1) + 1; col += span; continue; }
          }
          const td = H.createElement('td');
          if (span > 1) td.colSpan = span;
          const shd = tcPr && kid(tcPr, 'shd');
          const fill = shd && wv(shd, 'fill');
          if (fill && fill !== 'auto' && /^[0-9A-Fa-f]{6}$/.test(fill)) td.style.backgroundColor = '#' + fill;
          const saved = listStack; listStack = [];
          await blocks(tc, td);
          listStack = saved;
          // single plain paragraph -> unwrap for cleaner editing
          if (td.children.length === 1 && td.firstElementChild.tagName === 'P' && !td.firstElementChild.getAttribute('style')) {
            const p = td.firstElementChild;
            while (p.firstChild) td.insertBefore(p.firstChild, p);
            p.remove();
          }
          if (vm) vOrigin[col] = td; else delete vOrigin[col];
          row.appendChild(td);
          col += span;
        }
        tb.appendChild(row);
      }
      container.appendChild(t);
    }

    async function blocks(parent, container) {
      for (const el of kids(parent)) {
        switch (el.localName) {
          case 'p': await paragraph(el, container); break;
          case 'tbl': await table(el, container); break;
          case 'sdt': await blocks(kid(el, 'sdtContent'), container); break;
          case 'customXml': case 'ins': await blocks(el, container); break;
        }
      }
      closeLists();
    }

    await blocks(kid(doc.documentElement, 'body'), out);
    return out.innerHTML || '<p><br></p>';
  }

  return { toHtml };
})();
