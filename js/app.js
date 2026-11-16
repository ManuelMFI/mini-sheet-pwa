/* app.js — UI: griglia VIRTUALIZZATA, selezione, editing, tastiera, salvataggio, PWA */
const W = 90, H = 26, HW = 46, HH = 26, R = 100, C = 100;      // cella, intestazioni, dimensioni griglia
const sheet = new Sheet(R, C);
const $ = id => document.getElementById(id);
const sc = $('sc'), sp = $('sp'), ly = $('ly'), cells = $('cells'), ed = $('ed'), fb = $('fb'), nb = $('nb');
let sr = 0, scol = 0, editing = false, raf = 0, saveT = 0, lastT = 0;
const MSG = { '#DIV/0!': 'Divisione per zero', '#VALORE!': 'Valore o sintassi non valida', '#RIF!': 'Riferimento non valido',
  '#NOME?': 'Funzione o nome sconosciuto', '#CIRC!': 'Riferimento circolare' };
const esc = s => String(s).replace(/[&<>"]/g, c => '&#' + c.charCodeAt(0) + ';');
const fmt = v => v instanceof XErr ? v.c : typeof v === 'number' ? String(+v.toPrecision(12)) : v;

/* VIRTUALIZZAZIONE: #sp (spacer) dà all'area di scroll la dimensione totale (100x100 celle) senza creare 10.000 nodi.
   #ly è "sticky" e grande quanto il viewport: a ogni scroll ridisegniamo SOLO le ~30x15 celle visibili,
   posizionate in assoluto (x = colonna*W - scrollLeft). Intestazioni e cella selezionata seguono lo stesso schema. */
sp.style.width = HW + C * W + 'px'; sp.style.height = HH + R * H + 'px';
function render() {
  raf = 0;
  const sl = sc.scrollLeft, st = sc.scrollTop, vw = sc.clientWidth, vh = sc.clientHeight;
  ly.style.width = vw + 'px'; ly.style.height = vh + 'px';
  const c0 = Math.floor(sl / W), c1 = Math.min(C - 1, Math.ceil((sl + vw) / W));
  const r0 = Math.floor(st / H), r1 = Math.min(R - 1, Math.ceil((st + vh) / H));
  let h = '';
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const v = sheet.show(r, c), e = v instanceof XErr;
    h += `<div class="c${typeof v === 'number' ? ' n' : ''}${e ? ' e' : ''}${r === sr && c === scol ? ' sel' : ''}" data-r="${r}" data-c="${c}" style="left:${HW + c * W - sl}px;top:${HH + r * H - st}px"${e ? ` title="${MSG[v.c]}"` : ''}>${esc(fmt(v))}</div>`;
  }
  for (let c = c0; c <= c1; c++) h += `<div class="h${c === scol ? ' a' : ''}" style="left:${HW + c * W - sl}px;top:0;width:${W}px;height:${HH}px">${Coord.colName(c)}</div>`;
  for (let r = r0; r <= r1; r++) h += `<div class="h${r === sr ? ' a' : ''}" style="left:0;top:${HH + r * H - st}px;width:${HW}px;height:${H}px">${r + 1}</div>`;
  cells.innerHTML = h + `<div class="h" style="left:0;top:0;width:${HW}px;height:${HH}px"></div>`;
  if (editing) place();
}
const later = () => raf || (raf = requestAnimationFrame(render));
sc.addEventListener('scroll', later, { passive: true }); addEventListener('resize', later);

const place = () => { ed.style.left = HW + scol * W - sc.scrollLeft + 'px'; ed.style.top = HH + sr * H - sc.scrollTop + 'px'; };
function select(r, c) {
  sr = Math.max(0, Math.min(R - 1, r)); scol = Math.max(0, Math.min(C - 1, c));
  const x = scol * W, y = sr * H, vw = sc.clientWidth - HW, vh = sc.clientHeight - HH;   // porta la cella in vista
  if (x < sc.scrollLeft) sc.scrollLeft = x; else if (x + W > sc.scrollLeft + vw) sc.scrollLeft = x + W - vw;
  if (y < sc.scrollTop) sc.scrollTop = y; else if (y + H > sc.scrollTop + vh) sc.scrollTop = y + H - vh;
  nb.value = Coord.name(sr, scol); fb.value = sheet.getRaw(sr, scol); render();
}
function apply(t) {   // scrive nel foglio: il motore ricalcola solo le dipendenti, poi ridisegniamo le celle visibili
  sheet.set(sr, scol, t); fb.value = sheet.getRaw(sr, scol); render();
  clearTimeout(saveT); saveT = setTimeout(save, 400);
}
function startEdit(init) { editing = true; ed.value = init ?? sheet.getRaw(sr, scol); place(); ed.style.display = 'block'; ed.focus(); }
function endEdit(ok) { if (!editing) return; editing = false; ed.style.display = 'none'; if (ok) apply(ed.value); sc.focus(); }

/* Tastiera: frecce, Tab, Invio (conferma e scende), PagSu/PagGiù, F2/digitazione = modifica, Canc = svuota */
sc.onkeydown = e => {
  if (e.target === ed) return;
  const k = e.key, s = e.shiftKey ? -1 : 1; let dr = 0, dc = 0;
  if (k === 'ArrowUp') dr = -1; else if (k === 'ArrowDown') dr = 1; else if (k === 'ArrowLeft') dc = -1; else if (k === 'ArrowRight') dc = 1;
  else if (k === 'Tab') dc = s; else if (k === 'Enter') dr = s;
  else if (k === 'PageDown') dr = 30; else if (k === 'PageUp') dr = -30;
  else if (k === 'F2') { e.preventDefault(); return startEdit(); }
  else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); return apply(''); }
  else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) return startEdit('');
  else return;
  e.preventDefault(); select(sr + dr, scol + dc);
};
ed.onkeydown = e => {
  if (e.key === 'Enter' || e.key === 'Tab') {
    e.preventDefault(); const s = e.shiftKey ? -1 : 1; endEdit(true);
    select(sr + (e.key === 'Enter' ? s : 0), scol + (e.key === 'Tab' ? s : 0));
  } else if (e.key === 'Escape') endEdit(false);
};
ed.oninput = () => { fb.value = ed.value; };
ed.onblur = () => endEdit(true);
fb.onkeydown = e => { if (e.key === 'Enter') { apply(fb.value); select(sr + 1, scol); sc.focus(); } };

/* Mouse/touch: un clic seleziona; secondo clic ravvicinato (o tap sulla cella già selezionata su touch) modifica */
ly.onpointerdown = e => {
  const d = e.target.dataset; if (d.r === undefined) return;
  endEdit(true);
  const r = +d.r, c = +d.c, same = r === sr && c === scol, now = Date.now();
  select(r, c);
  if (same && (now - lastT < 400 || matchMedia('(pointer:coarse)').matches)) setTimeout(() => startEdit(), 0);
  lastT = now;
};

/* Salvataggio locale (localStorage): solo sul dispositivo, nessun dato inviato a server */
function save() {
  try { const o = {}; sheet.raw.forEach((v, k) => o[Coord.name(k / 1000 | 0, k % 1000)] = v); localStorage.setItem('mini-sheet', JSON.stringify(o)); } catch (e) {}
}
try { const o = JSON.parse(localStorage.getItem('mini-sheet') || '{}'); for (const a in o) { const p = Coord.parse(a); if (p) sheet.set(p.r, p.c, o[a]); } } catch (e) {}

/* PWA: registrazione service worker (percorso RELATIVO) e pulsante "Installa" */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
let dp; addEventListener('beforeinstallprompt', e => { e.preventDefault(); dp = e; $('inst').hidden = false; });
$('inst').onclick = () => { dp.prompt(); $('inst').hidden = true; };
select(0, 0); sc.focus();
