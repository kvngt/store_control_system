import { useLanguage } from '../../context/language.context';
import type { LineState } from '../../types/database';

/**
 * El estado de una línea de mano de obra o repuesto. Lo autorizado no lleva
 * insignia: es lo normal, y la tabla se lee mejor si solo resalta lo que falta o
 * lo que no se debe hacer.
 */
export default function LineStateBadge({ state }: { state?: LineState }) {
  const { t } = useLanguage();
  if (!state || state === 'aprobado') return null;
  return <span className={`badge line-state line-state-${state}`}>{t(`quotes.lineState.${state}`)}</span>;
}
