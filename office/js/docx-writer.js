/* Converts the editor's HTML into a real .docx (Office Open XML) file using JSZip.
   Supports: headings, paragraphs, bold/italic/underline/strike, colours, highlight,
   font size/family, sub/superscript, alignment, indents, bullet and numbered lists
   (nested), tables (with column spans), images, links, line breaks and page breaks. */
'use strict';

const DocxWriter = (() => {
  const X = Util.xml;
  const TWIP_PER_PX = 15;         // 1px = 0.75pt = 15 twips
  const EMU_PER_PX = 9525;
  const MAX_IMG_PX = 624;         // 6.5in usable width at 96dpi
  const FONT_SIZES = { 1: 8, 2: 10, 3: 12, 4: 14, 5: 18, 6: 24, 7: 36 }; // <font size=N> in pt

  const BLOCK = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'TABLE', 'BLOCKQUOTE',
    'PRE', 'HR', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'FIGURE', 'FIGCAPTION', 'ADDRESS',
    'DL', 'DT', 'DD', 'CENTER']);
  const CONTAINERS = new Set(['DIV', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'ASIDE', 'NAV', 'FIGURE', 'DL', 'CENTER', 'BLOCKQUOTE']);

  function isBlock(n) { return n.nodeType === 1 && BLOCK.has(n.tagName); }
  function hasBlockChild(el) { for (const c of el.childNodes) if (isBlock(c)) return true; return false; }

  function cssPx(v) {
    if (!v) return 0;
    const m = /(-?[\d.]+)\s*(px|pt|em|rem|cm|mm|in)?/.exec(v);
    if (!m) return 0;
    const n = parseFloat(m[1]);
    switch (m[2]) {
      case 'pt': return n * 4 / 3;
      case 'em': case 'rem': return n * 16;
      case 'cm': return n * 96 / 2.54;
      case 'mm': return n * 96 / 25.4;
      case 'in': return n * 96;
      default: return n;
    }
  }

  function build(root, opts = {}) {
    const rels = [];           // extra relationships (images, links)
    const media = [];          // {name, data(Uint8Array)}
    const nums = [];           // numbering instances: {abs: 0|1}
    let relSeq = 10, picSeq = 1;

    function addRel(type, target, external) {
      const id = 'rId' + (relSeq++);
      rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${X(target)}"${external ? ' TargetMode="External"' : ''}/>`);
      return id;
    }

    /* ---------- run properties ---------- */
    function runProps(el, inh) {
      const p = Object.assign({}, inh);
      const t = el.tagName;
      if (t === 'B' || t === 'STRONG' || t === 'TH') p.b = true;
      if (t === 'I' || t === 'EM' || t === 'CITE') p.i = true;
      if (t === 'U' || t === 'INS') p.u = true;
      if (t === 'S' || t === 'STRIKE' || t === 'DEL') p.strike = true;
      if (t === 'SUP') p.va = 'superscript';
      if (t === 'SUB') p.va = 'subscript';
      if (t === 'CODE' || t === 'KBD' || t === 'TT' || t === 'PRE') p.font = 'Consolas';
      if (t === 'MARK') p.shd = 'FFFF00';
      if (t === 'A') { p.color = '0563C1'; p.u = true; }
      if (t === 'FONT') {
        const c = Util.hexColor(el.getAttribute('color'));
        if (c) p.color = c;
        const s = FONT_SIZES[el.getAttribute('size')];
        if (s) p.sz = s;
        if (el.getAttribute('face')) p.font = el.getAttribute('face').split(',')[0].replace(/["']/g, '').trim();
      }
      const st = el.style;
      if (st) {
        const fw = st.fontWeight;
        if (fw === 'bold' || fw === 'bolder' || +fw >= 600) p.b = true;
        else if (fw === 'normal' || (+fw && +fw < 600)) p.b = false;
        if (st.fontStyle === 'italic') p.i = true;
        else if (st.fontStyle === 'normal') p.i = false;
        const td = st.textDecorationLine || st.textDecoration || '';
        if (td.includes('underline')) p.u = true;
        if (td.includes('line-through')) p.strike = true;
        if (st.color) { const c = Util.hexColor(st.color); if (c) p.color = c; }
        if (st.backgroundColor) { const c = Util.hexColor(st.backgroundColor); if (c) p.shd = c; }
        if (st.fontSize) {
          const map = { 'x-small': 8, small: 10, medium: 12, large: 14, 'x-large': 18, 'xx-large': 24, 'xxx-large': 36 };
          const pt = map[st.fontSize] || cssPx(st.fontSize) * 0.75;
          if (pt > 0) p.sz = Math.round(pt * 2) / 2;
        }
        if (st.fontFamily) p.font = st.fontFamily.split(',')[0].replace(/["']/g, '').trim();
        if (st.verticalAlign === 'super') p.va = 'superscript';
        if (st.verticalAlign === 'sub') p.va = 'subscript';
      }
      return p;
    }

    function rPr(p) {
      let s = '';
      if (p.rStyle) s += `<w:rStyle w:val="${p.rStyle}"/>`;
      if (p.font) s += `<w:rFonts w:ascii="${X(p.font)}" w:hAnsi="${X(p.font)}" w:cs="${X(p.font)}"/>`;
      if (p.b) s += '<w:b/><w:bCs/>';
      if (p.i) s += '<w:i/><w:iCs/>';
      if (p.strike) s += '<w:strike/>';
      if (p.color) s += `<w:color w:val="${p.color}"/>`;
      if (p.sz) s += `<w:sz w:val="${Math.round(p.sz * 2)}"/><w:szCs w:val="${Math.round(p.sz * 2)}"/>`;
      if (p.u) s += '<w:u w:val="single"/>';
      if (p.shd) s += `<w:shd w:val="clear" w:color="auto" w:fill="${p.shd}"/>`;
      if (p.va) s += `<w:vertAlign w:val="${p.va}"/>`;
      return s ? `<w:rPr>${s}</w:rPr>` : '';
    }

    function textRun(text, p) {
      if (!text) return '';
      // Newlines (only kept inside <pre>) become line breaks
      if (text.includes('\n')) return text.split(/\r?\n/).map((l, i) => (i ? '<w:r><w:br/></w:r>' : '') + textRun(l, p)).join('');
      // Tabs become real tab characters
      return text.split('\t').map((part, i) =>
        (i ? `<w:r>${rPr(p)}<w:tab/></w:r>` : '') +
        (part ? `<w:r>${rPr(p)}<w:t xml:space="preserve">${X(part)}</w:t></w:r>` : '')
      ).join('');
    }

    function imageRun(img) {
      const src = img.getAttribute('src') || '';
      const m = /^data:image\/(png|jpe?g|gif|bmp|webp|svg\+xml);base64,(.+)$/i.exec(src);
      if (!m) return '';
      let ext = m[1].toLowerCase().replace('jpeg', 'jpg').replace('svg+xml', 'svg');
      if (ext === 'webp' || ext === 'svg') return ''; // not supported by Word 2007-format readers
      const bin = atob(m[2]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const name = `image${picSeq}.${ext}`;
      media.push({ name, data: bytes });
      const rid = addRel('image', 'media/' + name);
      let w = img.width || img.naturalWidth || parseFloat(img.getAttribute('width')) || 300;
      let h = img.height || img.naturalHeight || parseFloat(img.getAttribute('height')) || 200;
      if (w > MAX_IMG_PX) { h = h * MAX_IMG_PX / w; w = MAX_IMG_PX; }
      const cx = Math.round(w * EMU_PER_PX), cy = Math.round(h * EMU_PER_PX);
      const id = picSeq++;
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
        `<wp:docPr id="${id}" name="Picture ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
        `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>` +
        `<pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
        `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
        `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
        `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    }

    /* Inline content -> runs. ctx.pre keeps whitespace. */
    function runs(nodes, p, ctx) {
      let out = '';
      for (const n of nodes) {
        if (n.nodeType === 3) {
          let t = n.nodeValue;
          if (!ctx.pre) t = t.replace(/[ \t\n\r\f]+/g, ' ');
          t = t.replace(/ /g, ' ');
          out += textRun(t, p);
        } else if (n.nodeType === 1) {
          const t = n.tagName;
          if (t === 'BR') out += '<w:r><w:br/></w:r>';
          else if (t === 'IMG') out += imageRun(n);
          else if (t === 'SCRIPT' || t === 'STYLE') continue;
          else if (t === 'A' && /^(https?:|mailto:)/i.test(n.getAttribute('href') || '')) {
            const rid = addRel('hyperlink', n.getAttribute('href'), true);
            out += `<w:hyperlink r:id="${rid}" w:history="1">${runs(n.childNodes, Object.assign(runProps(n, p), { rStyle: 'Hyperlink' }), ctx)}</w:hyperlink>`;
          } else if (n.classList && n.classList.contains('page-break')) out += '<w:r><w:br w:type="page"/></w:r>';
          else out += runs(n.childNodes, runProps(n, p), n.style && /^pre/.test(n.style.whiteSpace) ? Object.assign({}, ctx, { pre: true }) : ctx);
        }
      }
      return out;
    }

    // Trim leading/trailing spaces inside a paragraph so HTML formatting whitespace doesn't leak in.
    function trimRuns(r) {
      return r
        .replace(/^(<w:r>(?:<w:rPr>.*?<\/w:rPr>)?<w:t xml:space="preserve">) +/, '$1')
        .replace(/ +(<\/w:t><\/w:r>)$/, '$1')
        .replace(/<w:r>(?:<w:rPr>(?:(?!<\/w:rPr>).)*<\/w:rPr>)?<w:t xml:space="preserve"><\/w:t><\/w:r>/g, '');
    }

    function align(el) {
      const a = (el.style && el.style.textAlign) || el.getAttribute('align') || '';
      return { left: 'left', start: 'left', center: 'center', right: 'right', end: 'right', justify: 'both' }[a.toLowerCase()] || '';
    }

    function pPr(o) {
      let s = '';
      if (o.style) s += `<w:pStyle w:val="${o.style}"/>`;
      if (o.num) s += `<w:numPr><w:ilvl w:val="${o.num.lvl}"/><w:numId w:val="${o.num.id}"/></w:numPr>`;
      if (o.hr) s += '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>';
      if (o.shd) s += `<w:shd w:val="clear" w:color="auto" w:fill="${o.shd}"/>`;
      if (o.indent) s += `<w:ind w:left="${Math.round(o.indent)}"/>`;
      if (o.jc) s += `<w:jc w:val="${o.jc}"/>`;
      return s ? `<w:pPr>${s}</w:pPr>` : '';
    }

    function paragraph(contentNodes, ctx, extra = {}) {
      const o = Object.assign({ indent: ctx.indent || 0, jc: ctx.jc || '' }, extra);
      if (!o.style && ctx.style) o.style = ctx.style;
      let r = trimRuns(runs(contentNodes, ctx.run || {}, ctx));
      return `<w:p>${pPr(o)}${r}</w:p>`;
    }

    function blockCtx(el, ctx) {
      const c = Object.assign({}, ctx);
      const a = align(el);
      if (a) c.jc = a;
      const ml = el.style ? cssPx(el.style.marginLeft) + cssPx(el.style.paddingLeft) : 0;
      if (ml > 0) c.indent = (c.indent || 0) + ml * TWIP_PER_PX;
      c.run = runProps(el, c.run || {});
      return c;
    }

    function blocks(parent, ctx) {
      let out = '';
      let inline = [];
      const flush = () => {
        if (inline.some(n => n.nodeType === 1 || /\S/.test(n.nodeValue))) out += paragraph(inline, ctx);
        inline = [];
      };
      for (const n of parent.childNodes) {
        if (!isBlock(n)) {
          if (n.nodeType === 1 && n.classList.contains('page-break')) { flush(); out += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'; }
          else if (n.nodeType === 1 || n.nodeType === 3) inline.push(n);
          continue;
        }
        flush();
        out += block(n, ctx);
      }
      flush();
      return out;
    }

    function block(el, ctx) {
      const t = el.tagName;
      if (el.classList.contains('page-break')) return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
      const c = blockCtx(el, ctx);
      if (t === 'HR') return `<w:p>${pPr({ hr: true })}</w:p>`;
      if (t === 'UL' || t === 'OL') return list(el, c, 0);
      if (t === 'TABLE') return table(el, c);
      if (t === 'BLOCKQUOTE') {
        const bq = Object.assign({}, c);
        // Chrome's "indent" command produces <blockquote style="margin:0 0 0 40px">; plain quotes get 0.5in
        if (!(el.style && el.style.marginLeft)) bq.indent = (bq.indent || 0) + 720;
        return hasBlockChild(el) ? blocks(el, bq) : paragraph(el.childNodes, bq);
      }
      if (/^H[1-6]$/.test(t)) return paragraph(el.childNodes, Object.assign({}, c, { style: 'Heading' + t[1] }));
      if (t === 'PRE') return paragraph(el.childNodes, Object.assign({}, c, { pre: true }));
      if (t === 'LI') return paragraph(el.childNodes, c);
      if (CONTAINERS.has(t) && hasBlockChild(el)) return blocks(el, c);
      if (hasBlockChild(el)) return blocks(el, c);
      if (t === 'DIV' && !el.textContent.trim() && !el.querySelector('img,br')) return '<w:p/>';
      return paragraph(el.childNodes, c);
    }

    function list(el, ctx, lvl) {
      const id = nums.length + 1;
      nums.push({ abs: el.tagName === 'OL' ? 1 : 0, start: parseInt(el.getAttribute('start'), 10) || 1 });
      let out = '';
      for (const li of el.children) {
        if (li.tagName === 'UL' || li.tagName === 'OL') { out += list(li, ctx, Math.min(lvl + 1, 8)); continue; }
        const lc = blockCtx(li, ctx);
        lc.indent = 0;
        let inline = [];
        let first = true;
        const flush = () => {
          if (!inline.length && !first) return;
          out += paragraph(inline, lc, first ? { num: { id, lvl }, indent: 0 } : { indent: 720 * (lvl + 1) });
          first = false;
          inline = [];
        };
        for (const n of li.childNodes) {
          if (n.nodeType === 1 && (n.tagName === 'UL' || n.tagName === 'OL')) { flush(); out += list(n, ctx, Math.min(lvl + 1, 8)); }
          else if (isBlock(n)) { inline.push(...n.childNodes); }
          else inline.push(n);
        }
        if (inline.length || first) flush();
      }
      return out;
    }

    function table(el, ctx) {
      const rows = [...el.rows];
      if (!rows.length) return '';
      let cols = 0;
      for (const r of rows) cols = Math.max(cols, [...r.cells].reduce((s, c) => s + (c.colSpan || 1), 0));
      const colW = Math.floor(9026 / cols);
      let out = '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="5000" w:type="pct"/>' +
        '<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>' +
        '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders>' +
        '<w:tblLook w:val="04A0"/></w:tblPr><w:tblGrid>' + `<w:gridCol w:w="${colW}"/>`.repeat(cols) + '</w:tblGrid>';
      const cellCtx = Object.assign({}, ctx, { indent: 0, jc: '' });
      const pending = []; // grid column -> { left: rows still covered, span } for row-spanned cells
      const contCell = span => `<w:tc><w:tcPr><w:tcW w:w="${colW * span}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}<w:vMerge/></w:tcPr><w:p/></w:tc>`;
      for (const r of rows) {
        out += '<w:tr>';
        let used = 0;
        const fillPending = () => {
          while (pending[used] && pending[used].left > 0) {
            const pd = pending[used];
            out += contCell(pd.span);
            pd.left--;
            used += pd.span;
          }
        };
        for (const cell of r.cells) {
          fillPending();
          const span = cell.colSpan || 1;
          const rs = cell.rowSpan || 1;
          if (rs > 1) pending[used] = { left: rs - 1, span };
          used += span;
          const cc = blockCtx(cell, cellCtx);
          if (cell.tagName === 'TH') cc.run = Object.assign({}, cc.run, { b: true });
          const bg = cell.style && Util.hexColor(cell.style.backgroundColor);
          let inner = blocks(cell, cc);
          if (!inner.endsWith('</w:p>') && !inner.endsWith('<w:p/>')) inner += '<w:p/>';
          out += `<w:tc><w:tcPr><w:tcW w:w="${colW * span}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}` +
            `${rs > 1 ? '<w:vMerge w:val="restart"/>' : ''}${bg ? `<w:shd w:val="clear" w:color="auto" w:fill="${bg}"/>` : ''}</w:tcPr>${inner}</w:tc>`;
        }
        fillPending();
        for (; used < cols; used++) out += `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/></w:tcPr><w:p/></w:tc>`;
        out += '</w:tr>';
      }
      return out + '</w:tbl><w:p/>';
    }

    let body = blocks(root, { indent: 0, run: {} });
    if (!body) body = '<w:p/>';

    return { body, rels, media, nums, title: opts.title || 'Document' };
  }

  function numberingXml(nums) {
    const bullets = ['●', '○', '■', '●', '○', '■', '●', '○', '■'];
    const fmts = ['decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman', 'decimal', 'lowerLetter', 'lowerRoman'];
    const lvl = (i, fmt, text, font) =>
      `<w:lvl w:ilvl="${i}"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/>` +
      `<w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr>${font ? `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:hint="default"/></w:rPr>` : ''}</w:lvl>`;
    let s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>' +
      bullets.map((b, i) => lvl(i, 'bullet', b, 'Arial')).join('') + '</w:abstractNum>' +
      '<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>' +
      fmts.map((f, i) => lvl(i, f, `%${i + 1}.`)).join('') + '</w:abstractNum>';
    nums.forEach((n, i) => {
      s += `<w:num w:numId="${i + 1}"><w:abstractNumId w:val="${n.abs}"/>`;
      for (let l = 0; l < 9; l++) s += `<w:lvlOverride w:ilvl="${l}"><w:startOverride w:val="${l === 0 ? n.start : 1}"/></w:lvlOverride>`;
      s += '</w:num>';
    });
    return s + '</w:numbering>';
  }

  const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:eastAsia="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>' +
    '<w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault>' +
    '<w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="259" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
    [1, 2, 3, 4, 5, 6].map(n => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/>` +
      `<w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>` +
      `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${n === 1 ? 240 : 40}" w:after="${n === 1 ? 120 : 40}"/><w:outlineLvl w:val="${n - 1}"/></w:pPr>` +
      `<w:rPr><w:rFonts w:asciiTheme="majorHAnsi" w:hAnsiTheme="majorHAnsi"/><w:color w:val="${n <= 2 ? '2F5496' : '1F3763'}"/>` +
      `<w:sz w:val="${[0, 32, 26, 24, 22, 22, 22][n]}"/><w:szCs w:val="${[0, 32, 26, 24, 22, 22, 22][n]}"/></w:rPr></w:style>`).join('') +
    '<w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style>' +
    '<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:basedOn w:val="DefaultParagraphFont"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>' +
    '<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr></w:style>' +
    '<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/>' +
    '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>' +
    '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:style>' +
    '</w:styles>';

  async function toBlob(root, title) {
    const d = build(root, { title });
    const zip = new JSZip();
    const exts = new Set(d.media.map(m => m.name.split('.').pop()));
    const imgTypes = { png: 'image/png', jpg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp' };
    zip.file('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      [...exts].map(e => `<Default Extension="${e}" ContentType="${imgTypes[e]}"/>`).join('') +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '</Types>');
    zip.file('_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '</Relationships>');
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    zip.file('docProps/core.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
      'xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      `<dc:title>${X(d.title)}</dc:title><dc:creator>Lite Office</dc:creator>` +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>` +
      '</cp:coreProperties>');
    zip.file('word/_rels/document.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>' +
      d.rels.join('') + '</Relationships>');
    zip.file('word/styles.xml', STYLES);
    zip.file('word/numbering.xml', numberingXml(d.nums));
    zip.file('word/document.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      `<w:body>${d.body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>` +
      '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>');
    for (const m of d.media) zip.file('word/media/' + m.name, m.data);
    return zip.generateAsync({ type: 'blob', mimeType: Util.MIME.docx, compression: 'DEFLATE' });
  }

  return { toBlob, build };
})();
