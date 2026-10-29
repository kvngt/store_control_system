import { Star } from 'lucide-react';
import { REVIEW, SHOP } from '../business';
import type { LandingLanguage, LandingStrings } from '../strings';

/**
 * La calificación en Google y la reseña que el taller ya muestra en su perfil. Nada inventado. En
 * español va la traducción en grande, avisando que es traducción, y la original debajo.
 */
export default function Reviews({ s, language }: { s: LandingStrings; language: LandingLanguage }) {
  const translated = language === 'es';
  return (
    <section className="lp-section lp-light lp-reviews" aria-labelledby="lp-reviews-title">
      <div className="lp-wrap lp-reviews__inner">
        <h2 className="lp-sr" id="lp-reviews-title">
          {s.reviews.title}
        </h2>
        <figure className="lp-reviews__quote">
          <blockquote lang={translated ? 'es' : 'en'}>
            <p>“{translated ? REVIEW.quoteEs : REVIEW.quote}”</p>
          </blockquote>
          {translated && (
            <p className="lp-reviews__original">
              {s.reviews.translatedNote}: <span lang="en">“{REVIEW.quote}”</span>
            </p>
          )}
          <figcaption>
            <strong>{REVIEW.author}</strong>
            <span>{s.reviews.source}</span>
          </figcaption>
        </figure>
        <a className="lp-reviews__score" href={SHOP.links.google} target="_blank" rel="noopener noreferrer">
          <span className="lp-reviews__number">{SHOP.googleRating}</span>
          <span className="lp-reviews__stars" aria-hidden="true">
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} size={18} fill="currentColor" strokeWidth={0} />
            ))}
          </span>
          <span className="lp-reviews__rating">{s.reviews.rating}</span>
          <span className="lp-reviews__all">{s.reviews.all}</span>
        </a>
      </div>
    </section>
  );
}
