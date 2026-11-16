/* coordinates.js — conversione A1 <-> indici (0-based) */
const Coord = {
  colName(i) { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; },
  colIndex(s) { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; },
  parse(ref) { const m = /^([A-Z]+)(\d+)$/.exec(ref); return m ? { c: this.colIndex(m[1]), r: +m[2] - 1 } : null; },
  name(r, c) { return this.colName(c) + (r + 1); }
};
if (typeof module !== 'undefined') module.exports = Coord;
