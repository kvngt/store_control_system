import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../context/language.context';
import { looksIncomplete, parsePhone, PHONE_COUNTRIES, toE164 } from '../lib/phone';

interface PhoneInputProps {
  /** Lo guardado: formato internacional (`+15551234567`) o un número viejo sin "+". */
  value: string;
  /** Recibe siempre el formato internacional, o cadena vacía si no hay número. */
  onChange: (value: string) => void;
  /** Va en el campo del número, para que las etiquetas y las pruebas lo sigan encontrando. */
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  placeholder?: string;
}

/**
 * El teléfono del cliente con su país delante.
 *
 * Era un campo de texto suelto, así que el número no decía de dónde era: un celular de
 * México guardado como "55 1234 5678" se marcaba por WhatsApp como si fuera de EE. UU. Ahora
 * se elige el país — Estados Unidos por omisión, México después — y se guarda en formato
 * internacional, que es lo que usan la llamada y WhatsApp.
 *
 * Un número guardado antes, sin "+", se muestra como de EE. UU. pero **no se reescribe**
 * mientras nadie toque el campo: `onChange` solo se llama cuando la persona cambia algo.
 */
export default function PhoneInput({ value, onChange, id, disabled, invalid, placeholder }: PhoneInputProps) {
  const { t } = useLanguage();
  const [{ iso, national }, setParts] = useState(() => parsePhone(value));
  const [touched, setTouched] = useState(false);

  // Lo último que este campo le mandó al formulario. Cuando el valor vuelve igual, es el eco
  // de lo que se acaba de escribir y no hay nada que releer; cuando llega otro (el formulario
  // se vació, se abrió otro cliente), el campo se pone al día.
  const emitted = useRef(value);
  useEffect(() => {
    if (value === emitted.current) return;
    emitted.current = value;
    setParts(parsePhone(value));
    setTouched(false);
  }, [value]);

  const emit = (nextIso: string, nextNational: string) => {
    setParts({ iso: nextIso, national: nextNational });
    const next = toE164(nextIso, nextNational);
    emitted.current = next;
    onChange(next);
  };

  const incomplete = touched && looksIncomplete(iso, national);

  return (
    <div>
      <div className="phone-input">
        <select
          className="form-input form-select phone-input-country"
          value={iso}
          onChange={(e) => emit(e.target.value, national)}
          disabled={disabled}
          aria-label={t('phone.country')}
        >
          {PHONE_COUNTRIES.map((c) => (
            <option key={c.iso} value={c.iso}>
              {c.flag} +{c.dial} {t(`phone.countries.${c.iso}`)}
            </option>
          ))}
        </select>
        <input
          className="form-input phone-input-number"
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={national}
          onChange={(e) => emit(iso, e.target.value)}
          onBlur={() => setTouched(true)}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          placeholder={placeholder ?? (iso === 'US' ? '(555) 123-4567' : undefined)}
        />
      </div>
      {/* Aviso y no bloqueo: un número viejo o de un formato raro no debe impedir guardar el
          resto de la ficha del cliente. */}
      {incomplete && <p className="field-hint">{t('phone.incomplete')}</p>}
    </div>
  );
}
