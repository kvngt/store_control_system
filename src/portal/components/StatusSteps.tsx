import { Check } from 'lucide-react';
import type { PortalStrings } from '../format';
import type { PortalReport } from '../portal.types';

const STEP_ORDER = ['received', 'working', 'ready', 'delivered'] as const;

function stepIndex(status: PortalReport['orden']['estatus']): number {
  switch (status) {
    case 'recepcion':
      return 0;
    case 'en_proceso':
    case 'espera_autorizacion':
      return 1;
    case 'finalizado':
      return 2;
    case 'entregado':
      return 3;
  }
}

export interface StatusStepsProps {
  status: PortalReport['orden']['estatus'];
  s: PortalStrings;
}

export function StatusSteps({ status, s }: StatusStepsProps) {
  const current = stepIndex(status);
  return (
    <ol className="portal-steps" aria-label={s.status[status]}>
      {STEP_ORDER.map((step, i) => (
        <li key={step} className={i < current ? 'is-done' : i === current ? 'is-current' : ''} aria-current={i === current ? 'step' : undefined}>
          <span className="portal-step-dot">{i < current ? <Check size={12} /> : i + 1}</span>
          <span className="portal-step-label">{s.steps[step]}</span>
        </li>
      ))}
    </ol>
  );
}
