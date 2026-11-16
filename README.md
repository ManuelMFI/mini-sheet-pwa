# Mini-Foglio di Calcolo (PWA)

**🔗 Sito pubblicato: _INSERIRE QUI L'URL (GitHub Pages o Vercel)_**

Foglio di calcolo 100×100 (A1:CV100) in HTML + CSS + JavaScript vanilla, installabile e utilizzabile offline.
Interfaccia responsive con Bootstrap 5 (file locale, nessuna CDN). Nessun dato lascia il dispositivo.

## Avvio in locale
```bash
cd mini-sheet-pwa
python -m http.server 8000     # poi aprire http://localhost:8000
```
(Non da `file://`: il service worker richiede un server.)

## Deploy
**GitHub Pages**: repo pubblico `mini-sheet-pwa` → `git init && git add . && git commit -m "Prima versione" && git branch -M main && git remote add origin <URL-repo> && git push -u origin main` → *Settings → Pages → Deploy from a branch → main / (root)*.
**Vercel** (opzionale, bonus): *Add New → Project* → repo → Framework "Other", build command vuoto → Deploy.
Tutti i percorsi sono relativi (`./js/app.js`, `./sw.js`, `start_url: "./"`, `scope: "./"`).

## Funzioni implementate
`SOMMA`, `MEDIA`, `CONTA`, `CONTA.VALORI`, `SOMMA.SE`, `CONTA.SE`, `MEDIA.SE`, `MAX`, `MIN`; operatori `+ - * /`, parentesi, `-` unario, riferimenti `A1`/`$A$1`, intervalli `A1:B5`; separatore argomenti `;` (o `,`).
Condizioni: `">5"`, `"<=3"`, `"<>x"`, `"testo"`, numero. Errori: `#DIV/0!`, `#VALORE!`, `#RIF!`, `#NOME?`, `#CIRC!` (riferimento circolare, con tooltip).
Tastiera: frecce, Tab/Maiusc+Tab, Invio (conferma e scende), PagSu/PagGiù, F2 o digitazione per modificare, Esc annulla, Canc svuota. Barra della formula con contenuto grezzo; intestazioni della riga/colonna correnti evidenziate.

## Strategia di virtualizzazione
Un div "spacer" dà all'area di scroll le dimensioni dell'intera griglia; un livello `position: sticky` grande quanto il viewport ridisegna a ogni scroll (via `requestAnimationFrame`) **solo le celle visibili** (~450 nodi invece di 10.000), posizionate in assoluto. Alternative valutate: 10.000 `<td>` (lento), `content-visibility: auto` (nel DOM restano comunque tutti i nodi).

## Ricalcolo e dipendenze
Ogni formula viene parsata una volta (AST) e memorizza i rettangoli che legge. Quando una cella cambia, `dirty()` invalida a catena solo le formule che la leggono (anche indirettamente); il valore è ricalcolato "pigramente" (con cache) solo se la cella è visibile o letta da un'altra formula. I cicli sono rilevati con un flag `busy` durante la valutazione.

## Casi di test
| # | Caso | Esito |
|---|------|-------|
| 1 | A1=5, A2=10, A3=`=SOMMA(A1:A2)` | 15 ✅ (test automatico Node) |
| 2 | B1=0, B2=`=A1/B1` | `#DIV/0!` ✅ |
| 3 | C1=`=C1`; catena C2↔C3 | `#CIRC!` ✅ |
| 4 | `=CONTA.SE(A1:A10;">5")` con A1=5, A2=10, A3=15 | 2 ✅ |
| 5 | `=SOMMA(A1:CV100)` su griglia vuota | In E1 la cella è *dentro* l'intervallo, quindi è davvero circolare: l'app mostra `#CIRC!` senza crash. Con la formula fuori dall'intervallo (`=SOMMA(A1:CU99)` in CV100) → 0 ✅ |
| 6 | Scorrimento riga 1→100 e ritorno | _da verificare a mano_ |
| 7 | Modifica cella con 100 dipendenti | ~3 ms di ricalcolo nel test Node ✅ (<300 ms) |
| 8 | Rete disattivata → ricarica | _da verificare dopo il deploy_ |
| 9 | URL pubblico in incognito: PWA installabile + offline | _da verificare dopo il deploy_ |
| 10 | Nessun 404 in console sull'URL pubblico | _da verificare dopo il deploy_ |

## Extra
Salvataggio automatico in `localStorage`; pulsante "Installa"; riferimenti assoluti `$A$1`.

## Difficoltà incontrate e come risolte
_Da completare con la vostra esperienza._

## Domande di riflessione
_Da completare personalmente (le 8 domande della consegna)._
