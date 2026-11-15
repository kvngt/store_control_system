import { describe, it, expect } from 'vitest';
import { createQueryClient, invalidateOrderEffects, queryKeys } from './queryClient';

describe('invalidateOrderEffects', () => {
  it('invalida las cachés derivadas de una orden respetando sedeId y orderId', async () => {
    const qc = createQueryClient();

    const affected = [
      queryKeys.workOrders('sede-1'),
      queryKeys.workOrderDetail('ord-1'),
      queryKeys.dashboardStats('sede-1', 10),
      queryKeys.attention('sede-1'),
      queryKeys.transactions('sede-1'),
      queryKeys.orderBalance('ord-1'),
      queryKeys.orderFinancialBalance('ord-1'),
      queryKeys.orderMargins('sede-1', '2026-10', 0),
      queryKeys.commissions('sede-1'),
      queryKeys.commissionPayments('sede-1'),
      queryKeys.commissionEstimate('ord-1'),
      queryKeys.paidCommissions('ord-1'),
      queryKeys.myCommissions('tech-1'),
      queryKeys.myTasks('tech-1'),
      queryKeys.workshopMetrics('sede-1', '2026-10-01', '2026-10-31'),
      queryKeys.orderJobs('ord-1'),
      queryKeys.quotes('ord-1'),
    ];
    const untouched = [
      queryKeys.workOrders('sede-2'),
      queryKeys.workOrderDetail('ord-2'),
      queryKeys.transactions('sede-2'),
      queryKeys.workshopMetrics('sede-2', '2026-10-01', '2026-10-31'),
      queryKeys.orderJobs('ord-2'),
      queryKeys.quotes('ord-2'),
      queryKeys.customers('sede-1'),
    ];

    for (const key of [...affected, ...untouched]) {
      qc.setQueryData(key, { ok: true });
    }

    await invalidateOrderEffects(qc, { orderId: 'ord-1', sedeId: 'sede-1' });

    for (const key of affected) {
      expect(qc.getQueryState(key)?.isInvalidated, `esperaba invalidada ${JSON.stringify(key)}`).toBe(true);
    }
    for (const key of untouched) {
      expect(qc.getQueryState(key)?.isInvalidated, `no debía invalidar ${JSON.stringify(key)}`).toBe(false);
    }
  });

  it('invalida familias globales cuando no se especifica sedeId ni orderId', async () => {
    const qc = createQueryClient();
    const keys = [
      queryKeys.workOrders('sede-1'),
      queryKeys.dashboardStats('sede-2', 8),
      queryKeys.attention('sede-1'),
      queryKeys.transactions('sede-1'),
      queryKeys.orderMargins('sede-1', '2026-10', 0),
      queryKeys.commissions('sede-1'),
      queryKeys.paidCommissions('ord-1'),
      queryKeys.orderFinancialBalance('ord-1'),
      queryKeys.myTasks('tech-1'),
      queryKeys.workshopMetrics('sede-1', '2026-10-01', '2026-10-31'),
      queryKeys.orderJobs('ord-1'),
      queryKeys.quotes('ord-1'),
    ];
    for (const key of keys) qc.setQueryData(key, { ok: true });

    await invalidateOrderEffects(qc);

    for (const key of keys) {
      expect(qc.getQueryState(key)?.isInvalidated, `esperaba invalidada ${JSON.stringify(key)}`).toBe(true);
    }
  });
});
