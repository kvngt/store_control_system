import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  uploadReceipt: vi.fn<(sedeId: string, numeroOrden: string, file: File) => Promise<string>>(),
  removeDeliveryReceipt: vi.fn<(path: string) => Promise<void>>(),
}));

vi.mock('../../services/workOrders.service', () => ({
  workOrdersService: {
    uploadReceipt: mocks.uploadReceipt,
    removeDeliveryReceipt: mocks.removeDeliveryReceipt,
  },
}));

const { paymentProblem, paymentFields, withReceipt } = await import('./paymentReceipt');

const SAMPLE_FILE = new File(['img'], 'comprobante.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.removeDeliveryReceipt.mockResolvedValue(undefined);
});

describe('paymentProblem', () => {
  it('sin needsMethod no reporta problema aunque falte método o cheque', () => {
    expect(paymentProblem({ needsMethod: false, metodo: '', numeroCheque: '', file: null })).toBeNull();
    expect(paymentProblem({ needsMethod: false, metodo: 'cheque', numeroCheque: '   ', file: null })).toBeNull();
  });

  it('con needsMethod y sin método devuelve delivery.methodRequired', () => {
    expect(paymentProblem({ needsMethod: true, metodo: '', numeroCheque: '', file: null })).toBe(
      'delivery.methodRequired'
    );
  });

  it('con needsMethod y cheque sin número (ni espacios) ni foto devuelve delivery.checkRequired', () => {
    expect(paymentProblem({ needsMethod: true, metodo: 'cheque', numeroCheque: '', file: null })).toBe(
      'delivery.checkRequired'
    );
    expect(paymentProblem({ needsMethod: true, metodo: 'cheque', numeroCheque: '   ', file: null })).toBe(
      'delivery.checkRequired'
    );
  });

  it('con needsMethod y cheque acepta número con texto o foto', () => {
    expect(paymentProblem({ needsMethod: true, metodo: 'cheque', numeroCheque: ' 1042 ', file: null })).toBeNull();
    expect(paymentProblem({ needsMethod: true, metodo: 'cheque', numeroCheque: '', file: SAMPLE_FILE })).toBeNull();
  });

  it('con needsMethod y otros métodos no exige número ni foto', () => {
    expect(paymentProblem({ needsMethod: true, metodo: 'efectivo', numeroCheque: '', file: null })).toBeNull();
    expect(paymentProblem({ needsMethod: true, metodo: 'transferencia', numeroCheque: '', file: null })).toBeNull();
  });
});

describe('paymentFields', () => {
  it('sin needsMethod devuelve método y número en null', () => {
    expect(paymentFields({ needsMethod: false, metodo: 'cheque', numeroCheque: '1042' })).toEqual({
      metodo: null,
      numeroCheque: null,
    });
  });

  it('sin método devuelve método y número en null', () => {
    expect(paymentFields({ needsMethod: true, metodo: '', numeroCheque: '1042' })).toEqual({
      metodo: null,
      numeroCheque: null,
    });
  });

  it('si el método no es cheque descarta el número de cheque', () => {
    expect(paymentFields({ needsMethod: true, metodo: 'efectivo', numeroCheque: '1042' })).toEqual({
      metodo: 'efectivo',
      numeroCheque: null,
    });
  });

  it('si es cheque recorta el número y convierte espacios vacíos en null', () => {
    expect(paymentFields({ needsMethod: true, metodo: 'cheque', numeroCheque: ' 1042 ' })).toEqual({
      metodo: 'cheque',
      numeroCheque: '1042',
    });
    expect(paymentFields({ needsMethod: true, metodo: 'cheque', numeroCheque: '   ' })).toEqual({
      metodo: 'cheque',
      numeroCheque: null,
    });
  });
});

describe('withReceipt', () => {
  it('sube la foto cuando needsMethod es true y pasa la ruta a run', async () => {
    mocks.uploadReceipt.mockResolvedValue('sede-1/comprobante-ORD-1-1.jpg');
    const run = vi.fn<(ruta: string | null) => Promise<string>>().mockResolvedValue('ok');

    const result = await withReceipt(
      { needsMethod: true, file: SAMPLE_FILE, sedeId: 'sede-1', numeroOrden: 'ORD-1' },
      run
    );

    expect(result).toBe('ok');
    expect(mocks.uploadReceipt).toHaveBeenCalledWith('sede-1', 'ORD-1', SAMPLE_FILE);
    expect(run).toHaveBeenCalledWith('sede-1/comprobante-ORD-1-1.jpg');
    expect(mocks.removeDeliveryReceipt).not.toHaveBeenCalled();
  });

  it('no sube la foto si needsMethod es false o no hay foto y pasa null a run', async () => {
    const run = vi.fn<(ruta: string | null) => Promise<void>>().mockResolvedValue(undefined);

    await withReceipt(
      { needsMethod: false, file: SAMPLE_FILE, sedeId: 'sede-1', numeroOrden: 'ORD-1' },
      run
    );
    await withReceipt(
      { needsMethod: true, file: null, sedeId: 'sede-1', numeroOrden: 'ORD-1' },
      run
    );

    expect(mocks.uploadReceipt).not.toHaveBeenCalled();
    expect(run).toHaveBeenNthCalledWith(1, null);
    expect(run).toHaveBeenNthCalledWith(2, null);
  });

  it('si run falla después de subir, borra la foto y relanza el error original', async () => {
    mocks.uploadReceipt.mockResolvedValue('sede-1/comprobante-ORD-1-1.jpg');
    const rpcError = new Error('falló la RPC');
    const run = vi.fn<(ruta: string | null) => Promise<never>>().mockRejectedValue(rpcError);

    await expect(
      withReceipt({ needsMethod: true, file: SAMPLE_FILE, sedeId: 'sede-1', numeroOrden: 'ORD-1' }, run)
    ).rejects.toBe(rpcError);

    expect(mocks.removeDeliveryReceipt).toHaveBeenCalledWith('sede-1/comprobante-ORD-1-1.jpg');
  });

  it('si run falla y el borrado también falla, relanza el error original', async () => {
    mocks.uploadReceipt.mockResolvedValue('sede-1/comprobante-ORD-1-1.jpg');
    mocks.removeDeliveryReceipt.mockRejectedValue(new Error('storage offline'));
    const rpcError = new Error('error original');
    const run = vi.fn<(ruta: string | null) => Promise<never>>().mockRejectedValue(rpcError);

    await expect(
      withReceipt({ needsMethod: true, file: SAMPLE_FILE, sedeId: 'sede-1', numeroOrden: 'ORD-1' }, run)
    ).rejects.toBe(rpcError);

    expect(mocks.removeDeliveryReceipt).toHaveBeenCalledWith('sede-1/comprobante-ORD-1-1.jpg');
  });
});
