import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { workOrdersService } from '../../services/supabaseService';
import { money } from '../../lib/money';
import type { PendingWorkItem } from '../../types/database';

interface PendingWorkNoticeProps {
  vehicleId: string;
  /** La orden que se está viendo: lo suyo no es "de una visita anterior". */
  excludeOrderId?: string | null;
}

/**
 * Lo que el cliente no autorizó (o no se hizo, en una retirada) en visitas anteriores de este
 * vehículo, para ofrecérselo de nuevo. Es lo que los programas comerciales llaman "trabajos
 * declinados" o "recomendaciones pendientes": trabajo ya diagnosticado que el taller pierde si
 * nadie se acuerda de él.
 *
 * Solo administración (`trabajos_pendientes_vehiculo`). Sin pendientes, o si la consulta falla,
 * no se muestra nada: es un recordatorio, no un paso.
 */
export default function PendingWorkNotice({ vehicleId, excludeOrderId }: PendingWorkNoticeProps) {
  const { t, language } = useLanguage();
  const query = useQuery({
    queryKey: ['pending-work', vehicleId, excludeOrderId ?? null],
    queryFn: async () => (await workOrdersService.getPendingWork(vehicleId, excludeOrderId)) ?? [],
    enabled: !!vehicleId,
  });
  const items: PendingWorkItem[] = query.data ?? [];
  if (items.length === 0) return null;

  return (
    <div className="pending-work" role="note">
      <p className="pending-work-title">
        <History size={14} aria-hidden="true" /> {t('pendingWork.title')}
      </p>
      <p className="field-hint">{t('pendingWork.hint')}</p>
      <ul>
        {items.map((item, i) => (
          <li key={`${item.orden_id}-${i}`}>
            <span>
              {item.descripcion}
              <span className="field-hint">
                {' · '}
                {item.numero_orden} · {new Date(item.fecha).toLocaleDateString(language)}
                {' · '}
                {item.retirada ? t('pendingWork.notDone') : t('pendingWork.declined')}
              </span>
            </span>
            <span className="pending-work-amount">{money(item.monto)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
