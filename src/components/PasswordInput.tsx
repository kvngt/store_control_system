import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useLanguage } from '../context/language.context';

interface PasswordInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
}

/**
 * A password field with a reveal toggle.
 *
 * Asked for from the shop: people sign in on a tablet with wet or gloved hands
 * and a dark shop floor, and a password typed blind that comes back "wrong
 * email or password" gives no clue whether the password or the email was the
 * problem. Being able to look at what you typed is the fix.
 *
 * The button is `tabIndex={-1}` on purpose: it sits between the password field
 * and the submit button, and stopping there on the way to Enter would slow down
 * the thing people do fifty times a day. It stays reachable by mouse and touch,
 * and screen readers get it from the label.
 */
export default function PasswordInput({
  id,
  value,
  onChange,
  className = 'form-input',
  placeholder = '••••••••',
  autoComplete = 'current-password',
  required,
  disabled,
}: PasswordInputProps) {
  const { t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="password-field">
      <input
        id={inputId}
        type={visible ? 'text' : 'password'}
        className={className}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
        aria-pressed={visible}
        title={visible ? t('auth.hidePassword') : t('auth.showPassword')}
        tabIndex={-1}
        disabled={disabled}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
