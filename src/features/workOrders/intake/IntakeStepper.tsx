import { Check } from 'lucide-react';
import { useLanguage } from '../../../context/language.context';
import { INTAKE_STEPS } from '../workOrderForm.schema';

interface IntakeStepperProps {
  step: number;
  furthestStep: number;
  saving: boolean;
  onSelectStep: (target: number) => void;
}

export default function IntakeStepper({ step, furthestStep, saving, onSelectStep }: IntakeStepperProps) {
  const { t } = useLanguage();
  const totalSteps = INTAKE_STEPS.length;
  const current = INTAKE_STEPS[step - 1];

  return (
    <>
      {/* Los pasos ya vistos se pueden volver a abrir; los de adelante, solo con
          "Siguiente", que valida el paso que se deja. */}
      <ol
        className="intake-steps"
        aria-label={t('intake.stepOf').replace('{step}', String(step)).replace('{total}', String(totalSteps))}
      >
        {INTAKE_STEPS.map(({ key }, i) => {
          const n = i + 1;
          const state = n === step ? 'current' : n < step || n <= furthestStep ? 'done' : 'todo';
          const label = t(`intake.steps.${key}`);
          return (
            <li key={key} className={`intake-step intake-step-${state}`} aria-current={n === step ? 'step' : undefined}>
              {state === 'done' ? (
                <button
                  type="button"
                  className="intake-step-button"
                  onClick={() => onSelectStep(n)}
                  disabled={saving}
                >
                  <span className="intake-step-number"><Check size={12} /></span>
                  <span className="intake-step-label">{label}</span>
                </button>
              ) : (
                <span className="intake-step-button">
                  <span className="intake-step-number">{n}</span>
                  <span className="intake-step-label">{label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <h4 className="intake-step-title">
        {t('intake.stepOf').replace('{step}', String(step)).replace('{total}', String(totalSteps))}
        {' · '}
        {t(`intake.steps.${current.key}`)}
      </h4>
    </>
  );
}
