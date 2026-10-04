import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Car, ChevronRight, Circle, Clock } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { workOrdersService } from '../../services/workOrders.service';
import { queryKeys } from '../../lib/queryClient';
import { orderDueState } from '../../lib/orderDue';
import type { MyTask } from '../../types/database';

/**
 * "Mis tareas" en el panel del técnico (F7, como la vista "My Work" de Tekmetric): lo que le
 * falta hacer en todas sus órdenes sin entregar, sin tener que abrirlas una por una. Cada
 * tarea abre su orden en la pestaña Tareas, donde se marca Realizado y se agregan avances.
 *
 * Las hechas no se listan (se cuentan): el panel es lo pendiente. Las que el cliente todavía
 * no autoriza salen al final con su aviso, porque aún no se pueden hacer.
 */
export default function MyTasksCard({ userId }: { userId: string }) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: queryKeys.myTasks(userId),
    queryFn: () => workOrdersService.getMyTasks(userId),
  });

  const { todo, done } = useMemo(() => {
    const tasks = query.data ?? [];
    const pending = tasks.filter((task) => !task.completado_en);
    // Primero lo que se puede hacer ya; dentro de eso, la orden que vence antes.
    const rank = (task: MyTask) => (task.estado === 'aprobado' ? 0 : 1);
    pending.sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.orden.fecha_estimada_entrega || '9999').localeCompare(b.orden.fecha_estimada_entrega || '9999')
    );
    return { todo: pending, done: tasks.length - pending.length };
  }, [query.data]);

  if (query.isPending) return null;

  return (
    <div className="card my-tasks-card" role="region" aria-label={t('myTasks.title')}>
      <div className="card-header">
        <h3 className="card-title">
          {t('myTasks.title')} {todo.length > 0 && <span className="orders-section-count">{todo.length}</span>}
        </h3>
      </div>
      {query.error ? (
        <p className="field-hint">{t('myTasks.loadError')}</p>
      ) : todo.length === 0 ? (
        <p className="field-hint">{t('myTasks.empty')}</p>
      ) : (
        <ul className="my-tasks-list">
          {todo.map((task) => {
            const approved = task.estado === 'aprobado';
            const due = orderDueState(task.orden);
            const vehiculo = task.orden.vehiculo;
            return (
              <li key={task.id}>
                <button
                  type="button"
                  className="my-task"
                  onClick={() => navigate(`/work-orders?open=${task.orden_id}&tab=tareas`)}
                  aria-label={t('myTasks.openTask')
                    .replace('{tarea}', task.descripcion)
                    .replace('{numero}', task.orden.numero_orden)}
                >
                  {approved ? (
                    <Circle size={16} className="my-task-icon" aria-hidden="true" />
                  ) : (
                    <Clock size={16} className="my-task-icon my-task-waiting" aria-hidden="true" />
                  )}
                  <span className="my-task-text">
                    <strong>{task.descripcion}</strong>
                    <span className="my-task-meta">
                      {task.orden.numero_orden}
                      {vehiculo && (
                        <>
                          {' · '}
                          <Car size={12} aria-hidden="true" /> {vehiculo.marca} {vehiculo.modelo}
                        </>
                      )}
                      {task.orden.fecha_estimada_entrega && (
                        <span className={due ? `due-${due}` : undefined}> · {task.orden.fecha_estimada_entrega}</span>
                      )}
                    </span>
                    {!approved && <span className="badge badge-waiting-auth">{t('quotes.waitingBadge')}</span>}
                  </span>
                  <ChevronRight size={16} className="my-task-arrow" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {done > 0 && <p className="field-hint my-tasks-done">{t('myTasks.doneCount').replace('{n}', String(done))}</p>}
    </div>
  );
}
