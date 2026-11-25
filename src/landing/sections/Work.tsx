import { Instagram } from 'lucide-react';
import chargerAfter from '../assets/work/charger-despues.webp';
import chargerBefore from '../assets/work/charger-antes.webp';
import corollaAfter from '../assets/work/corolla-despues.webp';
import corollaBefore from '../assets/work/corolla-antes.webp';
import elantraAfter640 from '../assets/work/elantra-despues-640.webp';
import elantraAfter1200 from '../assets/work/elantra-despues-1200.webp';
import elantraBefore640 from '../assets/work/elantra-antes-640.webp';
import elantraBefore1146 from '../assets/work/elantra-antes-1146.webp';
import kicksAfter from '../assets/work/kicks-despues.webp';
import kicksBefore from '../assets/work/kicks-antes.webp';
import { SHOP } from '../business';
import type { LandingStrings } from '../strings';

// Fotos del propio taller: los collages de antes y después que mandó el 25/11/2026, recortados y
// convertidos a WebP con scripts/landing/fotos-de-trabajos.mjs (ahí están los recortes y por qué se
// dejaron fuera algunas tomas). El orden es el de `s.work.cases`: el primero va en grande.

interface Shot {
  src: string;
  srcSet?: string;
  width: number;
  height: number;
  when: 'before' | 'after';
}

const CASES: Shot[][] = [
  [
    { src: elantraBefore1146, srcSet: `${elantraBefore640} 640w, ${elantraBefore1146} 1146w`, width: 1146, height: 764, when: 'before' },
    { src: elantraAfter1200, srcSet: `${elantraAfter640} 640w, ${elantraAfter1200} 1200w`, width: 1200, height: 800, when: 'after' },
  ],
  [
    { src: chargerBefore, width: 448, height: 336, when: 'before' },
    { src: chargerAfter, width: 448, height: 336, when: 'after' },
  ],
  [
    { src: kicksBefore, width: 640, height: 480, when: 'before' },
    { src: kicksAfter, width: 640, height: 480, when: 'after' },
  ],
  [
    { src: corollaBefore, width: 640, height: 480, when: 'before' },
    { src: corollaAfter, width: 640, height: 480, when: 'after' },
  ],
];

function Photo({ shot, alt, label }: { shot: Shot; alt: string; label: string }) {
  return (
    <div className={`lp-shot lp-shot--${shot.when}`}>
      <img
        src={shot.src}
        srcSet={shot.srcSet}
        sizes={shot.srcSet ? '(min-width: 1024px) 50vw, (min-width: 640px) 50vw, 100vw' : undefined}
        alt={alt}
        width={shot.width}
        height={shot.height}
        loading="lazy"
        decoding="async"
      />
      <span className="lp-shot__label">{label}</span>
    </div>
  );
}

/** Trabajos del taller, con su antes y su después: la prueba, justo después de la promesa. */
export default function Work({ s }: { s: LandingStrings }) {
  const label = (shot: Shot) => (shot.when === 'before' ? s.work.before : s.work.after);

  const renderCase = (index: number, variant: 'featured' | 'compact') => {
    const text = s.work.cases[index];
    return (
      <figure key={text.name} className={`lp-case lp-case--${variant}`}>
        <div className="lp-case__shots">
          {CASES[index].map((shot) => (
            <Photo key={shot.src} shot={shot} alt={shot.when === 'before' ? text.before : text.after} label={label(shot)} />
          ))}
        </div>
        <figcaption>
          <strong>{text.name}</strong> {text.text}
        </figcaption>
      </figure>
    );
  };

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
          {renderCase(0, 'featured')}
          <div className="lp-work__more">{CASES.slice(1).map((_, i) => renderCase(i + 1, 'compact'))}</div>
        </div>

        <a className="lp-link" href={SHOP.links.instagram} target="_blank" rel="noopener noreferrer">
          <Instagram aria-hidden="true" size={18} />
          {s.work.more}
        </a>
      </div>
    </section>
  );
}
