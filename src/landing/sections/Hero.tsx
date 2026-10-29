import { useEffect, useRef, useState } from 'react';
import { Phone, ShieldCheck, Star } from 'lucide-react';
import { HERO_POSTER, HERO_VIDEOS } from '../heroImage';
import { shopLine, SHOP, type ShopLine } from '../business';
import { fill, type LandingLanguage, type LandingStrings } from '../strings';
import { telUrl } from '../../lib/phone';

interface HeroProps {
  s: LandingStrings;
  language: LandingLanguage;
  statusText: string;
  open: boolean;
}

const motionReduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const savingData = () => (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;

/**
 * El video de la intro, sin sonido y en bucle, sin controles (así lo pidió el taller). Con "reducir
 * movimiento" se queda en su primer cuadro y con ahorro de datos ni se descarga. Fuera de la pantalla
 * se detiene y al volver sigue.
 */
function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [reduced] = useState(motionReduced);
  const [enabled] = useState(() => !savingData());

  useEffect(() => {
    const video = videoRef.current;
    if (!video || reduced || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) video.pause();
      else void video.play()?.catch(() => {});
    });
    observer.observe(video);
    return () => observer.disconnect();
  }, [reduced]);

  if (!enabled) {
    return <img className="lp-hero__media" src={HERO_POSTER} alt="" width={1280} height={720} fetchPriority="high" />;
  }

  return (
    <video
      ref={videoRef}
      className="lp-hero__media"
      poster={HERO_POSTER}
      width={1280}
      height={720}
      autoPlay={!reduced}
      muted
      loop
      playsInline
      preload={reduced ? 'none' : 'auto'}
      aria-hidden="true"
    >
      {HERO_VIDEOS.map((video) => (
        <source key={video.src} src={video.src} media={video.media} type="video/mp4" />
      ))}
    </video>
  );
}

/**
 * La portada es la tarjeta de presentación del taller hecha página: el lema con la letra del logo,
 * quién contesta cada teléfono, el video del taller dentro del chevrón dorado y la franja de las
 * aseguradoras.
 */
export default function Hero({ s, language, statusText, open }: HeroProps) {
  const [repair, restore, perform] = s.hero.words;
  // Primero la línea del idioma de quien lee.
  const lines: ShopLine[] = language === 'es' ? [shopLine('es'), shopLine('en')] : [shopLine('en'), shopLine('es')];

  return (
    <section id="lp-top" className="lp-hero" aria-labelledby="lp-hero-title">
      <div className="lp-wrap lp-hero__inner">
        <div className="lp-hero__copy">
          <h1 id="lp-hero-title" className="lp-hero__title">
            <span className="lp-sr">{SHOP.name}: </span>
            <span lang="en">{repair}</span> <span lang="en">{restore}</span> <span lang="en">{perform}</span>
          </h1>
          <p className="lp-hero__lead">{s.hero.lead}</p>
          <div className="lp-hero__ctas">
            {lines.map((line, i) => (
              <a
                key={line.id}
                className={i === 0 ? 'lp-call lp-call--primary' : 'lp-call'}
                href={telUrl(line.e164) ?? undefined}
              >
                <Phone className="lp-call__icon" aria-hidden="true" size={20} />
                <span className="lp-call__who" lang={line.id}>
                  <span className="lp-sr">{s.hero.callLabel} </span>
                  {fill(line.id === 'en' ? s.hero.callEnglish : s.hero.callSpanish, { person: line.person ?? '' })}
                </span>
                <span className="lp-call__number">{line.display}</span>
              </a>
            ))}
          </div>
          <p className="lp-hero__meta">
            <a href={SHOP.links.google} target="_blank" rel="noopener noreferrer">
              <Star aria-hidden="true" size={16} fill="currentColor" />
              {fill(s.hero.rating, { rating: SHOP.googleRating })}
            </a>
            <span className={open ? 'lp-status is-open' : 'lp-status'}>
              <span className="lp-status__dot" aria-hidden="true" />
              {statusText}
            </span>
          </p>
        </div>
      </div>

      <div className="lp-hero__photo">
        <div className="lp-hero__clip">
          <HeroVideo />
        </div>
        {/* El chevrón de la tarjeta: la línea dorada que sigue el corte de la foto. En escritorio la
            video va a la derecha y el chevrón apunta a la izquierda, como en la tarjeta; en el
            teléfono va arriba y apunta hacia abajo. */}
        <svg className="lp-hero__chevron lp-hero__chevron--side" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="100,0 0,50 100,100" vectorEffect="non-scaling-stroke" />
        </svg>
        <svg className="lp-hero__chevron lp-hero__chevron--down" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline points="0,0 50,100 100,0" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      <div className="lp-wrap">
        <p className="lp-band">
          <ShieldCheck className="lp-band__icon" aria-hidden="true" size={26} strokeWidth={1.75} />
          <span>
            {s.hero.insuranceBefore} <strong>{s.hero.insuranceAll}</strong> {s.hero.insuranceAfter}
          </span>
        </p>
      </div>
    </section>
  );
}
