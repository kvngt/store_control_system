import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/auth.context';
import { workOrdersService } from '../../services/workOrders.service';
import { queryKeys } from '../../lib/queryClient';

/**
 * Cuánto se juntan los avisos antes de releer. Un cambio de estado toca varias filas a la
 * vez (la orden, sus montos, las comisiones…) y basta una lectura por orden.
 */
export const BATCH_MS = 400;

/**
 * Volver a la app después de tenerla escondida este tiempo relee las órdenes: en un teléfono
 * dormido el websocket se corta sin aviso y tarda en notarlo, y lo que cambió mientras tanto
 * no se reenvía.
 */
export const HIDDEN_RELOAD_MS = 30_000;

/** Lo que se lee de una orden en particular: el detalle y sus tarjetas. */
const PER_ORDER = [
  queryKeys.workOrderDetail,
  queryKeys.quotes,
  queryKeys.customerLink,
  queryKeys.customerEmails,
  queryKeys.orderBalance,
  queryKeys.commissionEstimate,
  queryKeys.orderFinancialBalance,
  queryKeys.orderHistory,
] as const;

/** Las listas donde aparece cualquier orden. Por prefijo: se guardan por sede, búsqueda y página. */
const LISTS = [
  queryKeys.workOrders()[0],
  queryKeys.archivedWorkOrders(undefined, '', 0)[0],
  queryKeys.dashboardStats()[0],
];

/**
 * Marca como viejo lo que mostraba esas órdenes. Solo se vuelve a pedir lo que está en
 * pantalla; lo demás espera a que alguien lo abra.
 */
function reloadOrders(queryClient: QueryClient, orderIds: string[] | 'all') {
  for (const list of LISTS) void queryClient.invalidateQueries({ queryKey: [list] });
  for (const key of PER_ORDER) {
    if (orderIds === 'all') {
      void queryClient.invalidateQueries({ queryKey: [key('')[0]] });
    } else {
      for (const id of orderIds) void queryClient.invalidateQueries({ queryKey: key(id) });
    }
  }
}

/**
 * Las órdenes al día sin recargar: cuando alguien cambia una orden (una técnica la finaliza,
 * el cliente aprueba un presupuesto, administración agrega una línea), quien la tiene abierta
 * o ve el tablero la ve cambiar. Se monta una vez, en `AppLayout`.
 *
 * Antes la pantalla se releía solo al guardar algo en ella o al volver a entrar pasados 30 s
 * (`staleTime`), y el admin no veía una orden finalizada hasta recargar (octubre 2026).
 *
 * Es una señal, no los datos: el evento de Realtime dice qué orden cambió y se vuelve a leer
 * por las consultas de siempre. Así lo que se pinta pasa por las mismas reglas y relaciones
 * que cualquier otra lectura, y no hay que adivinar qué cambiaron los triggers.
 */
export function useOrderSync() {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      timer = undefined;
      const ids = [...pending];
      pending.clear();
      reloadOrders(queryClient, ids);
    };

    const unsubscribe = workOrdersService.subscribeToChanges(
      (orderId) => {
        pending.add(orderId);
        timer ??= setTimeout(flush, BATCH_MS);
      },
      () => reloadOrders(queryClient, 'all')
    );

    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt !== null && Date.now() - hiddenAt >= HIDDEN_RELOAD_MS) reloadOrders(queryClient, 'all');
      hiddenAt = null;
    };
    document.addEventListener('visibilitychange', onVisibility);

    // Cerrar sesión o cambiar de persona cierra el canal: la sesión nueva abre el suyo, con
    // su propia RLS.
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [queryClient, userId]);
}
