// End-to-end tests for `parseWellsFargoStatement`, the function the Import
// Statement dialog actually calls.
//
// The existing suite covers every helper below it — line grouping, column
// calibration, row stitching — but the entry point itself had no tests, and
// that is the piece that failed in front of a customer. pdfjs is mocked with a
// fabricated text layer so these run in the plain node environment, with no
// PDF file and no worker: exactly the parts of the pipeline this file is
// meant to exercise, and none of the ones it isn't.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getDocument = vi.hoisted(() => vi.fn());

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument,
}));

const { parseWellsFargoStatement } = await import('./bankStatementParser');

/** One text run, positioned the way pdfjs reports it. */
type Run = { str: string; x: number; y: number };

/** Feeds the parser a fake PDF whose pages carry these text runs. */
function fakePdf(pages: Run[][]) {
  getDocument.mockReturnValue({
    promise: Promise.resolve({
      numPages: pages.length,
      getPage: async (n: number) => ({
        getTextContent: async () => ({
          items: pages[n - 1].map((r) => ({ str: r.str, transform: [1, 0, 0, 1, r.x, r.y] })),
        }),
      }),
    }),
  });
  return new File([new Uint8Array([1, 2, 3])], 'estado.pdf', { type: 'application/pdf' });
}

// Column x-positions taken from the real statement layout: description on the
// left, then Deposits, Withdrawals and the running balance to the right.
const X = { date: 50, check: 90, desc: 130, deposit: 330, withdrawal: 420, balance: 510 };

/** The two-row column header that marks the start of the table. */
function tableHeader(y: number): Run[] {
  return [
    { str: 'Check', x: X.check, y: y + 12 },
    { str: 'Deposits/', x: X.deposit, y: y + 12 },
    { str: 'Withdrawals/', x: X.withdrawal, y: y + 12 },
    { str: 'Ending daily', x: X.balance, y: y + 12 },
    { str: 'Date', x: X.date, y },
    { str: 'Number', x: X.check, y },
    { str: 'Description', x: X.desc, y },
    { str: 'Credits', x: X.deposit, y },
    { str: 'Debits', x: X.withdrawal, y },
    { str: 'balance', x: X.balance, y },
  ];
}

function wellsFargoPage(): Run[] {
  return [
    { str: 'Statement period activity summary', x: 50, y: 760 },
    { str: 'January 31, 2026', x: 50, y: 740 },
    { str: 'Transaction history', x: 50, y: 700 },
    ...tableHeader(660),
    { str: '1/5', x: X.date, y: 640 },
    { str: 'Deposit ACME BODY SHOP', x: X.desc, y: 640 },
    { str: '1,200.00', x: X.deposit, y: 640 },
    { str: '5,000.00', x: X.balance, y: 640 },

    { str: '1/7', x: X.date, y: 620 },
    { str: '1234', x: X.check, y: 620 },
    { str: 'Check', x: X.desc, y: 620 },
    { str: '350.00', x: X.withdrawal, y: 620 },
    { str: '4,650.00', x: X.balance, y: 620 },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('parseWellsFargoStatement', () => {
  it('reads deposits and withdrawals off a Wells Fargo statement', async () => {
    const { transactions, warnings } = await parseWellsFargoStatement(fakePdf([wellsFargoPage()]));

    expect(warnings).toEqual([]);
    expect(transactions).toHaveLength(2);

    expect(transactions[0]).toMatchObject({
      fecha: '2026-01-05',
      tipo: 'ingreso',
      monto: 1200,
    });
    expect(transactions[0].descripcion).toContain('ACME BODY SHOP');

    expect(transactions[1]).toMatchObject({
      fecha: '2026-01-07',
      tipo: 'egreso',
      monto: 350,
      numero_cheque: '1234',
    });
  });

  it('takes the year from the statement header, not from today', async () => {
    // A statement imported in a later year must not be dated to the year the
    // import happens to run — that would file it in the wrong month entirely.
    const { transactions } = await parseWellsFargoStatement(fakePdf([wellsFargoPage()]));
    expect(transactions.every((t) => t.fecha.startsWith('2026-'))).toBe(true);
  });

  it('never counts the running balance as a transaction', async () => {
    const { transactions } = await parseWellsFargoStatement(fakePdf([wellsFargoPage()]));
    expect(transactions.map((t) => t.monto)).not.toContain(5000);
    expect(transactions.map((t) => t.monto)).not.toContain(4650);
  });

  it('says the PDF is from the wrong bank instead of returning nothing', async () => {
    // This is the failure the shop is most likely to hit: any statement that
    // isn't a Wells Fargo one parses to zero rows. Without the warning the
    // dialog just sits there, which reads as "nothing happened".
    const otherBank: Run[] = [
      { str: 'CHASE BUSINESS COMPLETE CHECKING', x: 50, y: 760 },
      { str: 'ACCOUNT ACTIVITY', x: 50, y: 700 },
      { str: '01/05', x: 50, y: 640 },
      { str: 'PAYMENT RECEIVED', x: 130, y: 640 },
      { str: '1,200.00', x: 330, y: 640 },
    ];

    const { transactions, warnings } = await parseWellsFargoStatement(fakePdf([otherBank]));

    expect(transactions).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Transaction History/i);
    expect(warnings[0]).toMatch(/Wells Fargo/i);
  });

  it('tells a scanned PDF apart from a wrong-bank one', async () => {
    // A scan has no text layer, so every page yields zero items. Reporting
    // that as "is this Wells Fargo?" sends the admin looking for the wrong
    // problem — the statement is the right one, it just needs downloading
    // from the bank instead of scanning.
    const { transactions, warnings } = await parseWellsFargoStatement(fakePdf([[], []]));

    expect(transactions).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/no contiene texto|escaneo/i);
    expect(warnings[0]).not.toMatch(/Wells Fargo/i);
  });

  it('warns about a transaction page whose amount columns it cannot find', async () => {
    // A layout change on Wells Fargo's side shows up here rather than as
    // silently missing rows in Finanzas.
    const brokenHeader: Run[] = [
      { str: 'Transaction history', x: 50, y: 700 },
      { str: 'Date', x: X.date, y: 660 },
      { str: 'Number', x: X.check, y: 660 },
      { str: 'Description', x: X.desc, y: 660 },
      { str: '1/5', x: X.date, y: 640 },
      { str: 'Deposit ACME', x: X.desc, y: 640 },
      { str: '1,200.00', x: X.deposit, y: 640 },
    ];

    const { transactions, warnings } = await parseWellsFargoStatement(fakePdf([brokenHeader]));

    expect(transactions).toHaveLength(0);
    expect(warnings.some((w) => /columnas de montos/i.test(w))).toBe(true);
  });

  it('reads every transaction page, not just the first', async () => {
    const secondPage: Run[] = [
      { str: 'Transaction history', x: 50, y: 700 },
      ...tableHeader(660),
      { str: '2/3', x: X.date, y: 640 },
      { str: 'AUTOZONE PARTS', x: X.desc, y: 640 },
      { str: '89.99', x: X.withdrawal, y: 640 },
    ];

    const { transactions } = await parseWellsFargoStatement(
      fakePdf([wellsFargoPage(), secondPage])
    );

    expect(transactions).toHaveLength(3);
    expect(transactions[2]).toMatchObject({ fecha: '2026-02-03', tipo: 'egreso', monto: 89.99 });
  });

  it('skips pages with no transaction table without complaining', async () => {
    // Page 1 of a real statement is the summary/cover page.
    const coverPage: Run[] = [
      { str: 'Wells Fargo Initiate Business Checking', x: 50, y: 760 },
      { str: 'January 31, 2026', x: 50, y: 740 },
      { str: 'Account summary', x: 50, y: 700 },
    ];

    const { transactions, warnings } = await parseWellsFargoStatement(
      fakePdf([coverPage, wellsFargoPage()])
    );

    expect(warnings).toEqual([]);
    expect(transactions).toHaveLength(2);
  });
});
