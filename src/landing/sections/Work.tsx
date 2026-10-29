import { Instagram } from 'lucide-react';
import chargerAfterFront from '../assets/work/charger-despues-frente.webp';
import chargerAfterRear from '../assets/work/charger-despues-atras.webp';
import chargerBeforeFront from '../assets/work/charger-antes-frente.webp';
import chargerBeforeRear from '../assets/work/charger-antes-atras.webp';
import lexusAfter640 from '../assets/work/lexus-despues-640.webp';
import lexusAfter1200 from '../assets/work/lexus-despues-1200.webp';
import lexusBefore640 from '../assets/work/lexus-antes-640.webp';
import lexusBefore1200 from '../assets/work/lexus-antes-1200.webp';
import { SHOP } from '../business';
import type { LandingStrings } from '../strings';

// Fotos del propio taller (las de su sitio anterior, restorifyauto.shop), recortadas y convertidas a
// WebP. Cuando el taller mande más, se agregan aquí con su antes y su después.

interface Shot {
  src: string;
  srcSet?: string;
  width: number;
  height: number;
  when: 'before' | 'after';
}

const LEXUS: Shot[] = [
  { src: lexusBefore1200, srcSet: `${lexusBefore640} 640w, ${lexusBefore1200} 1200w`, width: 1200, height: 591, when: 'before' },
  { src: lexusAfter1200, srcSet: `${lexusAfter640} 640w, ${lexusAfter1200} 1200w`, width: 1200, height: 477, when: 'after' },
];

// De frente y de atrás, cada toma con su antes al lado.
const CHARGER: Shot[] = [
  { src: chargerBeforeFront, width: 504, height: 762, when: 'before' },
  { src: chargerAfterFront, width: 504, height: 760, when: 'after' },
  { src: chargerBeforeRear, width: 504, height: 762, when: 'before' },
  { src: chargerAfterRear, width: 504, height: 760, when: 'after' },
];

function Photo({ shot, alt, label, sizes }: { shot: Shot; alt: string; label: string; sizes: string }) {
  return (
    <div className={`lp-shot lp-shot--${shot.when}`}>
      <img src={shot.src} srcSet={shot.srcSet} sizes={shot.srcSet ? sizes : undefined} alt={alt} width={shot.width} height={shot.height} loading="lazy" decoding="async" />
      <span className="lp-shot__label">{label}</span>
    </div>
  );
}

/** Trabajos del taller, con su antes y su después: la prueba, justo después de la promesa. */
export default function Work({ s }: { s: LandingStrings }) {
  const [lexus, charger] = s.work.cases;
  const label = (shot: Shot) => (shot.when === 'before' ? s.work.before : s.work.after);
  const alt = (text: { before: string; after: string }, shot: Shot) => (shot.when === 'before' ? text.before : text.after);

  return (
    <section id="trabajos" className="lp-section lp-work" aria-labelledby="lp-work-title">
      <div className="lp-wrap">
        <header className="lp-head">
          <h2 id="lp-work-title" className="lp-h2">
            {s.work.title}
          </h2>
          <p className="lp-lead">{s.work.text}</p>
        </header>

        <div className="lp-work__grid">
          <figure className="lp-case lp-case--lexus">
            <div className="lp-case__shots">
              {LEXUS.map((shot) => (
                <Photo key={shot.src} shot={shot} alt={alt(lexus, shot)} label={label(shot)} sizes="(min-width: 1024px) 58vw, 100vw" />
              ))}
            </div>
            <figcaption>
              <strong>{lexus.name}</strong> {lexus.text}
            </figcaption>
          </figure>

          <figure className="lp-case lp-case--charger">
            <div className="lp-case__shots">
              {CHARGER.map((shot, i) => (
                // Las tomas de frente ya dicen "de frente y de atrás": las de atrás no lo repiten.
                <Photo key={shot.src} shot={shot} alt={i < 2 ? alt(charger, shot) : ''} label={label(shot)} sizes="" />
              ))}
            </div>
            <figcaption>
              <strong>{charger.name}</strong> {charger.text}
            </figcaption>
          </figure>
        </div>

        <a className="lp-link" href={SHOP.links.instagram} target="_blank" rel="noopener noreferrer">
          <Instagram aria-hidden="true" size={18} />
          {s.work.more}
        </a>
      </div>
    </section>
  );
}
