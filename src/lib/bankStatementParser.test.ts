import { describe, it, expect } from 'vitest';
import {
  toAmount,
  groupIntoLines,
  findColumnX,
  extractStatementYear,
  extractPendingTransactionsFromLines,
  pendingToTransactions,
  type TextItem,
  type Line,
} from './bankStatementParser';

// Column x-positions used across these fixtures, matching the real relative
// order in a Wells Fargo statement: Date < Check # < Description < Deposits
// < Withdrawals < Ending daily balance.
const DEPOSIT_X = 430;
const WITHDRAWAL_X = 530;
const BALANCE_X = 630;

function item(str: string, x: number, y = 0): TextItem {
  return { str, x, y };
}

function line(text: string, items: TextItem[]): Line {
  return { y: items[0]?.y ?? 0, items, text };
}

const HEADER = line('Date Number Description Credits Debits balance', []);
const TOTALS = line('Totals $80,419.32 $77,805.23', []);

describe('toAmount', () => {
  it('parses a comma-formatted amount', () => {
    expect(toAmount('1,840.00')).toBe(1840);
  });

  it('parses a plain decimal amount', () => {
    expect(toAmount('277.85')).toBe(277.85);
  });
});

describe('groupIntoLines', () => {
  it('groups items with close y-coordinates into one line, ordered by x', () => {
    const items: TextItem[] = [
      item('World', 100, 500),
      item('Hello', 50, 501), // within tolerance of the line above
      item('Other', 50, 300), // a different line
    ];
    const lines = groupIntoLines(items);
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe('Hello World');
    expect(lines[1].text).toBe('Other');
  });

  it('orders lines top to bottom (higher y first)', () => {
    const items: TextItem[] = [item('Bottom', 0, 100), item('Top', 0, 900)];
    const lines = groupIntoLines(items);
    expect(lines.map((l) => l.text)).toEqual(['Top', 'Bottom']);
  });
});

describe('findColumnX', () => {
  it('finds the x-position of a column header by partial label match', () => {
    const lines = [HEADER, line('', [item('Deposits/', DEPOSIT_X), item('Withdrawals/', WITHDRAWAL_X)])];
    expect(findColumnX(lines, 'Deposits')).toBe(DEPOSIT_X);
    expect(findColumnX(lines, 'Withdrawals')).toBe(WITHDRAWAL_X);
  });

  it('returns null when the label is not found', () => {
    expect(findColumnX([HEADER], 'Nonexistent')).toBeNull();
  });
});

describe('extractStatementYear', () => {
  it('extracts the year from a statement date header', () => {
    expect(extractStatementYear('June 30, 2026 ■ Page 1 of 10')).toBe(2026);
  });

  it('falls back to the current year when no date is found', () => {
    expect(extractStatementYear('no date here')).toBe(new Date().getFullYear());
  });
});

describe('extractPendingTransactionsFromLines', () => {
  it('reconstructs a deposit whose description wraps across two continuation lines', () => {
    // Modeled on: "6/1 ATM Cash Deposit on 06/01 6235 Baltimore Ave Riverdale MD"
    //             "0000864 ATM ID 6922G Card 2117"
    //             "1,840.00"
    const lines = [
      HEADER,
      line('6/1 ATM Cash Deposit on 06/01', [
        item('6/1', 50), item('ATM', 160), item('Cash', 200), item('Deposit', 240), item('on', 290), item('06/01', 320),
      ]),
      line('0000864 ATM ID 6922G Card 2117', [
        item('0000864', 160), item('ATM', 210), item('ID', 250), item('6922G', 280), item('Card', 330), item('2117', 370),
      ]),
      line('1,840.00', [item('1,840.00', DEPOSIT_X)]),
      TOTALS,
    ];

    const result = extractPendingTransactionsFromLines(lines, DEPOSIT_X, WITHDRAWAL_X, BALANCE_X);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ month: 6, day: 1, depositAmount: 1840, withdrawalAmount: undefined });
    expect(result[0].descriptionParts.join(' ')).toContain('ATM Cash Deposit');
    expect(result[0].descriptionParts.join(' ')).toContain('0000864');
  });

  it('classifies a trailing amount as a withdrawal when it sits under that column', () => {
    // Modeled on: "6/1 Purchase authorized on 05/28 Olive Garden Zk 00 Hyattsville"
    //             "MD S306148652949020 Card 1860" ... 277.85
    const lines = [
      HEADER,
      line('6/1 Purchase authorized on 05/28 Olive Garden', [
        item('6/1', 50), item('Purchase', 160), item('authorized', 220), item('on', 280), item('05/28', 310), item('Olive', 350), item('Garden', 390),
      ]),
      line('MD S306148652949020 Card 1860 277.85', [
        item('MD', 160), item('S306148652949020', 200), item('Card', 300), item('1860', 340), item('277.85', WITHDRAWAL_X),
      ]),
      TOTALS,
    ];

    const result = extractPendingTransactionsFromLines(lines, DEPOSIT_X, WITHDRAWAL_X, BALANCE_X);
    expect(result).toHaveLength(1);
    expect(result[0].withdrawalAmount).toBe(277.85);
    expect(result[0].depositAmount).toBeUndefined();
  });

  it('captures a leading check number and excludes it from the description', () => {
    // Modeled on: "6/1 1373 Check 160.00"
    const lines = [
      HEADER,
      line('6/1 1373 Check 160.00', [item('6/1', 50), item('1373', 140), item('Check', 250), item('160.00', WITHDRAWAL_X)]),
      TOTALS,
    ];

    const [tx] = extractPendingTransactionsFromLines(lines, DEPOSIT_X, WITHDRAWAL_X, BALANCE_X);
    expect(tx.checkNumber).toBe('1373');
    expect(tx.descriptionParts).toEqual(['Check']);
    expect(tx.withdrawalAmount).toBe(160);
  });

  it('excludes the ending daily balance figure from the transaction amount', () => {
    // Modeled on: "6/1 1375 Check 400.00 3,918.14" — 400.00 is the withdrawal,
    // 3,918.14 is that day's running balance and must NOT be picked up.
    const lines = [
      HEADER,
      line('6/1 1375 Check 400.00 3,918.14', [
        item('6/1', 50), item('1375', 140), item('Check', 250),
        item('400.00', WITHDRAWAL_X), item('3,918.14', BALANCE_X),
      ]),
      TOTALS,
    ];

    const [tx] = extractPendingTransactionsFromLines(lines, DEPOSIT_X, WITHDRAWAL_X, BALANCE_X);
    expect(tx.withdrawalAmount).toBe(400);
    expect(tx.depositAmount).toBeUndefined();
  });

  it('recognizes the "<" ACH marker as a check-number-like token', () => {
    // Modeled on: "6/11 < Business to Business ACH Debit - Clover Fees ... 31.75"
    const lines = [
      HEADER,
      line('6/11 < Business to Business ACH Debit', [
        item('6/11', 50), item('<', 140), item('Business', 250), item('to', 320), item('Business', 350), item('ACH', 400),
      ]),
      line('Clover Fee 260611 31.75', [item('Clover', 200), item('Fee', 250), item('260611', 300), item('31.75', WITHDRAWAL_X)]),
      TOTALS,
    ];

    const [tx] = extractPendingTransactionsFromLines(lines, DEPOSIT_X, WITHDRAWAL_X, BALANCE_X);
    expect(tx.checkNumber).toBe('<');
    expect(tx.withdrawalAmount).toBe(31.75);
  });

  it('stops at the Totals row and ignores anything after it', () => {
    const lines = [
      HEADER,
      line('6/1 Check 160.00', [item('6/1', 50), item('Check', 250), item('160.00', WITHDRAWAL_X)]),
      TOTALS,
      line('6/2 Check 999.00', [item('6/2', 50), item('Check', 250), item('999.00', WITHDRAWAL_X)]),
    ];

    const result = extractPendingTransactionsFromLines(lines, DEPOSIT_X, WITHDRAWAL_X, BALANCE_X);
    expect(result).toHaveLength(1);
  });

  it('ignores lines before the "Date Check ..." header', () => {
    const lines = [
      line('Beginning balance on 6/1 $4,859.51', [item('Beginning', 50), item('balance', 120)]),
      HEADER,
      line('6/1 Check 160.00', [item('6/1', 50), item('Check', 250), item('160.00', WITHDRAWAL_X)]),
      TOTALS,
    ];

    const result = extractPendingTransactionsFromLines(lines, DEPOSIT_X, WITHDRAWAL_X, BALANCE_X);
    expect(result).toHaveLength(1);
  });
});

describe('pendingToTransactions', () => {
  it('converts a pending row into a final transaction with a zero-padded ISO date', () => {
    const { transactions, warnings } = pendingToTransactions(
      [{ month: 6, day: 1, checkNumber: '1373', descriptionParts: ['Check'], withdrawalAmount: 160 }],
      2026
    );
    expect(warnings).toHaveLength(0);
    expect(transactions).toEqual([
      { fecha: '2026-06-01', numero_cheque: '1373', descripcion: 'Check', monto: 160, tipo: 'egreso' },
    ]);
  });

  it('marks a deposit row as ingreso', () => {
    const { transactions } = pendingToTransactions(
      [{ month: 6, day: 1, descriptionParts: ['ATM Cash Deposit'], depositAmount: 1840 }],
      2026
    );
    expect(transactions[0].tipo).toBe('ingreso');
    expect(transactions[0].monto).toBe(1840);
  });

  it('drops rows with no recognized amount and warns instead of silently losing them', () => {
    const { transactions, warnings } = pendingToTransactions(
      [{ month: 6, day: 5, descriptionParts: ['Something unparsed'] }],
      2026
    );
    expect(transactions).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('6/5');
  });
});
