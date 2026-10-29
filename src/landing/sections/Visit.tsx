import { Fragment } from 'react';
import { Clock, Facebook, Instagram, Link2, Mail, MapPin, MessageCircle, MessageSquareText, Phone, type LucideIcon } from 'lucide-react';
import logoUrl from '../assets/restorify-logo-light.webp';
import mapUrl from '../assets/shop-map.svg';
import { directionsUrl, shopLine, SHOP, type LineId } from '../business';
import { hoursRows } from '../hours';
import type { LandingLanguage, LandingStrings } from '../strings';
import { canOpenSms, smsUrl, telUrl, whatsAppUrl } from '../../lib/phone';

const OSM_COPYRIGHT = 'https://www.openstreetmap.org/copyright';

interface VisitProps {
  s: LandingStrings;
  language: LandingLanguage;
  statusText: string;
  open: boolean;
}

/** El hexágono dorado de la tarjeta, con su ícono adentro. */
function HexIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="lp-hexicon" aria-hidden="true">
      <svg className="lp-hexicon__frame" viewBox="0 0 48 42">
        <polygon points="12.5,1.5 35.5,1.5 46.5,21 35.5,40.5 12.5,40.5 1.5,21" />
      </svg>
      <Icon size={18} aria-hidden />
    </span>
  );
}

/** Visítenos: la tarjeta de presentación del taller, con cada teléfono a un toque, el mapa y el horario. */
export default function Visit({ s, language, statusText, open }: VisitProps) {
  const sms = canOpenSms();
  // Como en la tarjeta, primero las dos personas y después la oficina; la del idioma de quien lee, arriba.
  const order: LineId[] = language === 'es' ? ['es', 'en', 'office'] : ['en', 'es', 'office'];

  return (
    <section id="visitenos" className="lp-section lp-visit" aria-labelledby="lp-visit-title">
      <div className="lp-wrap">
        <header className="lp-head">
          <h2 id="lp-visit-title" className="lp-h2">
            {s.visit.title}
          </h2>
        </header>

        <div className="lp-visit__grid">
          <article className="lp-bizcard" aria-label={s.visit.cardLabel}>
            <div className="lp-bizcard__brand">
              <img src={logoUrl} alt={SHOP.name} width={480} height={155} loading="lazy" />
              <p className="lp-lockup" lang="en">
                {/* Espacio duro antes de cada viñeta: si no cabe en un renglón, la viñeta se queda
                    con la palabra de antes y el renglón nuevo no empieza con «•». */}
                Repair{' '}<span aria-hidden="true">•</span> Restore{' '}<span aria-hidden="true">•</span> Perform
              </p>
            </div>

            <ul className="lp-lines">
              <li className="lp-line">
                <HexIcon icon={MapPin} />
                <div className="lp-line__body">
                  <span className="lp-sr">{s.visit.address}: </span>
                  <address className="lp-line__address">
                    {SHOP.streetLines.map((line) => (
                      <Fragment key={line}>
                        {line}
                        <br />
                      </Fragment>
                    ))}
                    {SHOP.city}, {SHOP.region} {SHOP.postalCode}
                  </address>
                  <span className="lp-line__actions">
                    <a className="lp-chip lp-chip--gold" href={directionsUrl()} target="_blank" rel="noopener noreferrer">
                      <MapPin aria-hidden="true" size={15} />
                      {s.visit.directions}
                    </a>
                  </span>
                </div>
              </li>

              {order.map((id) => {
                const line = shopLine(id);
                const label = s.visit.lines[id];
                const who = line.person ? `${line.person}, ${label}` : label;
                return (
                  <li key={id} className="lp-line">
                    <HexIcon icon={Phone} />
                    <div className="lp-line__body">
                      <p className="lp-line__main">
                        <span className="lp-line__name" lang={id === 'office' ? undefined : id}>
                          {line.person ?? label}
                          {line.person && <span className="lp-line__lang"> · {label}</span>}
                        </span>
                        <a className="lp-line__number" href={telUrl(line.e164) ?? undefined} aria-label={`${s.visit.call}: ${who}, ${line.display}`}>
                          {line.display}
                        </a>
                      </p>
                      <span className="lp-line__actions">
                        {line.whatsapp && (
                          <a
                            className="lp-chip lp-chip--gold"
                            href={whatsAppUrl(line.e164, s.visit.whatsappMessage)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${s.visit.whatsapp}: ${who}, ${line.display}`}
                          >
                            <MessageCircle aria-hidden="true" size={15} />
                            {s.visit.whatsapp}
                          </a>
                        )}
                        {line.whatsapp && sms && (
                          <a className="lp-chip" href={smsUrl(line.e164, s.visit.whatsappMessage)} aria-label={`${s.visit.text}: ${who}, ${line.display}`}>
                            <MessageSquareText aria-hidden="true" size={15} />
                            {s.visit.text}
                          </a>
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}

              <li className="lp-line">
                <HexIcon icon={Mail} />
                <div className="lp-line__body">
                  <span className="lp-sr">{s.visit.email}: </span>
                  <a className="lp-line__number lp-line__email" href={`mailto:${SHOP.email}`}>
                    {/* Si no cabe, baja en la arroba y no a mitad de palabra. */}
                    {SHOP.email.split('@')[0]}
                    <wbr />@{SHOP.email.split('@')[1]}
                  </a>
                </div>
              </li>
            </ul>

            <div className="lp-bizcard__social">
              <p className="lp-sr">{s.visit.followTitle}</p>
              <ul className="lp-social">
                <li>
                  <a href={SHOP.links.instagram} target="_blank" rel="noopener noreferrer">
                    <Instagram aria-hidden="true" size={18} />
                    @restorifyauto
                  </a>
                </li>
                <li>
                  <a href={SHOP.links.facebook} target="_blank" rel="noopener noreferrer">
                    <Facebook aria-hidden="true" size={18} />
                    Facebook
                  </a>
                </li>
                <li>
                  <a href={SHOP.links.beacons} target="_blank" rel="noopener noreferrer">
                    <Link2 aria-hidden="true" size={18} />
                    {s.visit.beacons}
                  </a>
                </li>
              </ul>
            </div>
          </article>

          <div className="lp-visit__place">
            {/* Un mapa propio en vez de Google Maps incrustado: no carga nada de terceros. */}
            <figure className="lp-map">
              <a href={directionsUrl()} target="_blank" rel="noopener noreferrer" aria-label={s.visit.mapLink}>
                <img src={mapUrl} alt="" width={640} height={440} loading="lazy" decoding="async" />
              </a>
              <figcaption>
                <a href={OSM_COPYRIGHT} target="_blank" rel="noopener noreferrer">
                  {s.visit.mapCredit}
                </a>
              </figcaption>
            </figure>

            <div className="lp-hours-card">
              <h3 className="lp-h3">
                <Clock aria-hidden="true" size={18} />
                {s.visit.hoursTitle}
              </h3>
              <p className={open ? 'lp-status is-open' : 'lp-status'}>
                <span className="lp-status__dot" aria-hidden="true" />
                {statusText}
              </p>
              <dl className="lp-hours">
                {hoursRows(s.visit, language).map((row) => (
                  <div key={row.days}>
                    <dt>{row.days}</dt>
                    <dd>{row.time}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
