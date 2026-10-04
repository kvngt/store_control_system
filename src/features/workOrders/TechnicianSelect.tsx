import { forwardRef } from 'react';
import { useLanguage } from '../../context/language.context';
import type { Technician } from './tasks';

interface TechnicianSelectProps {
  id: string;
  /** '' = sin técnico. */
  value: string;
  onChange: (id: string) => void;
  technicians: Technician[];
  /** Cómo se lee la opción vacía: "Sin asignar", o "Reparto por especialidad" en una línea heredada. */
  emptyLabel: string;
  /**
   * El técnico actual, si ya no está en la lista (cambió de sede o de rol): sin esta opción el
   * selector mostraría "Sin asignar" sobre una tarea que sí tiene técnico.
   */
  current?: Technician | null;
  disabled?: boolean;
  title?: string;
  className?: string;
}

/** El selector de técnico de una tarea: el editor y cada fila de la mano de obra usan el mismo. */
const TechnicianSelect = forwardRef<HTMLSelectElement, TechnicianSelectProps>(function TechnicianSelect(
  { id, value, onChange, technicians, emptyLabel, current, disabled, title, className },
  ref
) {
  const { t } = useLanguage();
  const options = current && !technicians.some((tech) => tech.id === current.id) ? [...technicians, current] : technicians;
  const trade = (rol: Technician['rol']) => t(`tasks.trade.${rol === 'pintor' ? 'pintor' : 'mecanico'}`);

  return (
    <select
      ref={ref}
      id={id}
      className={['form-input', 'form-select', className].filter(Boolean).join(' ')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      title={title}
      aria-label={t('tasks.technician')}
    >
      <option value="">{emptyLabel}</option>
      {options.map((tech) => (
        <option key={tech.id} value={tech.id}>
          {tech.nombre_completo} ({trade(tech.rol)})
        </option>
      ))}
    </select>
  );
});

export default TechnicianSelect;
