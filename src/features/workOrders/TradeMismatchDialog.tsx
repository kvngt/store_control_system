import { AlertTriangle } from 'lucide-react';
import Modal from '../../components/Modal';
import { moduloActivo } from '../../config/modulos';
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
    <Modal
      usePortal
      role="alertdialog"
      onClose={onCancel}
      style={{ maxWidth: 460 }}
      title={
        <>
          <AlertTriangle size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle', color: 'var(--color-warning)' }} />
          {title}
        </>
      }
      footerClassName="trade-mismatch-actions"
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onChooseOther}>
            {t('tasks.chooseOther')}
          </button>
          <button type="button" className="btn btn-primary" onClick={onAssign} autoFocus>
            {confirmLabel ?? t('tasks.assignAnyway')}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
        {t(moduloActivo('comisiones') ? 'tasks.mismatchBody' : 'tasks.mismatchBodyNoCommission').replace('{nombre}', technician.nombre_completo).replace('{oficio}', oficio)}
      </p>
    </Modal>
  );
}
