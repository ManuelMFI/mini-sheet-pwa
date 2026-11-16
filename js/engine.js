/* engine.js — parser formule + valutazione + dipendenze. Nessuna libreria esterna. */
const _Co = typeof Coord !== 'undefined' ? Coord : require('./coordinates.js');
class XErr { constructor(c) { this.c = c; } }          // errore di cella: #DIV/0! #VALORE! #RIF! #NOME? #CIRC!
const E = c => new XErr(c);

/* ---- Condizioni di SOMMA.SE / CONTA.SE / MEDIA.SE: ">5", "<=3", "<>x", "testo", 7 ---- */
const OPS = { '>': (a, b) => a > b, '<': (a, b) => a < b, '>=': (a, b) => a >= b,
  '<=': (a, b) => a <= b, '<>': (a, b) => a !== b, '=': (a, b) => a === b };
function cond(c) {
  if (Array.isArray(c)) throw E('#VALORE!');
  const m = /^(>=|<=|<>|>|<|=)?([\s\S]*)$/.exec(String(c)), op = m[1] || '=', t = m[2].trim();
  const n = Number(t), isN = t !== '' && isFinite(n);
  return v => {
    if (isN) return typeof v === 'number' ? OPS[op](v, n) : op === '<>';   // confronto numerico
    if (op !== '=' && op !== '<>') return false;
    return OPS[op](String(v).toLowerCase(), t.toLowerCase());               // confronto testuale (no maiuscole)
  };
}

/* ---- Funzioni. Ricevono (foglio, argomenti già valutati); un intervallo è un array piatto ---- */
const sum = a => a.reduce((x, y) => x + y, 0);
const num1 = a => a.filter(v => typeof v === 'number');
function nums(S, args) {   // dagli intervalli contano solo i numeri; gli argomenti diretti devono essere numerici
  const o = [];
  for (const a of args) Array.isArray(a) ? a.forEach(v => typeof v === 'number' && o.push(v)) : o.push(S.num(a));
  return o;
}
function ifm(a) {          // valori (a[2] o a[0]) le cui celle in a[0] soddisfano la condizione a[1]
  if (!Array.isArray(a[0])) throw E('#VALORE!');
  const t = cond(a[1]), s = Array.isArray(a[2]) ? a[2] : a[0];
  return a[0].reduce((o, v, i) => (t(v) && o.push(s[i]), o), []);
}
const FN = {
  'SOMMA': (S, a) => sum(nums(S, a)),
  'MEDIA': (S, a) => { const n = nums(S, a); if (!n.length) throw E('#DIV/0!'); return sum(n) / n.length; },
  'CONTA': (S, a) => nums(S, a).length,
  'CONTA.VALORI': (S, a) => a.flat().filter(v => v !== '').length,
  'MAX': (S, a) => { const n = nums(S, a); return n.length ? Math.max(...n) : 0; },
  'MIN': (S, a) => { const n = nums(S, a); return n.length ? Math.min(...n) : 0; },
  'SOMMA.SE': (S, a) => sum(num1(ifm(a))),
  'CONTA.SE': (S, a) => ifm(a).length,
  'MEDIA.SE': (S, a) => { const n = num1(ifm(a)); if (!n.length) throw E('#DIV/0!'); return sum(n) / n.length; }
};

/* ---- PARSER: tokenizzazione + discesa ricorsiva (precedenza: parentesi > unario > * / > + -) ----
   Produce un AST: ['n',num] ['s',testo] ['c',r,c] ['r',r1,c1,r2,c2] ['b',op,sx,dx] ['u',x] ['f',nome,args]
   `refs` raccoglie i rettangoli letti dalla formula: serve al grafo delle dipendenze. */
function parse(src, refs) {
  const T = [], re = /\s*(?:(\d+\.?\d*|\.\d+)|"([^"]*)"|([A-Za-z_$][\w.$]*)|([-+*\/();,:]))/y;
  for (let p = 0; p < src.length;) {
    re.lastIndex = p; const m = re.exec(src);
    if (!m) { if (/^\s*$/.test(src.slice(p))) break; throw E('#VALORE!'); }
    p = re.lastIndex;
    T.push(m[1] !== undefined ? ['n', +m[1]] : m[2] !== undefined ? ['s', m[2]] : m[3] !== undefined ? ['i', m[3].toUpperCase().replace(/\$/g, '')] : ['o', m[4]]);
  }
  let i = 0;
  const isO = o => T[i] && T[i][0] === 'o' && T[i][1] === o;
  const expr = () => { let l = term(); while (isO('+') || isO('-')) { const o = T[i++][1]; l = ['b', o, l, term()]; } return l; };
  const term = () => { let l = un(); while (isO('*') || isO('/')) { const o = T[i++][1]; l = ['b', o, l, un()]; } return l; };
  const un = () => isO('-') ? (i++, ['u', un()]) : isO('+') ? (i++, un()) : prim();
  const ref = t => { const a = t && t[0] === 'i' && _Co.parse(t[1]); if (!a) throw E('#NOME?'); if (a.r < 0) throw E('#RIF!'); return a; };
  function prim() {
    const t = T[i++]; if (!t) throw E('#VALORE!');
    if (t[0] === 'n' || t[0] === 's') return t;
    if (t[0] === 'o' && t[1] === '(') { const e = expr(); if (!isO(')')) throw E('#VALORE!'); i++; return e; }
    if (t[0] !== 'i') throw E('#VALORE!');
    if (isO('(')) {                                   // chiamata di funzione: NOME(arg;arg;...)
      if (!FN[t[1]]) throw E('#NOME?');
      i++; const a = [];
      if (!isO(')')) do a.push(expr()); while ((isO(';') || isO(',')) && ++i);
      if (!isO(')')) throw E('#VALORE!'); i++;
      return ['f', t[1], a];
    }
    const a = ref(t);
    if (isO(':')) {                                   // intervallo A1:B5 (anche su più colonne)
      i++; const b = ref(T[i++]);
      const n = ['r', Math.min(a.r, b.r), Math.min(a.c, b.c), Math.max(a.r, b.r), Math.max(a.c, b.c)];
      refs.push(n.slice(1)); return n;
    }
    refs.push([a.r, a.c, a.r, a.c]); return ['c', a.r, a.c];
  }
  const ast = expr(); if (i < T.length) throw E('#VALORE!');
  return ast;
}

class Sheet {
  constructor(R, C) { this.R = R; this.C = C; this.raw = new Map(); this.val = new Map(); this.F = new Map(); }
  getRaw(r, c) { return this.raw.get(r * 1000 + c) || ''; }

  /* Imposta una cella (numero, testo o formula) e invalida SOLO le formule che ne dipendono. */
  set(r, c, t) {
    const k = r * 1000 + c; t = t.trim();
    this.raw.delete(k); this.val.delete(k); this.F.delete(k);
    if (t) {
      this.raw.set(k, t);
      if (t[0] === '=') {
        const f = { refs: [], v: undefined, busy: 0 };
        try { f.ast = parse(t.slice(1), f.refs); } catch (e) { if (!(e instanceof XErr)) throw e; f.err = e; }
        this.F.set(k, f);
      } else { const n = Number(t); this.val.set(k, isFinite(n) ? n : t); }
    }
    this.dirty(r, c);
  }

  /* RICALCOLO INCREMENTALE: visita a catena le formule il cui intervallo contiene la cella cambiata,
     azzerandone la cache (f.v). Le altre restano calcolate; le invalidate si ricalcolano "pigramente" quando servono. */
  dirty(r, c) {
    const out = new Set([r * 1000 + c]), q = [[r, c]];
    while (q.length) {
      const [y, x] = q.pop();
      for (const [k, f] of this.F) {
        if (out.has(k) || !f.refs.some(g => g[0] <= y && y <= g[2] && g[1] <= x && x <= g[3])) continue;
        out.add(k); f.v = undefined; q.push([k / 1000 | 0, k % 1000]);
      }
    }
  }

  show(r, c) {   // valore da visualizzare (numero | testo | XErr)
    const k = r * 1000 + c, f = this.F.get(k);
    const v = f ? this.calc(f) : this.val.get(k); return v === undefined ? '' : v;
  }
  /* Valuta una formula con cache. `busy` rileva i riferimenti circolari (A1->B1->A1, A1=A1). */
  calc(f) {
    if (f.v !== undefined) return f.v;
    if (f.busy) throw E('#CIRC!');
    f.busy = 1;
    try { if (f.err) throw f.err; f.v = this.ev(f.ast); }
    catch (e) { if (!(e instanceof XErr)) throw e; f.v = e; }
    finally { f.busy = 0; }
    return f.v;
  }
  get(r, c) {   // lettura di una cella dentro una formula: propaga gli errori
    if (r < 0 || c < 0 || r >= this.R || c >= this.C) throw E('#RIF!');
    const v = this.show(r, c); if (v instanceof XErr) throw v; return v;
  }
  num(v) {      // conversione a numero per + - * /
    if (typeof v === 'number') return v;
    if (v === '') return 0;
    if (typeof v === 'string' && isFinite(Number(v))) return Number(v);
    throw E('#VALORE!');
  }
  ev(n) {
    switch (n[0]) {
      case 'n': case 's': return n[1];
      case 'c': return this.get(n[1], n[2]);
      case 'r': {
        if (n[3] >= this.R || n[4] >= this.C) throw E('#RIF!');
        const a = []; for (let r = n[1]; r <= n[3]; r++) for (let c = n[2]; c <= n[4]; c++) a.push(this.get(r, c));
        return a;
      }
      case 'u': return -this.num(this.ev(n[1]));
      case 'b': {
        const a = this.num(this.ev(n[2])), b = this.num(this.ev(n[3]));
        if (n[1] === '+') return a + b; if (n[1] === '-') return a - b; if (n[1] === '*') return a * b;
        if (b === 0) throw E('#DIV/0!'); return a / b;
      }
      case 'f': return FN[n[1]](this, n[2].map(x => this.ev(x)));
    }
  }
}
if (typeof module !== 'undefined') module.exports = { Sheet, XErr };
