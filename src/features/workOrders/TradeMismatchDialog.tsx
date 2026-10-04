import { AlertTriangle } from 'lucide-react';
import BodyPortal from '../../components/BodyPortal';
import { useLanguage } from '../../context/language.context';
import type { Specialty } from '../../types/database';
import type { Technician } from './tasks';

interface TradeMismatchDialogProps {
  especialidad: Specialty;
  technician: Technician;
  /** Asignarla de todos modos. */
  onAssign: () => void;
  /** Volver al selector de técnico para elegir a otra persona. */
  onChooseOther: () => void;
  /** No hacer nada. */
  onCancel: () => void;
  /**
   * Para cambiar el tipo de una tarea que ya tiene técnico ("¿Pasar a pintura una tarea de un
   * mecánico?"): el mismo cruce de oficios, preguntado desde el otro selector.
   */
  title?: string;
  confirmLabel?: string;
}

/**
 * "¿Asignar una tarea de pintura a un mecánico?" (pedido del taller, 03/10/2026).
 *
 * La comisión de la tarea es de su técnico, así que asignarla fuera de su oficio por error le
 * paga a otra persona. No se prohíbe —a veces es justo lo que se quiere— pero se pregunta, con
 * el diálogo del proyecto y no con `confirm`, que no deja ofrecer tres salidas.
 */
export default function TradeMismatchDialog({ especialidad, technician, onAssign, onChooseOther, onCancel, title: customTitle, confirmLabel }: TradeMismatchDialogProps) {
  const { t } = useLanguage();
  const title = customTitle ?? (especialidad === 'pintura' ? t('tasks.mismatchPaintToMechanic') : t('tasks.mismatchMechanicToPainter'));
  const oficio = t(`tasks.trade.${technician.rol === 'pintor' ? 'pintor' : 'mecanico'}`);

  return (
    <BodyPortal>
      <div className="modal-overlay" onClick={onCancel}>
        <div
          className="modal"
          style={{ maxWidth: 460 }}
          onClick={(e) => e.stopPropagation()}
          role="alertdialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="modal-header">
            <h2 className="modal-title">
              <AlertTriangle size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle', color: 'var(--color-warning)' }} />
              {title}
            </h2>
          </div>
          <div className="modal-body">
            <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              {t('tasks.mismatchBody').replace('{nombre}', technician.nombre_completo).replace('{oficio}', oficio)}
            </p>
          </div>
          <div className="modal-footer trade-mismatch-actions">
            <button type="button" className="btn btn-ghost" onClick={onCancel}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onChooseOther}>
              {t('tasks.chooseOther')}
            </button>
            <button type="button" className="btn btn-primary" onClick={onAssign} autoFocus>
              {confirmLabel ?? t('tasks.assignAnyway')}
            </button>
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}
