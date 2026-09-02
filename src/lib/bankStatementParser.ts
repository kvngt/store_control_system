import * as pdfjsLib from 'pdfjs-dist';
import type { ParsedStatementTransaction } from '../types/database';

// Served from public/pdf.worker.min.js (kept in sync by
// scripts/copy-pdf-worker.mjs), not imported as `pdf.worker.min.mjs?url`.
// Some static hosts (Hostinger's CDN included) serve .mjs files as
// `Content-Type: text/plain`, which browsers reject for ES module workers —
// a plain .js extension avoids that entirely.
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';

export interface ParsedStatementResult {
  transactions: ParsedStatementTransaction[];
  warnings: string[];
}

export interface TextItem {
  str: string;
  x: number;
  y: number;
}

export interface Line {
  y: number;
  items: TextItem[];
  text: string;
}

export interface PendingTx {
  month: number;
  day: number;
  checkNumber?: string;
  descriptionParts: string[];
  depositAmount?: number;
  withdrawalAmount?: number;
}

const DATE_RE = /^(\d{1,2})\/(\d{1,2})$/;
const CHECK_NUMBER_RE = /^\d{3,6}$/;
const AMOUNT_RE = /^-?\$?\d{1,3}(?:,\d{3})*\.\d{2}$/;
const STATEMENT_DATE_RE = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+(\d{4})/;

export function toAmount(token: string): number {
  return parseFloat(token.replace(/[$,]/g, ''));
}

// Groups raw text items into visual lines (items sharing roughly the same
// y-coordinate), ordered top-to-bottom as they appear on the page.
export function groupIntoLines(items: TextItem[]): Line[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  const Y_TOLERANCE = 2.5;

  for (const item of sorted) {
    let line = lines.find((l) => Math.abs(l.y - item.y) <= Y_TOLERANCE);
    if (!line) {
      line = { y: item.y, items: [], text: '' };
      lines.push(line);
    }
    line.items.push(item);
  }

  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    line.text = line.items.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim();
  }

  return lines;
}

// Finds the x-position of a column header on a page (e.g. "Deposits" /
// "Withdrawals" / "Ending daily") so amount tokens can be matched to the
// column they visually sit under. Recalibrated per page since the header
// repeats on every "Transaction history" page.
export function findColumnX(lines: Line[], label: string): number | null {
  for (const line of lines) {
    for (const item of line.items) {
      if (item.str.toLowerCase().includes(label.toLowerCase())) return item.x;
    }
  }
  return null;
}

export function extractStatementYear(allText: string): number {
  const match = allText.match(STATEMENT_DATE_RE);
  return match ? parseInt(match[2], 10) : new Date().getFullYear();
}

/**
 * Walks the "Date | Check Number | Description | Deposits/Credits |
 * Withdrawals/Debits | Ending daily balance" table on a single page and
 * reconstructs each transaction, stitching wrapped description lines (which
 * carry no leading date) onto the transaction above them. Pure function of
 * already-grouped lines — no PDF I/O — so it's directly unit-testable with
 * fabricated `Line[]` fixtures.
 */
export function extractPendingTransactionsFromLines(
  lines: Line[],
  depositX: number,
  withdrawalX: number,
  balanceX: number | null
): PendingTx[] {
  const pendingTxs: PendingTx[] = [];
  let inTable = false;
  let current: PendingTx | null = null;

  for (const line of lines) {
    // The column header spans two visual rows ("Check Deposits/
    // Withdrawals/ Ending daily" then "Date Number Description Credits
    // Debits balance") — "Date" only appears on the second one.
    if (/^Date\s+Number\s+Description/.test(line.text)) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (/^Totals\b/.test(line.text)) break;

    const dateMatch = line.items[0] && DATE_RE.exec(line.items[0].str);

    // Amount tokens on this line, classified by which column they sit under.
    let depositAmt: number | undefined;
    let withdrawalAmt: number | undefined;
    const descTokens: string[] = [];

    for (let idx = 0; idx < line.items.length; idx++) {
      const item = line.items[idx];
      if (dateMatch && idx === 0) continue; // the leading date token itself

      if (AMOUNT_RE.test(item.str)) {
        const distDeposit = Math.abs(item.x - depositX);
        const distWithdrawal = Math.abs(item.x - withdrawalX);
        const distBalance = balanceX !== null ? Math.abs(item.x - balanceX) : Infinity;
        if (distBalance <= distDeposit && distBalance <= distWithdrawal) {
          continue; // this is the "ending daily balance" figure — not a transaction amount
        }
        if (distDeposit <= distWithdrawal) depositAmt = toAmount(item.str);
        else withdrawalAmt = toAmount(item.str);
        continue;
      }
      descTokens.push(item.str);
    }

    if (dateMatch) {
      if (current) pendingTxs.push(current);
      const [, monthStr, dayStr] = dateMatch;
      let checkNumber: string | undefined;
      let descStart = 0;
      if (descTokens[0] === '<') {
        // Footnote marker in the Check Number column (Wells Fargo flags
        // business-to-business ACH debits with it). Drop it from the
        // description, but it is NOT a check number — storing it put a literal
        // "<" in numero_cheque on a real statement.
        descStart = 1;
      } else if (descTokens[0] && CHECK_NUMBER_RE.test(descTokens[0])) {
        checkNumber = descTokens[0];
        descStart = 1;
      }
      current = {
        month: parseInt(monthStr, 10),
        day: parseInt(dayStr, 10),
        checkNumber,
        descriptionParts: descTokens.slice(descStart),
        depositAmount: depositAmt,
        withdrawalAmount: withdrawalAmt,
      };
    } else if (current) {
      // Continuation line: wrapped description text and/or an amount that
      // belongs to the transaction started above.
      current.descriptionParts.push(...descTokens);
      if (depositAmt !== undefined) current.depositAmount = depositAmt;
      if (withdrawalAmt !== undefined) current.withdrawalAmount = withdrawalAmt;
    }
  }
  if (current) pendingTxs.push(current);

  return pendingTxs;
}

/**
 * Converts the intermediate PendingTx rows (still split into month/day plus
 * separate deposit/withdrawal fields) into the final transaction shape used
 * by the rest of the app, resolving the statement year and dropping rows
 * where no amount was ever matched.
 */
export function pendingToTransactions(pendingTxs: PendingTx[], year: number): ParsedStatementResult {
  const warnings: string[] = [];
  const transactions: ParsedStatementTransaction[] = [];

  for (const tx of pendingTxs) {
    const descripcion = tx.descriptionParts.join(' ').replace(/\s+/g, ' ').trim();
    if (tx.depositAmount === undefined && tx.withdrawalAmount === undefined) {
      warnings.push(`Fila sin monto reconocido, omitida: ${tx.month}/${tx.day} — ${descripcion}`);
      continue;
    }
    const monto = tx.depositAmount ?? tx.withdrawalAmount!;
    const tipo = tx.depositAmount !== undefined ? 'ingreso' : 'egreso';
    const fecha = `${year}-${String(tx.month).padStart(2, '0')}-${String(tx.day).padStart(2, '0')}`;
    transactions.push({
      fecha,
      numero_cheque: tx.checkNumber,
      descripcion,
      monto,
      tipo,
    });
  }

  return { transactions, warnings };
}

/**
 * Parses a Wells Fargo "Initiate Business Checking" statement PDF client-side
 * (no data leaves the browser). Tailored to the table layout observed in
 * sample statements: `Date | Check Number | Description | Deposits/Credits |
 * Withdrawals/Debits | Ending daily balance`, where a transaction's
 * description sometimes wraps onto a following line with no date.
 */
export async function parseWellsFargoStatement(file: File): Promise<ParsedStatementResult> {
  const warnings: string[] = [];
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pendingTxs: PendingTx[] = [];
  let statementYear: number | null = null;
  let sawTransactionSection = false;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    // pdfjs types `items` as `Array<TextItem | TextMarkedContent>`; only
    // TextItem carries `str`/`transform`, which is all we need here.
    const items: TextItem[] = content.items
      .filter((i: any) => typeof i.str === 'string' && i.str.trim().length > 0)
      .map((i: any) => ({ str: (i.str as string).trim(), x: i.transform[4], y: i.transform[5] }));

    if (items.length === 0) continue;
    const lines = groupIntoLines(items);
    const pageText = lines.map((l) => l.text).join('\n');

    if (statementYear === null) {
      statementYear = extractStatementYear(pageText);
    }

    if (!/Transaction [Hh]istory/.test(pageText)) continue;
    sawTransactionSection = true;

    // Page 2 also has a "Statement period activity summary" box containing
    // the words "Deposits"/"Withdrawals" at a totally different x position —
    // searching the whole page for those labels would miscalibrate the
    // columns. Narrow the search to the two-row header immediately above
    // the "Date Number Description ..." line ("Check Deposits/ Withdrawals/
    // Ending daily" sits directly above it).
    const headerIdx = lines.findIndex((l) => /^Date\s+Number\s+Description/.test(l.text));
    const headerContext = headerIdx === -1 ? lines : lines.slice(Math.max(0, headerIdx - 1), headerIdx + 1);
    const depositX = findColumnX(headerContext, 'Deposits');
    const withdrawalX = findColumnX(headerContext, 'Withdrawals');
    const balanceX = findColumnX(headerContext, 'Ending daily');
    if (depositX === null || withdrawalX === null) {
      warnings.push(`Página ${pageNum}: no se encontraron las columnas de montos, se omitió.`);
      continue;
    }

    pendingTxs.push(...extractPendingTransactionsFromLines(lines, depositX, withdrawalX, balanceX));
  }

  if (!sawTransactionSection) {
    warnings.push('No se encontró una sección "Transaction History" en el PDF — ¿es un estado de cuenta de Wells Fargo?');
  }

  const year = statementYear || new Date().getFullYear();
  const result = pendingToTransactions(pendingTxs, year);
  return { transactions: result.transactions, warnings: [...warnings, ...result.warnings] };
}
