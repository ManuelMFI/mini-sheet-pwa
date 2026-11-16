const MAX_ROWS = 100;
const MAX_COLS = 100;

// Converte indice colonna (0 -> "A", 26 -> "AA", 99 -> "CV")
function colIndexToLabel(index) {
    let label = '';
    let n = index;
    while (n >= 0) {
        label = String.fromCharCode((n % 26) + 65) + label;
        n = Math.floor(n / 26) - 1;
    }
    return label;
}

// Converte etichetta colonna ("A" -> 0, "CV" -> 99)
function colLabelToIndex(label) {
    let index = 0;
    const upper = label.toUpperCase();
    for (let i = 0; i < upper.length; i++) {
        index = index * 26 + (upper.charCodeAt(i) - 64);
    }
    return index - 1;
}

// Converte riferimento "B12" in { row: 11, col: 1 } oppure null se fuori griglia
function parseCellRef(ref) {
    const match = /^([A-Za-z]+)(\d+)$/.exec(ref.trim());
    if (!match) return null;
    const col = colLabelToIndex(match[1]);
    const row = parseInt(match[2], 10) - 1;
    if (row < 0 || row >= MAX_ROWS || col < 0 || col >= MAX_COLS) return null;
    return { row, col };
}

// Espande un intervallo "A1:B3" in un array di coordinate { row, col }
function expandRange(rangeStr) {
    const parts = rangeStr.split(':');
    if (parts.length !== 2) return null;
    const start = parseCellRef(parts[0]);
    const end = parseCellRef(parts[1]);
    if (!start || !end) return null;

    const rMin = Math.min(start.row, end.row);
    const rMax = Math.max(start.row, end.row);
    const cMin = Math.min(start.col, end.col);
    const cMax = Math.max(start.col, end.col);

    const coords = [];
    for (let r = rMin; r <= rMax; r++) {
        for (let c = cMin; c <= cMax; c++) {
            coords.push({ row: r, col: c });
        }
    }
    return coords;
}

function cellKey(row, col) {
    return `${row},${col}`;
}