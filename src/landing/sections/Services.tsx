import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { shopLine } from '../business';
import { fill, landingStrings, type LandingLanguage, type LandingStrings } from '../strings';
import { whatsAppUrl } from '../../lib/phone';

/** Lo marcado, en el idioma `language`: las listas de los dos idiomas van en el mismo orden. */
function checkedNames(checked: boolean[][], language: LandingLanguage): string[] {
  return landingStrings[language].services.groups.flatMap((group, g) => group.items.filter((_, i) => checked[g]?.[i]));
}

/** El mensaje para la línea `language`, escrito en ese idioma. */
function messageFor(checked: boolean[][], language: LandingLanguage): string {
  const strings = landingStrings[language].services;
  const names = checkedNames(checked, language);
  return names.length ? fill(strings.message, { items: names.join(', ') }) : strings.messageEmpty;
}

/**
 * Los servicios, como la lista de la orden de trabajo en papel del taller: la persona marca lo que
 * necesita y lo manda por WhatsApp a quien atiende en su idioma, con el mensaje ya escrito.
 */
export default function Services({ s, language }: { s: LandingStrings; language: LandingLanguage }) {
  const [checked, setChecked] = useState<boolean[][]>(() => s.services.groups.map((group) => group.items.map(() => false)));
  const other: LandingLanguage = language === 'es' ? 'en' : 'es';
  const main = shopLine(language);
  const second = shopLine(other);
  const count = checked.flat().filter(Boolean).length;
  const countText = count === 0 ? s.services.none : count === 1 ? s.services.selectedOne : fill(s.services.selected, { count: String(count) });

  const toggle = (g: number, i: number) =>
    setChecked((current) => current.map((group, gi) => (gi === g ? group.map((value, ii) => (ii === i ? !value : value)) : group)));

  return (
    <section id="servicios" className="lp-section lp-light lp-services" aria-labelledby="lp-services-title">
      <div className="lp-wrap lp-services__inner">
        {/* En el teléfono: el título, la lista y el envío, en ese orden. En escritorio el envío
            queda a la izquierda, debajo del título, a la vista mientras se marca. */}
        <header className="lp-head">
          <h2 id="lp-services-title" className="lp-h2">
            {s.services.title}
          </h2>
          <p className="lp-lead">{s.services.text}</p>
        </header>

        <div className="lp-services__lists">
          {s.services.groups.map((group, g) => (
            <fieldset key={group.name} className="lp-checks">
              <legend className="lp-checks__legend">{group.name}</legend>
              <ul>
                {group.items.map((item, i) => (
                  <li key={item}>
                    <label className="lp-check">
                      <input type="checkbox" checked={checked[g][i]} onChange={() => toggle(g, i)} />
                      <span>{item}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          ))}
        </div>
        <div className="lp-send">
          <p className="lp-send__count" aria-live="polite">
            {countText}
          </p>
          <a
            className="lp-btn lp-btn--gold"
            href={whatsAppUrl(main.e164, messageFor(checked, language))}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle aria-hidden="true" size={20} />
            {fill(s.services.send, { person: main.person ?? '' })}
          </a>
          <a
            className="lp-send__other"
            lang={other}
            href={whatsAppUrl(second.e164, messageFor(checked, other))}
            target="_blank"
            rel="noopener noreferrer"
          >
            {fill(s.services.other, { person: second.person ?? '' })}
          </a>
        </div>
      </div>
    </section>
  );
}
