import { MessageCircle } from 'lucide-react';
import { INSURERS, shopLine } from '../business';
import type { LandingLanguage, LandingStrings } from '../strings';
import { whatsAppUrl } from '../../lib/phone';

/** Seguros: los cuatro pasos de un reclamo con el taller y algunas aseguradoras de la zona. */
export default function Insurance({ s, language }: { s: LandingStrings; language: LandingLanguage }) {
  return (
    <section id="seguros" className="lp-section lp-light lp-insurance" aria-labelledby="lp-insurance-title">
      <div className="lp-wrap lp-insurance__inner">
        <header className="lp-head">
          <h2 id="lp-insurance-title" className="lp-h2">
            {s.insurance.title}
          </h2>
          <p className="lp-lead">{s.insurance.text}</p>
          <a
            className="lp-btn lp-btn--dark"
            href={whatsAppUrl(shopLine(language).e164, s.insurance.ctaMessage)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle aria-hidden="true" size={20} />
            {s.insurance.cta}
          </a>
        </header>

        <ol className="lp-steps" aria-label={s.insurance.stepsLabel}>
          {s.insurance.steps.map((step, i) => (
            <li key={step.name} className="lp-step">
              <span className="lp-step__number" aria-hidden="true">
                {i + 1}
              </span>
              <span className="lp-step__name">{step.name}</span>
              <span className="lp-step__text">{step.text}</span>
            </li>
          ))}
        </ol>

        <div className="lp-insurers">
          <p className="lp-insurers__label" id="lp-insurers-label">
            {s.insurance.insurersLabel}
          </p>
          <ul aria-labelledby="lp-insurers-label">
            {INSURERS.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
