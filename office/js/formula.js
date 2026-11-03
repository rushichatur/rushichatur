/* A small Excel-compatible formula engine.
   Supports operators (+ - * / ^ & % = <> < > <= >=), cell refs (A1, $A$1, Sheet2!B3, 'My Sheet'!A1),
   ranges (A1:C9, A:A) and ~80 common functions. */
'use strict';

const Formula = (() => {
  class FErr { constructor(code) { this.code = code; } toString() { return this.code; } }
  const E = {
    DIV0: new FErr('#DIV/0!'), VALUE: new FErr('#VALUE!'), REF: new FErr('#REF!'), NAME: new FErr('#NAME?'),
    NA: new FErr('#N/A'), NUM: new FErr('#NUM!'), CIRC: new FErr('#CIRC!'), NULL: new FErr('#NULL!'),
  };
  const isErr = v => v instanceof FErr;

  /* ---------- A1 helpers ---------- */
  function colToNum(s) { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
  function numToCol(n) { let s = ''; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
  function addr(r, c) { return numToCol(c) + (r + 1); }
  function parseAddr(a) { const m = /^\$?([A-Za-z]{1,3})\$?(\d+)$/.exec(a); return m ? { r: +m[2] - 1, c: colToNum(m[1]) } : null; }

  /* ---------- Tokenizer ---------- */
  const SHEET = "(?:'(?:[^']|'')+'|[A-Za-z_\\u00C0-\\uFFFF][\\w.\\u00C0-\\uFFFF]*)";
  const CELL = '\\$?[A-Za-z]{1,3}\\$?\\d+';
  const COLR = '\\$?[A-Za-z]{1,3}:\\$?[A-Za-z]{1,3}';
  const REF_RE = new RegExp(`^(?:(${SHEET})!)?(?:(${CELL})(?::(${CELL}))?|(${COLR}))(?![\\w(!])`, 'i');

  function unquoteSheet(s) { return s && s[0] === "'" ? s.slice(1, -1).replace(/''/g, "'") : s; }

  function tokenize(src) {
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/\s/.test(ch)) { i++; continue; }
      const rest = src.slice(i);
      let m;
      if (ch === '"') {
        let j = i + 1, s = '';
        while (j < src.length) {
          if (src[j] === '"') { if (src[j + 1] === '"') { s += '"'; j += 2; continue; } break; }
          s += src[j++];
        }
        if (j >= src.length) throw E.VALUE;
        toks.push({ t: 'str', v: s }); i = j + 1; continue;
      }
      if ((m = /^(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)/.exec(rest))) {
        // numbers (a cell ref never starts with a digit, so no ambiguity)
        toks.push({ t: 'num', v: parseFloat(m[1]) }); i += m[1].length; continue;
      }
      if ((m = REF_RE.exec(rest))) {
        const sheet = unquoteSheet(m[1]) || null;
        if (m[4]) {
          const [a, b] = m[4].replace(/\$/g, '').split(':');
          toks.push({ t: 'range', sheet, r1: 0, c1: colToNum(a), r2: -1, c2: colToNum(b) });
        } else if (m[3]) {
          const a = parseAddr(m[2]), b = parseAddr(m[3]);
          toks.push({ t: 'range', sheet, r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) });
        } else {
          const a = parseAddr(m[2]);
          toks.push({ t: 'ref', sheet, r: a.r, c: a.c });
        }
        i += m[0].length; continue;
      }
      if ((m = /^([A-Za-z_][\w.]*)\s*\(/.exec(rest))) { toks.push({ t: 'fn', v: m[1].toUpperCase() }); i += m[0].length; continue; }
      if ((m = /^(TRUE|FALSE)(?![\w(])/i.exec(rest))) { toks.push({ t: 'bool', v: m[1].toUpperCase() === 'TRUE' }); i += m[0].length; continue; }
      if ((m = /^#(DIV\/0!|VALUE!|REF!|NAME\?|N\/A|NUM!|NULL!)/i.exec(rest))) { toks.push({ t: 'err', v: new FErr(m[0].toUpperCase()) }); i += m[0].length; continue; }
      if ((m = /^(<=|>=|<>|[-+*/^&=<>%(),;])/.exec(rest))) { toks.push({ t: 'op', v: m[1] === ';' ? ',' : m[1] }); i += m[1].length; continue; }
      if ((m = /^[A-Za-z_][\w.]*/.exec(rest))) { toks.push({ t: 'name', v: m[0] }); i += m[0].length; continue; }
      throw E.NAME;
    }
    return toks;
  }

  /* ---------- Parser (precedence climbing) ---------- */
  const BIN = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };
  function parse(src) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const isOp = (v) => toks[p] && toks[p].t === 'op' && toks[p].v === v;

    function primary() {
      const tk = toks[p++];
      if (!tk) throw E.VALUE;
      switch (tk.t) {
        case 'num': return { t: 'num', v: tk.v };
        case 'str': return { t: 'str', v: tk.v };
        case 'bool': return { t: 'bool', v: tk.v };
        case 'err': return { t: 'errv', v: tk.v };
        case 'ref': return tk;
        case 'range': return tk;
        case 'name': return { t: 'errv', v: E.NAME };
        case 'fn': {
          const args = [];
          if (isOp(')')) { p++; return { t: 'fn', name: tk.v, args }; }
          for (;;) {
            if (isOp(',')) { args.push({ t: 'blank' }); p++; continue; }
            if (isOp(')')) { args.push({ t: 'blank' }); p++; break; }
            args.push(expr(0));
            if (isOp(',')) { p++; if (isOp(')')) { args.push({ t: 'blank' }); p++; break; } continue; }
            if (isOp(')')) { p++; break; }
            throw E.VALUE;
          }
          return { t: 'fn', name: tk.v, args };
        }
        case 'op':
          if (tk.v === '(') { const e = expr(0); if (!isOp(')')) throw E.VALUE; p++; return e; }
          if (tk.v === '-' || tk.v === '+') return { t: 'un', op: tk.v, a: unary() };
      }
      throw E.VALUE;
    }
    function unary() {
      let e = primary();
      while (isOp('%')) { p++; e = { t: 'pct', a: e }; }
      return e;
    }
    function expr(minPrec) {
      let left = unary();
      for (;;) {
        const tk = peek();
        if (!tk || tk.t !== 'op' || !(tk.v in BIN)) break;
        const prec = BIN[tk.v];
        if (prec < minPrec) break;
        p++;
        const right = expr(prec + 1); // all binary operators are left-associative in Excel
        left = { t: 'bin', op: tk.v, a: left, b: right };
      }
      return left;
    }
    const ast = expr(0);
    if (p < toks.length) throw E.VALUE;
    return ast;
  }

  const astCache = new Map();
  function getAst(src) {
    let a = astCache.get(src);
    if (a === undefined) {
      try { a = parse(src); } catch (e) { a = { t: 'errv', v: isErr(e) ? e : E.VALUE }; }
      if (astCache.size > 5000) astCache.clear();
      astCache.set(src, a);
    }
    return a;
  }

  /* ---------- Coercion ---------- */
  function num(v) {
    if (isErr(v)) throw v;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v == null || v === '') return 0;
    if (v instanceof Range) return num(v.first());
    const s = String(v).trim().replace(/,/g, '');
    if (/%$/.test(s) && !isNaN(parseFloat(s))) return parseFloat(s) / 100;
    const n = Number(s);
    if (s !== '' && !isNaN(n)) return n;
    throw E.VALUE;
  }
  function fmtNum(n) {
    if (!isFinite(n)) return '#NUM!';
    return String(parseFloat(n.toPrecision(15)));
  }
  function str(v) {
    if (isErr(v)) throw v;
    if (v instanceof Range) return str(v.first());
    if (v == null) return '';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    if (typeof v === 'number') return fmtNum(v);
    return String(v);
  }
  function bool(v) {
    if (isErr(v)) throw v;
    if (v instanceof Range) return bool(v.first());
    if (typeof v === 'boolean') return v;
    if (typeof v === 'number') return v !== 0;
    if (v == null || v === '') return false;
    const s = String(v).toUpperCase();
    if (s === 'TRUE') return true;
    if (s === 'FALSE') return false;
    throw E.VALUE;
  }
  function scalar(v) { return v instanceof Range ? v.first() : v; }

  class Range {
    constructor(rows) { this.rows = rows; }
    first() { return this.rows[0] ? this.rows[0][0] : null; }
    *values() { for (const r of this.rows) for (const v of r) yield v; }
    get h() { return this.rows.length; }
    get w() { return this.rows[0] ? this.rows[0].length : 0; }
  }

  function* flat(args) {
    for (const a of args) {
      if (a instanceof Range) { for (const v of a.values()) yield { v, fromRange: true }; }
      else yield { v: a, fromRange: false };
    }
  }
  function nums(args) {
    const out = [];
    for (const { v, fromRange } of flat(args)) {
      if (isErr(v)) throw v;
      if (fromRange) { if (typeof v === 'number') out.push(v); }
      else if (v !== undefined) out.push(num(v));
    }
    return out;
  }

  function cmp(a, b) {
    // Excel ordering: numbers < text < booleans; blanks act like 0 / ""
    if (a == null) a = typeof b === 'string' ? '' : (typeof b === 'boolean' ? false : 0);
    if (b == null) b = typeof a === 'string' ? '' : (typeof a === 'boolean' ? false : 0);
    const rank = v => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : 2);
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 1) { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
    return a < b ? -1 : a > b ? 1 : 0;
  }

  // Criteria like ">5", "<>apple", "a*", 10 for SUMIF/COUNTIF
  function criteria(c) {
    c = scalar(c);
    if (typeof c === 'number' || typeof c === 'boolean') return v => v === c || (typeof v === 'string' && v !== '' && Number(v) === c);
    const s = str(c);
    const m = /^(<=|>=|<>|=|<|>)?(.*)$/s.exec(s);
    const op = m[1] || '=';
    let target = m[2];
    const tn = target !== '' && !isNaN(Number(target)) ? Number(target) : null;
    if (tn === null && (op === '=' || op === '<>') && /[*?]/.test(target)) {
      const re = new RegExp('^' + target.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
      return v => (op === '=') === re.test(v == null ? '' : String(v));
    }
    const t = tn !== null ? tn : target;
    return v => {
      if (isErr(v)) return false;
      if (op === '=' && t === '') return v == null || v === '';
      if (op === '<>' && t === '') return !(v == null || v === '');
      if (tn !== null && typeof v !== 'number') { if (op === '<>') return true; return false; }
      if (tn === null && typeof v === 'number' && op !== '<>') return false;
      const d = cmp(v, t);
      switch (op) { case '=': return d === 0; case '<>': return d !== 0; case '<': return d < 0; case '>': return d > 0; case '<=': return d <= 0; case '>=': return d >= 0; }
    };
  }

  /* ---------- Dates (Excel serials, 1900 system) ---------- */
  const EPOCH = Date.UTC(1899, 11, 30);
  const toSerial = d => (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCH) / 864e5 + (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) / 86400;
  const fromSerial = s => new Date(EPOCH + Math.floor(s) * 864e5);

  function round(x, d, mode) {
    const f = Math.pow(10, d);
    const v = Math.abs(x) * f;
    let r = mode === 'up' ? Math.ceil(v - 1e-9) : mode === 'down' ? Math.floor(v + 1e-9) : Math.round(v + 1e-9);
    return Math.sign(x) * r / f;
  }

  function lookupIndex(v, list, exact) {
    v = scalar(v);
    if (exact) {
      if (typeof v === 'string' && /[*?]/.test(v)) { const t = criteria(v); return list.findIndex(x => t(x)); }
      return list.findIndex(x => x != null && cmp(x, v) === 0 && typeof x === typeof v || (typeof v === 'number' && typeof x === 'string' && Number(x) === v));
    }
    // approximate: last value <= v (list assumed sorted ascending)
    let best = -1;
    for (let i = 0; i < list.length; i++) {
      const x = list[i];
      if (x == null) continue;
      if (cmp(x, v) <= 0) best = i; else break;
    }
    return best;
  }

  /* ---------- Functions ---------- */
  const LAZY = new Set(['IF', 'IFERROR', 'IFNA', 'IFS', 'CHOOSE', 'ISERROR', 'ISERR', 'ISNA', 'ISBLANK', 'ROW', 'COLUMN', 'ROWS', 'COLUMNS', 'SWITCH']);
  const F = {
    SUM: a => nums(a).reduce((s, x) => s + x, 0),
    PRODUCT: a => nums(a).reduce((s, x) => s * x, 1),
    AVERAGE: a => { const n = nums(a); if (!n.length) throw E.DIV0; return n.reduce((s, x) => s + x, 0) / n.length; },
    MIN: a => { const n = nums(a); return n.length ? Math.min(...n) : 0; },
    MAX: a => { const n = nums(a); return n.length ? Math.max(...n) : 0; },
    MEDIAN: a => { const n = nums(a).sort((x, y) => x - y); if (!n.length) throw E.NUM; const m = n.length >> 1; return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2; },
    COUNT: a => { let c = 0; for (const { v, fromRange } of flat(a)) { if (typeof v === 'number') c++; else if (!fromRange && v != null) { try { num(v); c++; } catch {} } } return c; },
    COUNTA: a => { let c = 0; for (const { v } of flat(a)) if (v != null && v !== '') c++; return c; },
    COUNTBLANK: a => { let c = 0; for (const { v } of flat(a)) if (v == null || v === '') c++; return c; },
    STDEV: a => { const n = nums(a); if (n.length < 2) throw E.DIV0; const m = n.reduce((s, x) => s + x, 0) / n.length; return Math.sqrt(n.reduce((s, x) => s + (x - m) ** 2, 0) / (n.length - 1)); },
    ROUND: ([x, d]) => round(num(x), num(d ?? 0), ''),
    ROUNDUP: ([x, d]) => round(num(x), num(d ?? 0), 'up'),
    ROUNDDOWN: ([x, d]) => round(num(x), num(d ?? 0), 'down'),
    INT: ([x]) => Math.floor(num(x)),
    TRUNC: ([x, d]) => round(num(x), num(d ?? 0), 'down'),
    ABS: ([x]) => Math.abs(num(x)),
    SIGN: ([x]) => Math.sign(num(x)),
    SQRT: ([x]) => { const v = num(x); if (v < 0) throw E.NUM; return Math.sqrt(v); },
    POWER: ([x, y]) => Math.pow(num(x), num(y)),
    EXP: ([x]) => Math.exp(num(x)),
    LN: ([x]) => { const v = num(x); if (v <= 0) throw E.NUM; return Math.log(v); },
    LOG10: ([x]) => { const v = num(x); if (v <= 0) throw E.NUM; return Math.log10(v); },
    LOG: ([x, b]) => { const v = num(x); if (v <= 0) throw E.NUM; return Math.log(v) / Math.log(b == null ? 10 : num(b)); },
    MOD: ([x, y]) => { const d = num(y); if (d === 0) throw E.DIV0; const n = num(x); return n - d * Math.floor(n / d); },
    PI: () => Math.PI,
    RAND: () => Math.random(),
    RANDBETWEEN: ([a, b]) => { const lo = Math.ceil(num(a)), hi = Math.floor(num(b)); return lo + Math.floor(Math.random() * (hi - lo + 1)); },
    CEILING: ([x, s]) => { const v = num(x), st = s == null ? 1 : num(s); return st === 0 ? 0 : Math.ceil(v / st) * st; },
    FLOOR: ([x, s]) => { const v = num(x), st = s == null ? 1 : num(s); if (st === 0) throw E.DIV0; return Math.floor(v / st) * st; },

    LEN: ([s]) => str(s).length,
    UPPER: ([s]) => str(s).toUpperCase(),
    LOWER: ([s]) => str(s).toLowerCase(),
    PROPER: ([s]) => str(s).toLowerCase().replace(/(^|[^a-z])([a-z])/g, (m, a, b) => a + b.toUpperCase()),
    TRIM: ([s]) => str(s).trim().replace(/ +/g, ' '),
    LEFT: ([s, n]) => str(s).slice(0, n == null ? 1 : num(n)),
    RIGHT: ([s, n]) => { const t = str(s), k = n == null ? 1 : num(n); return k <= 0 ? '' : t.slice(-k); },
    MID: ([s, st, n]) => str(s).substr(num(st) - 1, num(n)),
    CONCAT: a => [...flat(a)].map(x => str(x.v)).join(''),
    CONCATENATE: a => a.map(str).join(''),
    TEXTJOIN: ([d, ig, ...rest]) => { const delim = str(d), skip = bool(ig); return [...flat(rest)].map(x => str(x.v)).filter(s => !(skip && s === '')).join(delim); },
    SUBSTITUTE: ([s, o, n, k]) => { const t = str(s), from = str(o), to = str(n); if (!from) return t; if (k == null) return t.split(from).join(to); let c = 0; const want = num(k); return t.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), m => (++c === want ? to : m)); },
    REPLACE: ([s, st, n, r]) => { const t = str(s), i = num(st) - 1; return t.slice(0, i) + str(r) + t.slice(i + num(n)); },
    FIND: ([q, s, st]) => { const i = str(s).indexOf(str(q), (st == null ? 1 : num(st)) - 1); if (i < 0) throw E.VALUE; return i + 1; },
    SEARCH: ([q, s, st]) => { const i = str(s).toLowerCase().indexOf(str(q).toLowerCase(), (st == null ? 1 : num(st)) - 1); if (i < 0) throw E.VALUE; return i + 1; },
    REPT: ([s, n]) => str(s).repeat(Math.max(0, num(n))),
    EXACT: ([a, b]) => str(a) === str(b),
    VALUE: ([s]) => num(s),
    TEXT: ([v, f]) => { const x = scalar(v); try { return XLSX.SSF.format(str(f), typeof x === 'string' && x !== '' && !isNaN(+x) ? +x : x ?? ''); } catch { throw E.VALUE; } },
    CHAR: ([n]) => String.fromCharCode(num(n)),
    CODE: ([s]) => { const t = str(s); if (!t) throw E.VALUE; return t.charCodeAt(0); },

    AND: a => { let r = true, any = false; for (const { v, fromRange } of flat(a)) { if (fromRange && (v == null || typeof v === 'string')) continue; any = true; if (!bool(v)) r = false; } if (!any) throw E.VALUE; return r; },
    OR: a => { let r = false, any = false; for (const { v, fromRange } of flat(a)) { if (fromRange && (v == null || typeof v === 'string')) continue; any = true; if (bool(v)) r = true; } if (!any) throw E.VALUE; return r; },
    XOR: a => { let c = 0; for (const { v, fromRange } of flat(a)) { if (fromRange && (v == null || typeof v === 'string')) continue; if (bool(v)) c++; } return c % 2 === 1; },
    NOT: ([v]) => !bool(v),
    TRUE: () => true,
    FALSE: () => false,
    NA: () => { throw E.NA; },
    ISNUMBER: ([v]) => typeof scalar(v) === 'number',
    ISTEXT: ([v]) => typeof scalar(v) === 'string' && scalar(v) !== '',
    ISLOGICAL: ([v]) => typeof scalar(v) === 'boolean',
    ISEVEN: ([v]) => Math.floor(num(v)) % 2 === 0,
    ISODD: ([v]) => Math.abs(Math.floor(num(v)) % 2) === 1,

    TODAY: () => Math.floor(toSerial(new Date())),
    NOW: () => toSerial(new Date()),
    DATE: ([y, m, d]) => (Date.UTC(num(y), num(m) - 1, num(d)) - EPOCH) / 864e5,
    YEAR: ([s]) => fromSerial(num(s)).getUTCFullYear(),
    MONTH: ([s]) => fromSerial(num(s)).getUTCMonth() + 1,
    DAY: ([s]) => fromSerial(num(s)).getUTCDate(),
    WEEKDAY: ([s, t]) => { const d = fromSerial(num(s)).getUTCDay(); const type = t == null ? 1 : num(t); return type === 2 ? (d + 6) % 7 + 1 : type === 3 ? (d + 6) % 7 : d + 1; },
    DAYS: ([e, s]) => Math.floor(num(e)) - Math.floor(num(s)),
    EDATE: ([s, m]) => { const d = fromSerial(num(s)); return (Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + num(m), d.getUTCDate()) - EPOCH) / 864e5; },
    EOMONTH: ([s, m]) => { const d = fromSerial(num(s)); return (Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + num(m) + 1, 0) - EPOCH) / 864e5; },

    SUMIF: ([r, c, s]) => { const t = criteria(c); const rr = r.rows, sr = (s || r).rows; let sum = 0; rr.forEach((row, i) => row.forEach((v, j) => { if (t(v)) { const x = sr[i] && sr[i][j]; if (typeof x === 'number') sum += x; } })); return sum; },
    COUNTIF: ([r, c]) => { const t = criteria(c); let n = 0; for (const v of r.values()) if (t(v)) n++; return n; },
    AVERAGEIF: ([r, c, s]) => { const t = criteria(c); const rr = r.rows, sr = (s || r).rows; let sum = 0, n = 0; rr.forEach((row, i) => row.forEach((v, j) => { if (t(v)) { const x = sr[i] && sr[i][j]; if (typeof x === 'number') { sum += x; n++; } } })); if (!n) throw E.DIV0; return sum / n; },
    SUMIFS: ([s, ...pairs]) => ifs(pairs, (i, j) => s.rows[i] && s.rows[i][j], 'sum'),
    COUNTIFS: (pairs) => ifs(pairs, null, 'count'),
    AVERAGEIFS: ([s, ...pairs]) => ifs(pairs, (i, j) => s.rows[i] && s.rows[i][j], 'avg'),

    VLOOKUP: ([v, r, ci, approx]) => {
      if (!(r instanceof Range)) throw E.VALUE;
      const col = num(ci) - 1;
      if (col < 0 || col >= r.w) throw E.REF;
      const exact = approx != null && !bool(approx);
      const i = lookupIndex(v, r.rows.map(row => row[0]), exact);
      if (i < 0) throw E.NA;
      return r.rows[i][col];
    },
    HLOOKUP: ([v, r, ri, approx]) => {
      if (!(r instanceof Range)) throw E.VALUE;
      const row = num(ri) - 1;
      if (row < 0 || row >= r.h) throw E.REF;
      const exact = approx != null && !bool(approx);
      const i = lookupIndex(v, r.rows[0], exact);
      if (i < 0) throw E.NA;
      return r.rows[row][i];
    },
    MATCH: ([v, r, type]) => {
      if (!(r instanceof Range)) throw E.VALUE;
      const list = r.h === 1 ? r.rows[0] : r.rows.map(x => x[0]);
      const t = type == null ? 1 : num(type);
      const i = lookupIndex(v, list, t === 0);
      if (i < 0) throw E.NA;
      return i + 1;
    },
    INDEX: ([r, ri, ci]) => {
      if (!(r instanceof Range)) return scalar(r);
      let row = ri == null ? 0 : num(ri) - 1, col = ci == null ? 0 : num(ci) - 1;
      if (r.h === 1 && ci == null) { col = row; row = 0; }
      if (row < 0 || col < 0 || row >= r.h || col >= r.w) throw E.REF;
      return r.rows[row][col];
    },
    XLOOKUP: ([v, lr, rr, nf]) => {
      if (!(lr instanceof Range) || !(rr instanceof Range)) throw E.VALUE;
      const vertical = lr.w === 1;
      const list = vertical ? lr.rows.map(x => x[0]) : lr.rows[0];
      const i = lookupIndex(v, list, true);
      if (i < 0) { if (nf !== undefined) return scalar(nf); throw E.NA; }
      return vertical ? rr.rows[i][0] : rr.rows[0][i];
    },
  };
  F.AVG = F.AVERAGE;
  F['STDEV.S'] = F.STDEV;

  function ifs(pairs, get, mode) {
    if (pairs.length % 2) throw E.VALUE;
    const ranges = [], tests = [];
    for (let k = 0; k < pairs.length; k += 2) { ranges.push(pairs[k]); tests.push(criteria(pairs[k + 1])); }
    const base = ranges[0];
    if (!(base instanceof Range)) throw E.VALUE;
    let sum = 0, n = 0;
    for (let i = 0; i < base.h; i++) for (let j = 0; j < base.w; j++) {
      if (!ranges.every((r, k) => tests[k](r.rows[i] && r.rows[i][j]))) continue;
      if (mode === 'count') { n++; continue; }
      const x = get(i, j);
      if (typeof x === 'number') { sum += x; n++; }
    }
    if (mode === 'count') return n;
    if (mode === 'avg') { if (!n) throw E.DIV0; return sum / n; }
    return sum;
  }

  /* ---------- Evaluator ---------- */
  // ctx: { sheet: name of the formula's sheet, cell(sheet,r,c) -> value, range(sheet,r1,c1,r2,c2) -> 2D array, maxRow(sheet) }
  function ev(n, ctx) {
    switch (n.t) {
      case 'num': case 'str': case 'bool': return n.v;
      case 'blank': return undefined;
      case 'errv': throw n.v;
      case 'ref': return ctx.cell(n.sheet || ctx.sheet, n.r, n.c);
      case 'range': {
        const sh = n.sheet || ctx.sheet;
        const r2 = n.r2 < 0 ? ctx.maxRow(sh) : n.r2;
        return new Range(ctx.range(sh, n.r1, n.c1, r2, n.c2));
      }
      case 'un': { const v = num(scalar(ev(n.a, ctx))); return n.op === '-' ? -v : v; }
      case 'pct': return num(scalar(ev(n.a, ctx))) / 100;
      case 'bin': {
        const a = scalar(ev(n.a, ctx)), b = scalar(ev(n.b, ctx));
        if (isErr(a)) throw a;
        if (isErr(b)) throw b;
        switch (n.op) {
          case '+': return num(a) + num(b);
          case '-': return num(a) - num(b);
          case '*': return num(a) * num(b);
          case '/': { const d = num(b); if (d === 0) throw E.DIV0; return num(a) / d; }
          case '^': return Math.pow(num(a), num(b));
          case '&': return str(a) + str(b);
          case '=': return cmp(a, b) === 0;
          case '<>': return cmp(a, b) !== 0;
          case '<': return cmp(a, b) < 0;
          case '>': return cmp(a, b) > 0;
          case '<=': return cmp(a, b) <= 0;
          case '>=': return cmp(a, b) >= 0;
        }
        throw E.VALUE;
      }
      case 'fn': return call(n, ctx);
    }
    throw E.VALUE;
  }

  function tryEv(n, ctx) { try { return ev(n, ctx); } catch (e) { if (isErr(e)) return e; throw e; } }

  function call(n, ctx) {
    const name = n.name.replace(/^_XLFN\./, '');
    const A = n.args;
    if (LAZY.has(name)) {
      switch (name) {
        case 'IF': { const c = bool(scalar(ev(A[0], ctx))); const br = c ? A[1] : A[2]; if (!br || br.t === 'blank') return c ? 0 : false; return scalar(ev(br, ctx)); }
        case 'IFERROR': { const v = scalar(tryEv(A[0], ctx)); return isErr(v) ? scalar(ev(A[1], ctx)) : v; }
        case 'IFNA': { const v = scalar(tryEv(A[0], ctx)); return isErr(v) && v.code === '#N/A' ? scalar(ev(A[1], ctx)) : v; }
        case 'IFS': { for (let i = 0; i + 1 < A.length; i += 2) if (bool(scalar(ev(A[i], ctx)))) return scalar(ev(A[i + 1], ctx)); throw E.NA; }
        case 'SWITCH': {
          const v = scalar(ev(A[0], ctx));
          let i = 1;
          for (; i + 1 < A.length; i += 2) if (cmp(v, scalar(ev(A[i], ctx))) === 0) return scalar(ev(A[i + 1], ctx));
          if (i < A.length) return scalar(ev(A[i], ctx));
          throw E.NA;
        }
        case 'CHOOSE': { const i = Math.floor(num(scalar(ev(A[0], ctx)))); if (i < 1 || i >= A.length) throw E.VALUE; return scalar(ev(A[i], ctx)); }
        case 'ISERROR': return isErr(scalar(tryEv(A[0], ctx)));
        case 'ISERR': { const v = scalar(tryEv(A[0], ctx)); return isErr(v) && v.code !== '#N/A'; }
        case 'ISNA': { const v = scalar(tryEv(A[0], ctx)); return isErr(v) && v.code === '#N/A'; }
        case 'ISBLANK': { const v = scalar(tryEv(A[0], ctx)); return v == null || v === ''; }
        case 'ROW': return A[0] ? (A[0].r ?? A[0].r1) + 1 : ctx.row + 1;
        case 'COLUMN': return A[0] ? (A[0].c ?? A[0].c1) + 1 : ctx.col + 1;
        case 'ROWS': { const v = ev(A[0], ctx); return v instanceof Range ? v.h : 1; }
        case 'COLUMNS': { const v = ev(A[0], ctx); return v instanceof Range ? v.w : 1; }
      }
    }
    const fn = F[name];
    if (!fn) throw E.NAME;
    const args = A.map(a => (a.t === 'blank' ? undefined : ev(a, ctx)));
    const r = fn(args);
    if (typeof r === 'number' && !isFinite(r)) throw E.NUM;
    return r;
  }

  function evaluate(src, ctx) {
    const ast = getAst(src);
    try {
      let v = ev(ast, ctx);
      if (v instanceof Range) v = v.first();
      if (v === undefined || v === null) return 0;
      return v;
    } catch (e) {
      if (isErr(e)) return e;
      console.error(e);
      return E.VALUE;
    }
  }

  /* ---------- Rewriting references (copy/paste, insert/delete rows & columns) ---------- */
  const REWRITE_RE = new RegExp(`("(?:[^"]|"")*")|(?:(${SHEET})!)?(\\$?)([A-Za-z]{1,3})(\\$?)(\\d+)(?![\\w(!])`, 'g');
  // fn(sheetOrNull, {r, c, absR, absC}) -> {r, c} | null (=> #REF!)
  function rewrite(src, fn) {
    return src.replace(REWRITE_RE, (m, s, sheet, dc, col, dr, row, off, whole) => {
      if (s) return m;
      const prev = whole[off - 1];
      if (prev && /[\w.]/.test(prev)) return m; // part of a longer name
      const res = fn(sheet ? unquoteSheet(sheet) : null, { r: +row - 1, c: colToNum(col), absR: !!dr, absC: !!dc });
      if (!res) return '#REF!';
      if (res.r < 0 || res.c < 0) return '#REF!';
      return (sheet ? sheet + '!' : '') + dc + numToCol(res.c) + dr + (res.r + 1);
    });
  }
  function translate(src, dRow, dCol) {
    return rewrite(src, (sh, a) => ({ r: a.absR ? a.r : a.r + dRow, c: a.absC ? a.c : a.c + dCol }));
  }
  // Insert (delta>0) or delete (delta<0) rows/cols at index `at` in sheet `target`. `own` = sheet containing the formula.
  function shift(src, own, target, axis, at, delta) {
    return rewrite(src, (sh, a) => {
      if ((sh || own) !== target) return { r: a.r, c: a.c };
      const k = axis === 'row' ? a.r : a.c;
      let nk = k;
      if (delta > 0) { if (k >= at) nk = k + delta; }
      else { const cnt = -delta; if (k >= at && k < at + cnt) return null; if (k >= at + cnt) nk = k - cnt; }
      return axis === 'row' ? { r: nk, c: a.c } : { r: a.r, c: nk };
    });
  }

  function functionNames() { return Object.keys(F).concat([...LAZY]).sort(); }

  return { evaluate, isErr, FErr, E, colToNum, numToCol, addr, parseAddr, translate, shift, functionNames, fmtNum };
})();
