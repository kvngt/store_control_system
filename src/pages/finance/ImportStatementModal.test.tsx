// @vitest-environment jsdom
//
// Reported from the shop: the statement parses and the rows appear, but
// "Importar Seleccionadas" does nothing and nothing reaches Finanzas.
//
// These tests drive the real dialog end to end — file in, rows reviewed, button
// pressed — to separate the three ways that click can go nowhere: a guard that
// returns without saying anything, a disabled button that looks enabled, and a
// server error reported somewhere the user never sees.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  renderWithProviders,
  authValue,
  ADMIN_USER,
  SEDE_CENTRO,
} from '../../test/renderWithProviders';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../../test/renderWithProviders').authValue> | null },
  parse: vi.fn(),
  getCategorizationRules: vi.fn(),
  findPossibleDuplicates: vi.fn(),
  uploadStatement: vi.fn(),
  createImportBatch: vi.fn(),
  bulkInsertTransactions: vi.fn(),
  fileFingerprint: vi.fn(),
  findImportsByFingerprint: vi.fn(),
}));

vi.mock('../../context/auth.context', () => ({ useAuth: () => mocks.auth.current }));

vi.mock('../../lib/bankStatementParser', () => ({
  parseWellsFargoStatement: mocks.parse,
}));

vi.mock('../../services/supabaseService', () => ({
  supabaseService: {
    getCategorizationRules: mocks.getCategorizationRules,
    findPossibleDuplicates: mocks.findPossibleDuplicates,
    uploadStatement: mocks.uploadStatement,
    createImportBatch: mocks.createImportBatch,
    bulkInsertTransactions: mocks.bulkInsertTransactions,
    fileFingerprint: mocks.fileFingerprint,
    findImportsByFingerprint: mocks.findImportsByFingerprint,
  },
}));

const { default: ImportStatementModal } = await import('./ImportStatementModal');

const TRANSACTIONS = [
  { fecha: '2026-06-02', descripcion: 'AUTOZONE PARTS 1234', monto: 47.25, tipo: 'egreso' as const },
  { fecha: '2026-06-03', descripcion: 'DEPOSIT ACME BODY', monto: 1200, tipo: 'ingreso' as const },
];

/** Loads a statement into the dialog and returns once the rows are on screen. */
async function loadStatement(user: ReturnType<typeof userEvent.setup>) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([new Uint8Array([1, 2, 3])], 'estado.pdf', { type: 'application/pdf' });
  await user.upload(input, file);
  // Wait on the review heading rather than a description: a row flagged as a
  // duplicate repeats its description inside the warning note, so matching on
  // that text is ambiguous in exactly the case these tests care about.
  await screen.findByText(/Revisa las transacciones/i);
}

const importButton = () => screen.getByRole('button', { name: /Importar Seleccionadas/i });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mocks.auth.current = authValue(ADMIN_USER, SEDE_CENTRO);
  mocks.parse.mockResolvedValue({ transactions: TRANSACTIONS, warnings: [] });
  // Every row arrives already categorised, which is what leaves the button
  // enabled — an uncategorised selection disables it on purpose.
  // The rules match by substring, not regex, so these patterns are real words
  // out of the descriptions above.
  mocks.getCategorizationRules.mockResolvedValue([
    { id: 'r1', patron: 'autozone', categoria: 'compra_repuesto', activo: true, prioridad: 1 },
    { id: 'r2', patron: 'deposit', categoria: 'pago_cliente', activo: true, prioridad: 1 },
  ]);
  mocks.findPossibleDuplicates.mockResolvedValue(new Map());
  mocks.uploadStatement.mockResolvedValue('sede-centro/1234-estado.pdf');
  mocks.createImportBatch.mockResolvedValue({ id: 'imp-1' });
  mocks.bulkInsertTransactions.mockResolvedValue(undefined);
  mocks.fileFingerprint.mockResolvedValue('abc123');
  mocks.findImportsByFingerprint.mockResolvedValue([]);
});

describe('Importar Estado de Cuenta', () => {
  it('writes the selected rows to Finanzas', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ImportStatementModal onClose={() => {}} onImported={() => {}} />);

    await loadStatement(user);
    await user.click(importButton());

    await waitFor(() => expect(mocks.bulkInsertTransactions).toHaveBeenCalled());
    const rows = mocks.bulkInsertTransactions.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ sede_id: SEDE_CENTRO.id, importacion_id: 'imp-1' });
  });

  it('reports a failed upload instead of going quiet', async () => {
    mocks.uploadStatement.mockRejectedValue(new Error('new row violates row-level security policy'));

    const user = userEvent.setup();
    renderWithProviders(<ImportStatementModal onClose={() => {}} onImported={() => {}} />);

    await loadStatement(user);
    await user.click(importButton());

    // The failure has to be visible without hunting for it.
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(mocks.bulkInsertTransactions).not.toHaveBeenCalled();
  });

  it('reports a failed insert instead of going quiet', async () => {
    mocks.bulkInsertTransactions.mockRejectedValue(
      Object.assign(new Error('denied'), { code: '42501' })
    );

    const user = userEvent.setup();
    renderWithProviders(<ImportStatementModal onClose={() => {}} onImported={() => {}} />);

    await loadStatement(user);
    await user.click(importButton());

    expect((await screen.findByRole('alert')).textContent).toMatch(/no tienes permiso/i);
  });

  it('says why the button is off when a selected row has no category', async () => {
    // This is what the shop hit: rows the keyword rules could not classify
    // leave the button disabled. It was correct to disable it — what was
    // missing is the reason, which sat above a long table where nobody
    // pressing the button at the bottom of the dialog could see it.
    mocks.getCategorizationRules.mockResolvedValue([]);

    const user = userEvent.setup();
    renderWithProviders(<ImportStatementModal onClose={() => {}} onImported={() => {}} />);

    await loadStatement(user);

    expect(importButton()).toBeDisabled();
    const reason = await screen.findByRole('status');
    expect(reason).toBeVisible();
    expect(reason.textContent).toMatch(/categor/i);
    // And it names how many rows are holding the import up.
    expect(reason.textContent).toMatch(/2/);
  });

  it('enables the import once every selected row is categorised', async () => {
    mocks.getCategorizationRules.mockResolvedValue([]);

    const user = userEvent.setup();
    renderWithProviders(<ImportStatementModal onClose={() => {}} onImported={() => {}} />);

    await loadStatement(user);
    expect(importButton()).toBeDisabled();

    // The bulk control is the intended way out of this state.
    await user.selectOptions(
      screen.getByRole('combobox', { name: /Asignar a las no clasificadas/i }),
      'gasto_operativo'
    );
    await user.click(screen.getByRole('button', { name: /Asignar a las no clasificadas/i }));

    await waitFor(() => expect(importButton()).toBeEnabled());
    await user.click(importButton());
    await waitFor(() => expect(mocks.bulkInsertTransactions).toHaveBeenCalled());
  });

  it('warns when the exact same file was already imported', async () => {
    // What actually happened: the same June statement went in three times and
    // tripled every figure in Finanzas.
    mocks.findImportsByFingerprint.mockResolvedValue([
      {
        id: 'imp-old',
        sede_id: SEDE_CENTRO.id,
        nombre_archivo: 'estado.pdf',
        ruta_archivo: 'x',
        fecha_importacion: '2026-09-02T06:20:36Z',
        total_transacciones: 259,
        creado_en: '2026-09-02T06:20:36Z',
      },
    ]);

    const user = userEvent.setup();
    renderWithProviders(<ImportStatementModal onClose={() => {}} onImported={() => {}} />);

    await loadStatement(user);

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((a) => /ya se importó/i.test(a.textContent || ''))).toBe(true);
  });

  it('does not let "select all" tick the rows flagged as duplicates', async () => {
    // The gesture that caused the triple import: everything arrives unticked,
    // and one click on the header box used to undo every exclusion.
    mocks.findPossibleDuplicates.mockResolvedValue(new Map([[0, 'Importado: AUTOZONE PARTS 1234']]));

    const user = userEvent.setup();
    renderWithProviders(<ImportStatementModal onClose={() => {}} onImported={() => {}} />);

    await loadStatement(user);
    await user.click(screen.getByRole('checkbox', { name: /Seleccionar \/ deseleccionar todas/i }));
    await user.click(importButton());

    await waitFor(() => expect(mocks.bulkInsertTransactions).toHaveBeenCalled());
    const inserted = mocks.bulkInsertTransactions.mock.calls[0][0];
    // Only the non-duplicate row went in.
    expect(inserted).toHaveLength(1);
    expect(inserted[0].descripcion).toMatch(/DEPOSIT ACME BODY/);
  });

  it('does not go silent when there is no active sede', async () => {
    // The one guard the disabled state does not cover: with no sede the handler
    // used to return without a word, so the button looked simply broken.
    mocks.auth.current = authValue(ADMIN_USER, null);

    const user = userEvent.setup();
    renderWithProviders(<ImportStatementModal onClose={() => {}} onImported={() => {}} />);

    await loadStatement(user);
    await user.click(importButton());

    expect(mocks.bulkInsertTransactions).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toBeVisible();
  });
});
