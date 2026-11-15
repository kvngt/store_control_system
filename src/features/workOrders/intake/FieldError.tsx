import { useLanguage } from '../../../context/language.context';

interface FieldErrorProps {
  messageKey?: string;
}

export default function FieldError({ messageKey }: FieldErrorProps) {
  const { t } = useLanguage();
  if (!messageKey) return null;
  return (
    <span role="alert" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>
      {t(messageKey)}
    </span>
  );
}
