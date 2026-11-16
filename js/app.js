const CELL_WIDTH = 95;
const CELL_HEIGHT = 30;
const ROW_HEADER_WIDTH = 50;
const COL_HEADER_HEIGHT = 30;
const BUFFER = 3;

const engine = new SpreadsheetEngine(MAX_ROWS, MAX_COLS);

let selectedRow = 0;
let selectedCol = 0;
let isEditing = false;
let renderScheduled = false;

const viewport = document.getElementById('grid-viewport');
const spacer = document.getElementById('grid-spacer');
const cellsLayer = document.getElementById('cells-layer');
const colHeadersLayer = document.getElementById('col-headers-layer');
const rowHeadersLayer = document.getElementById('row-headers-layer');
const activeCellBadge = document.getElementById('active-cell-badge');
const formulaInput = document.getElementById('formula-input');
const cellEditor = document.getElementById('cell-editor');

// Imposta dimensioni totali virtuali (100x100)
spacer.style.width = `${ROW_HEADER_WIDTH + MAX_COLS * CELL_WIDTH}px`;
spacer.style.height = `${COL_HEADER_HEIGHT + MAX_ROWS * CELL_HEIGHT}px`;

function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
        renderVirtualGrid();
        renderScheduled = false;
    });
}

function renderVirtualGrid() {
    const scrollTop = viewport.scrollTop;
    const scrollLeft = viewport.scrollLeft;
    const viewHeight = viewport.clientHeight;
    const viewWidth = viewport.clientWidth;

    const startRow = Math.max(0, Math.floor(scrollTop / CELL_HEIGHT) - BUFFER);
    const endRow = Math.min(MAX_ROWS - 1, Math.ceil((scrollTop + viewHeight) / CELL_HEIGHT) + BUFFER);
    const startCol = Math.max(0, Math.floor(scrollLeft / CELL_WIDTH) - BUFFER);
    const endCol = Math.min(MAX_COLS - 1, Math.ceil((scrollLeft + viewWidth) / CELL_WIDTH) + BUFFER);

    // 1. Intestazioni colonne visibili
    let colHtml = '';
    for (let c = startCol; c <= endCol; c++) {
        const left = ROW_HEADER_WIDTH + c * CELL_WIDTH;
        const activeClass = c === selectedCol ? 'header-active' : '';
        colHtml += `<div class="col-header ${activeClass}" style="left:${left}px;width:${CELL_WIDTH}px;height:${COL_HEADER_HEIGHT}px;">${colIndexToLabel(c)}</div>`;
    }
    colHeadersLayer.innerHTML = colHtml;

    // 2. Intestazioni righe visibili
    let rowHtml = '';
    for (let r = startRow; r <= endRow; r++) {
        const top = COL_HEADER_HEIGHT + r * CELL_HEIGHT;
        const activeClass = r === selectedRow ? 'header-active' : '';
        rowHtml += `<div class="row-header ${activeClass}" style="top:${top}px;width:${ROW_HEADER_WIDTH}px;height:${CELL_HEIGHT}px;">${r + 1}</div>`;
    }
    rowHeadersLayer.innerHTML = rowHtml;

    // 3. Celle dati visibili
    let cellsHtml = '';
    for (let r = startRow; r <= endRow; r++) {
        const top = COL_HEADER_HEIGHT + r * CELL_HEIGHT;
        for (let c = startCol; c <= endCol; c++) {
            const left = ROW_HEADER_WIDTH + c * CELL_WIDTH;
            const cell = engine.getCell(r, c);
            const isSelected = r === selectedRow && c === selectedCol;
            const isNum = typeof cell.value === 'number';
            const cls = [
                'grid-cell',
                isSelected ? 'cell-selected' : '',
                cell.error ? 'cell-error' : '',
                isNum ? 'text-end' : ''
            ].join(' ');
            const display = escapeHtml(String(cell.value ?? ''));
            cellsHtml += `<div class="${cls}" data-r="${r}" data-c="${c}" style="top:${top}px;left:${left}px;width:${CELL_WIDTH}px;height:${CELL_HEIGHT}px;">${display}</div>`;
        }
    }
    cellsLayer.innerHTML = cellsHtml;
}

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function selectCell(row, col, ensureVisible = true) {
    if (isEditing) commitEdit();
    selectedRow = Math.max(0, Math.min(MAX_ROWS - 1, row));
    selectedCol = Math.max(0, Math.min(MAX_COLS - 1, col));

    const label = `${colIndexToLabel(selectedCol)}${selectedRow + 1}`;
    activeCellBadge.textContent = label;
    formulaInput.value = engine.getCell(selectedRow, selectedCol).raw;

    if (ensureVisible) {
        const cellTop = selectedRow * CELL_HEIGHT;
        const cellBottom = cellTop + CELL_HEIGHT;
        const cellLeft = selectedCol * CELL_WIDTH;
        const cellRight = cellLeft + CELL_WIDTH;
        const visibleH = viewport.clientHeight - COL_HEADER_HEIGHT;
        const visibleW = viewport.clientWidth - ROW_HEADER_WIDTH;

        if (cellTop < viewport.scrollTop) viewport.scrollTop = cellTop;
        else if (cellBottom > viewport.scrollTop + visibleH) viewport.scrollTop = cellBottom - visibleH;

        if (cellLeft < viewport.scrollLeft) viewport.scrollLeft = cellLeft;
        else if (cellRight > viewport.scrollLeft + visibleW) viewport.scrollLeft = cellRight - visibleW;
    }
    scheduleRender();
}

function startEdit(initialChar = null) {
    isEditing = true;
    const cell = engine.getCell(selectedRow, selectedCol);
    cellEditor.style.display = 'block';
    cellEditor.style.top = `${COL_HEADER_HEIGHT + selectedRow * CELL_HEIGHT}px`;
    cellEditor.style.left = `${ROW_HEADER_WIDTH + selectedCol * CELL_WIDTH}px`;
    cellEditor.style.width = `${CELL_WIDTH}px`;
    cellEditor.style.height = `${CELL_HEIGHT}px`;
    cellEditor.value = initialChar !== null ? initialChar : cell.raw;
    formulaInput.value = cellEditor.value;
    cellEditor.focus();
}

function commitEdit() {
    if (!isEditing) return;
    isEditing = false;
    const newVal = cellEditor.value;
    cellEditor.style.display = 'none';
    engine.setCellRaw(selectedRow, selectedCol, newVal);
    formulaInput.value = newVal;
    saveToLocalStorage();
    scheduleRender();
}

function cancelEdit() {
    isEditing = false;
    cellEditor.style.display = 'none';
    formulaInput.value = engine.getCell(selectedRow, selectedCol).raw;
    scheduleRender();
}

// Eventi mouse
cellsLayer.addEventListener('mousedown', (e) => {
    const cellEl = e.target.closest('.grid-cell');
    if (!cellEl) return;
    const r = Number(cellEl.dataset.r);
    const c = Number(cellEl.dataset.c);
    selectCell(r, c, false);
});

cellsLayer.addEventListener('dblclick', (e) => {
    const cellEl = e.target.closest('.grid-cell');
    if (!cellEl) return;
    startEdit();
});

// Sincronizzazione barra della formula
formulaInput.addEventListener('input', () => {
    if (!isEditing) startEdit(formulaInput.value);
    else cellEditor.value = formulaInput.value;
});

formulaInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        if (!isEditing) isEditing = true;
        cellEditor.value = formulaInput.value;
        commitEdit();
        selectCell(selectedRow + 1, selectedCol);
    } else if (e.key === 'Escape') {
        cancelEdit();
    }
});

// Tastiera dentro editor cella
cellEditor.addEventListener('input', () => {
    formulaInput.value = cellEditor.value;
});

cellEditor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        commitEdit();
        selectCell(selectedRow + 1, selectedCol);
    } else if (e.key === 'Tab') {
        e.preventDefault();
        commitEdit();
        selectCell(selectedRow, selectedCol + (e.shiftKey ? -1 : 1));
    } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
    }
});

// Navigazione da tastiera globale nella griglia
document.addEventListener('keydown', (e) => {
    if (isEditing || document.activeElement === formulaInput) return;

    switch (e.key) {
        case 'ArrowUp': e.preventDefault(); selectCell(selectedRow - 1, selectedCol); break;
        case 'ArrowDown': e.preventDefault(); selectCell(selectedRow + 1, selectedCol); break;
        case 'ArrowLeft': e.preventDefault(); selectCell(selectedRow, selectedCol - 1); break;
        case 'ArrowRight': e.preventDefault(); selectCell(selectedRow, selectedCol + 1); break;
        case 'Tab':
            e.preventDefault();
            selectCell(selectedRow, selectedCol + (e.shiftKey ? -1 : 1));
            break;
        case 'PageUp': e.preventDefault(); selectCell(selectedRow - 15, selectedCol); break;
        case 'PageDown': e.preventDefault(); selectCell(selectedRow + 15, selectedCol); break;
        case 'Enter': e.preventDefault(); startEdit(); break;
        case 'Delete':
        case 'Backspace':
            e.preventDefault();
            engine.setCellRaw(selectedRow, selectedCol, '');
            formulaInput.value = '';
            saveToLocalStorage();
            scheduleRender();
            break;
        default:
            if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                startEdit(e.key);
            }
    }
});

viewport.addEventListener('scroll', scheduleRender);

// Salvataggio automatico locale + Export CSV (Bonus)
function saveToLocalStorage() {
    const nonEmpty = [];
    for (let r = 0; r < MAX_ROWS; r++) {
        for (let c = 0; c < MAX_COLS; c++) {
            const raw = engine.getCell(r, c).raw;
            if (raw !== '') nonEmpty.push([r, c, raw]);
        }
    }
    localStorage.setItem('mini_sheet_data_v1', JSON.stringify(nonEmpty));
}

function loadFromLocalStorage() {
    const saved = localStorage.getItem('mini_sheet_data_v1');
    if (!saved) return;
    try {
        const entries = JSON.parse(saved);
        for (const [r, c, raw] of entries) {
            engine.setCellRaw(r, c, raw);
        }
    } catch (_) {}
}

document.getElementById('btn-clear').addEventListener('click', () => {
    if (!confirm('Svuotare tutto il foglio di calcolo?')) return;
    localStorage.removeItem('mini_sheet_data_v1');
    for (let r = 0; r < MAX_ROWS; r++) {
        for (let c = 0; c < MAX_COLS; c++) {
            engine.grid[r][c] = { raw: '', value: '', error: null };
        }
    }
    engine.dependents.clear();
    engine.dependencies.clear();
    selectCell(0, 0);
});

document.getElementById('btn-export-csv').addEventListener('click', () => {
    const lines = [];
    for (let r = 0; r < MAX_ROWS; r++) {
        const rowVals = [];
        let hasData = false;
        for (let c = 0; c < MAX_COLS; c++) {
            const val = String(engine.getCell(r, c).value ?? '');
            if (val !== '') hasData = true;
            rowVals.push(`"${val.replace(/"/g, '""')}"`);
        }
        if (hasData) lines.push(rowVals.join(';'));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mini-sheet.csv';
    a.click();
    URL.revokeObjectURL(url);
});

// Inizializzazione
loadFromLocalStorage();
selectCell(0, 0);