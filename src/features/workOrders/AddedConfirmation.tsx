import { CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../../context/language.context';

/** "Agregado: …" junto al botón que lo agregó. Lo enciende `useAddedConfirmation`. */
export default function AddedConfirmation({ text }: { text: string | null }) {
  const { t } = useLanguage();
  if (!text) return null;
  return (
    <p className="added-confirmation" role="status">
      <CheckCircle2 size={14} /> {t('common.addedItem').replace('{item}', text)}
    </p>
  );
}
