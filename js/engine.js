class SpreadsheetEngine {
    constructor(rows = 100, cols = 100) {
        this.rows = rows;
        this.cols = cols;
        // Matrice 100x100: { raw: string, value: number|string, error: string|null }
        this.grid = Array.from({ length: rows }, () =>
            Array.from({ length: cols }, () => ({ raw: '', value: '', error: null }))
        );
        // Grafo dipendenze: key -> Set di key che dipendono da essa
        this.dependents = new Map();
        // Grafo inverso: key -> Set di key da cui dipende
        this.dependencies = new Map();
    }

    getCell(row, col) {
        return this.grid[row][col];
    }

    setCellRaw(row, col, rawInput) {
        const key = cellKey(row, col);
        const raw = rawInput == null ? '' : String(rawInput);
        this.grid[row][col].raw = raw;

        // 1. Rimuovi vecchie dipendenze di questa cella
        const oldDeps = this.dependencies.get(key);
        if (oldDeps) {
            for (const depKey of oldDeps) {
                const rev = this.dependents.get(depKey);
                if (rev) rev.delete(key);
            }
            oldDeps.clear();
        }

        // 2. Se è una formula, registra le nuove dipendenze
        if (raw.startsWith('=')) {
            const refs = this.extractReferences(raw.slice(1));
            const newDeps = new Set();
            for (const ref of refs) {
                const refKey = cellKey(ref.row, ref.col);
                newDeps.add(refKey);
                if (!this.dependents.has(refKey)) {
                    this.dependents.set(refKey, new Set());
                }
                this.dependents.get(refKey).add(key);
            }
            this.dependencies.set(key, newDeps);
        }

        // 3. Ricalcola la cella e propaga ai dipendenti (ricalcolo incrementale)
        const updatedCells = [];
        this.recalculateCascade(row, col, updatedCells);
        return updatedCells;
    }

    extractReferences(expr) {
        // Rimuove stringhe tra virgolette per non confondere testo con celle
        const cleaned = expr.replace(/"[^"]*"/g, '');
        const refs = [];
        const tokenRegex = /([A-Za-z]+\d+:[A-Za-z]+\d+)|([A-Za-z]+\d+)/g;
        let match;
        while ((match = tokenRegex.exec(cleaned)) !== null) {
            if (match[1]) {
                const expanded = expandRange(match[1]);
                if (expanded) refs.push(...expanded);
            } else if (match[2]) {
                const single = parseCellRef(match[2]);
                if (single) refs.push(single);
            }
        }
        return refs;
    }

    recalculateCascade(startRow, startCol, updatedCells) {
        const queue = [{ row: startRow, col: startCol }];
        const queuedKeys = new Set([cellKey(startRow, startCol)]);

        while (queue.length > 0) {
            const { row, col } = queue.shift();
            const key = cellKey(row, col);
            queuedKeys.delete(key);

            this.evaluateCell(row, col, new Set());
            updatedCells.push({ row, col });

            const deps = this.dependents.get(key);
            if (deps) {
                for (const depKey of deps) {
                    if (!queuedKeys.has(depKey)) {
                        const [r, c] = depKey.split(',').map(Number);
                        queue.push({ row: r, col: c });
                        queuedKeys.add(depKey);
                    }
                }
            }
        }
    }

    evaluateCell(row, col, visiting) {
        const key = cellKey(row, col);
        const cell = this.grid[row][col];

        if (visiting.has(key)) {
            cell.value = '#CIRCOLARE!';
            cell.error = '#CIRCOLARE!';
            return cell;
        }

        const raw = cell.raw.trim();
        if (raw === '') {
            cell.value = '';
            cell.error = null;
            return cell;
        }

        if (!raw.startsWith('=')) {
            const num = Number(raw);
            if (!isNaN(num) && raw !== '') {
                cell.value = num;
            } else {
                cell.value = cell.raw;
            }
            cell.error = null;
            return cell;
        }

        visiting.add(key);
        try {
            const tokens = this.tokenize(raw.slice(1));
            const parser = new FormulaParser(tokens, this, visiting);
            const result = parser.parse();
            if (typeof result === 'number' && !isFinite(result)) {
                throw new Error('#DIV/0!');
            }
            cell.value = typeof result === 'number' ? Math.round(result * 1e10) / 1e10 : result;
            cell.error = null;
        } catch (err) {
            const knownErrors = ['#DIV/0!', '#VALORE!', '#RIF!', '#NOME?', '#CIRCOLARE!'];
            const msg = knownErrors.includes(err.message) ? err.message : '#VALORE!';
            cell.value = msg;
            cell.error = msg;
        } finally {
            visiting.delete(key);
        }
        return cell;
    }

    tokenize(expr) {
        const tokens = [];
        let i = 0;
        while (i < expr.length) {
            const ch = expr[i];
            if (/\s/.test(ch)) {
                i++;
            } else if (/[0-9.]/.test(ch)) {
                let numStr = '';
                while (i < expr.length && /[0-9.]/.test(expr[i])) numStr += expr[i++];
                tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
            } else if (ch === '"') {
                i++;
                let str = '';
                while (i < expr.length && expr[i] !== '"') str += expr[i++];
                i++; // chiudi virgolette
                tokens.push({ type: 'STRING', value: str });
            } else if (/[A-Za-z_]/.test(ch)) {
                let ident = '';
                while (i < expr.length && /[A-Za-z0-9_.]/.test(expr[i])) ident += expr[i++];
                tokens.push({ type: 'IDENT', value: ident.toUpperCase() });
            } else if ('+-*/():;,'.includes(ch)) {
                tokens.push({ type: 'SYMBOL', value: ch });
                i++;
            } else {
                throw new Error('#VALORE!');
            }
        }
        return tokens;
    }
}

class FormulaParser {
    constructor(tokens, engine, visiting) {
        this.tokens = tokens;
        this.pos = 0;
        this.engine = engine;
        this.visiting = visiting;
    }

    peek() {
        return this.tokens[this.pos] || null;
    }

    consume() {
        return this.tokens[this.pos++];
    }

    parse() {
        if (this.tokens.length === 0) return '';
        const val = this.parseAddSub();
        if (this.pos < this.tokens.length) throw new Error('#VALORE!');
        return val;
    }

    parseAddSub() {
        let left = this.parseMulDiv();
        while (this.peek() && this.peek().type === 'SYMBOL' && (this.peek().value === '+' || this.peek().value === '-')) {
            const op = this.consume().value;
            const right = this.parseMulDiv();
            left = this.toNumber(left) + (op === '+' ? this.toNumber(right) : -this.toNumber(right));
        }
        return left;
    }

    parseMulDiv() {
        let left = this.parseUnary();
        while (this.peek() && this.peek().type === 'SYMBOL' && (this.peek().value === '*' || this.peek().value === '/')) {
            const op = this.consume().value;
            const right = this.parseUnary();
            const a = this.toNumber(left);
            const b = this.toNumber(right);
            if (op === '/') {
                if (b === 0) throw new Error('#DIV/0!');
                left = a / b;
            } else {
                left = a * b;
            }
        }
        return left;
    }

    parseUnary() {
        if (this.peek() && this.peek().type === 'SYMBOL' && this.peek().value === '-') {
            this.consume();
            return -this.toNumber(this.parsePrimary());
        }
        return this.parsePrimary();
    }

    parsePrimary() {
        const tok = this.peek();
        if (!tok) throw new Error('#VALORE!');

        if (tok.type === 'NUMBER') {
            this.consume();
            return tok.value;
        }
        if (tok.type === 'STRING') {
            this.consume();
            return tok.value;
        }
        if (tok.type === 'SYMBOL' && tok.value === '(') {
            this.consume();
            const val = this.parseAddSub();
            if (!this.peek() || this.peek().value !== ')') throw new Error('#VALORE!');
            this.consume();
            return val;
        }
        if (tok.type === 'IDENT') {
            this.consume();
            // Chiamata a funzione: NOME(...)
            if (this.peek() && this.peek().type === 'SYMBOL' && this.peek().value === '(') {
                return this.parseFunction(tok.value);
            }
            // Riferimento singolo: A1
            const coord = parseCellRef(tok.value);
            if (!coord) throw new Error('#RIF!');
            return this.readCellValue(coord.row, coord.col);
        }
        throw new Error('#VALORE!');
    }

    parseFunction(funcName) {
        this.consume(); // '('
        const args = [];
        while (this.peek() && !(this.peek().type === 'SYMBOL' && this.peek().value === ')')) {
            // Controlla se l'argomento è un intervallo A1:B5
            if (
                this.peek().type === 'IDENT' &&
                this.tokens[this.pos + 1]?.value === ':' &&
                this.tokens[this.pos + 2]?.type === 'IDENT'
            ) {
                const startTok = this.consume().value;
                this.consume(); // ':'
                const endTok = this.consume().value;
                const coords = expandRange(`${startTok}:${endTok}`);
                if (!coords) throw new Error('#RIF!');
                args.push({ type: 'RANGE', coords });
            } else {
                args.push({ type: 'VALUE', value: this.parseAddSub() });
            }
            if (this.peek() && this.peek().type === 'SYMBOL' && (this.peek().value === ';' || this.peek().value === ',')) {
                this.consume();
            }
        }
        if (!this.peek() || this.peek().value !== ')') throw new Error('#VALORE!');
        this.consume(); // ')'

        return this.executeFunction(funcName, args);
    }

    readCellValue(r, c) {
        const cell = this.engine.evaluateCell(r, c, this.visiting);
        if (cell.error) throw new Error(cell.error);
        return cell.value;
    }

    toNumber(val) {
        if (val === '' || val === null || val === undefined) return 0;
        if (typeof val === 'number') return val;
        throw new Error('#VALORE!');
    }

    flattenValues(args) {
        const vals = [];
        for (const arg of args) {
            if (arg.type === 'RANGE') {
                for (const { row, col } of arg.coords) {
                    vals.push(this.readCellValue(row, col));
                }
            } else {
                vals.push(arg.value);
            }
        }
        return vals;
    }

    matchesCriteria(cellVal, criteriaRaw) {
        const critStr = String(criteriaRaw).trim();
        const match = /^(>=|<=|<>|!=|>|<|=)?(.*)$/.exec(critStr);
        const op = match[1] || '=';
        const rhsRaw = match[2].trim();
        const rhsNum = Number(rhsRaw);
        const isRhsNumeric = rhsRaw !== '' && !isNaN(rhsNum);

        if (isRhsNumeric) {
            if (typeof cellVal !== 'number') return false;
            switch (op) {
                case '>': return cellVal > rhsNum;
                case '<': return cellVal < rhsNum;
                case '>=': return cellVal >= rhsNum;
                case '<=': return cellVal <= rhsNum;
                case '<>':
                case '!=': return cellVal !== rhsNum;
                default: return cellVal === rhsNum;
            }
        } else {
            const lhsStr = String(cellVal ?? '').toLowerCase();
            const rhsStr = rhsRaw.toLowerCase();
            if (op === '<>' || op === '!=') return lhsStr !== rhsStr;
            return lhsStr === rhsStr;
        }
    }

    executeFunction(name, args) {
        switch (name) {
            case 'SOMMA': {
                const nums = this.flattenValues(args).filter(v => typeof v === 'number');
                return nums.reduce((acc, n) => acc + n, 0);
            }
            case 'MEDIA': {
                const nums = this.flattenValues(args).filter(v => typeof v === 'number');
                if (nums.length === 0) throw new Error('#DIV/0!');
                return nums.reduce((acc, n) => acc + n, 0) / nums.length;
            }
            case 'CONTA': {
                return this.flattenValues(args).filter(v => typeof v === 'number').length;
            }
            case 'CONTA.VALORI': {
                return this.flattenValues(args).filter(v => v !== '' && v !== null && v !== undefined).length;
            }
            case 'MAX': {
                const nums = this.flattenValues(args).filter(v => typeof v === 'number');
                return nums.length ? Math.max(...nums) : 0;
            }
            case 'MIN': {
                const nums = this.flattenValues(args).filter(v => typeof v === 'number');
                return nums.length ? Math.min(...nums) : 0;
            }
            case 'CONTA.SE': {
                if (args.length < 2 || args[0].type !== 'RANGE') throw new Error('#VALORE!');
                const criteria = args[1].value;
                return args[0].coords.filter(({ row, col }) =>
                    this.matchesCriteria(this.readCellValue(row, col), criteria)
                ).length;
            }
            case 'SOMMA.SE': {
                if (args.length < 2 || args[0].type !== 'RANGE') throw new Error('#VALORE!');
                const criteria = args[1].value;
                const sumRange = args[2]?.type === 'RANGE' ? args[2].coords : args[0].coords;
                let sum = 0;
                args[0].coords.forEach(({ row, col }, idx) => {
                    if (this.matchesCriteria(this.readCellValue(row, col), criteria) && sumRange[idx]) {
                        const targetVal = this.readCellValue(sumRange[idx].row, sumRange[idx].col);
                        if (typeof targetVal === 'number') sum += targetVal;
                    }
                });
                return sum;
            }
            case 'MEDIA.SE': {
                if (args.length < 2 || args[0].type !== 'RANGE') throw new Error('#VALORE!');
                const criteria = args[1].value;
                let sum = 0, count = 0;
                for (const { row, col } of args[0].coords) {
                    const val = this.readCellValue(row, col);
                    if (typeof val === 'number' && this.matchesCriteria(val, criteria)) {
                        sum += val;
                        count++;
                    }
                }
                if (count === 0) throw new Error('#DIV/0!');
                return sum / count;
            }
            default:
                throw new Error('#NOME?');
        }
    }
}