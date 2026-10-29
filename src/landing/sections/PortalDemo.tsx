import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Camera, Check, ClipboardCheck, Gauge, Images, Mic, PenLine, Play, QrCode, Video } from 'lucide-react';
import darkLogoUrl from '../../assets/restorify-logo.webp';
import booth800 from '../assets/work/cabina-800.webp';
import primer from '../assets/work/charger-enmascarado.webp';
import evo from '../assets/work/evo-recepcion.webp';
import qrUrl from '../assets/qr-sitio.svg';
import type { LandingStrings } from '../strings';
import { money } from '../../lib/money';

const TAB_ICONS = [Camera, Images, ClipboardCheck, QrCode];

/** Las ondas de la nota de voz: alturas fijas, para que la maqueta no cambie en cada render. */
const WAVE = [5, 9, 14, 8, 17, 12, 6, 15, 19, 10, 7, 13, 18, 9, 5, 11, 16, 8, 12, 6, 14, 9];

/**
 * El enlace del cliente, en un teléfono de ejemplo que cambia según la pestaña. Imita el portal real
 * (claro, con sus mismas palabras), con datos inventados de una orden de muestra, y lo dice.
 *
 * Las pestañas avanzan solas solo mientras la sección se ve y nadie la toca: con el puntero encima se
 * pausan, y en cuanto alguien toca, hace clic o llega con el teclado, se detienen para siempre
 * (WCAG 2.2.2). Con "reducir movimiento" nunca avanzan. El avance lo marca la barra de la pestaña:
 * al terminar su animación pasa a la siguiente, así barra y cambio nunca se desfasan.
 */
export default function PortalDemo({ s }: { s: LandingStrings }) {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const [stopped, setStopped] = useState(
    () => typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false),
  );
  const [lineChecked, setLineChecked] = useState([true, true, false]);
  const [authorized, setAuthorized] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const m = s.online.mock;
  const count = s.online.tabs.length;
  const auto = visible && !paused && !stopped;

  useEffect(() => {
    const section = sectionRef.current;
    if (!section || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.35 });
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  const choose = (index: number, focus = false) => {
    setStopped(true);
    setActive(index);
    if (focus) tabRefs.current[index]?.focus();
  };

  // Las flechas mueven entre pestañas, como en cualquier lista de pestañas.
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? (index + 1) % count
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? (index - 1 + count) % count
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? count - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    choose(next, true);
  };

  const lines = [
    { name: m.line1, amount: 480 },
    { name: m.line2, amount: 250 },
    { name: m.line3, amount: 90 },
  ];
  const total = lines.reduce((sum, line, i) => (lineChecked[i] ? sum + line.amount : sum), 0);

  return (
    <section
      ref={sectionRef}
      id="en-linea"
      className="lp-section lp-carbon lp-online"
      aria-labelledby="lp-online-title"
      onPointerEnter={(event) => event.pointerType === 'mouse' && setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onPointerDown={() => setStopped(true)}
      onFocusCapture={() => setStopped(true)}
    >
      <div className="lp-wrap lp-online__inner">
        <div className="lp-online__copy">
          <h2 id="lp-online-title" className="lp-h2">
            {s.online.title}
          </h2>
          <p className="lp-lead">{s.online.text}</p>
        </div>

        <div className="lp-online__tabs">
          <div className="lp-tabs" role="tablist" aria-label={s.online.tabsLabel}>
            {s.online.tabs.map((tab, i) => {
              const Icon = TAB_ICONS[i];
              const selected = i === active;
              return (
                <button
                  key={tab.name}
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  id={`lp-tab-${i}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="lp-portal-screen"
                  tabIndex={selected ? 0 : -1}
                  className={selected ? 'lp-tab is-active' : 'lp-tab'}
                  onClick={() => choose(i)}
                  onKeyDown={(event) => onKeyDown(event, i)}
                >
                  <span className="lp-tab__icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <span>
                    <span className="lp-tab__name">{tab.name}</span>
                    <span className="lp-tab__text">{tab.text}</span>
                  </span>
                  {selected && auto && (
                    <span
                      className="lp-tab__progress"
                      aria-hidden="true"
                      onAnimationEnd={() => setActive((current) => (current + 1) % count)}
                    />
                  )}
                </button>
              );
            })}
          </div>
          {/* En el teléfono las pestañas solo muestran el nombre: la descripción va debajo. */}
          <p className="lp-tabs__desc">{s.online.tabs[active].text}</p>
        </div>

        <figure className="lp-device">
          <span className="lp-device__label">{s.online.live}</span>
          <div className="lp-device__frame">
            <div id="lp-portal-screen" role="tabpanel" aria-labelledby={`lp-tab-${active}`} className="lp-screen" key={active}>
              <div className="lp-screen__status" aria-hidden="true">
                <span>9:41</span>
                <span className="lp-screen__icons">
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <div className="lp-screen__top">
                <img src={darkLogoUrl} alt="" width={900} height={290} loading="lazy" />
                <div className="lp-screen__order">
                  <strong>{m.order}</strong>
                  <span className={active === 2 && !authorized ? 'lp-chip-status is-waiting' : 'lp-chip-status'}>
                    {active === 0 ? m.received : active === 2 && !authorized ? m.waiting : m.inProgress}
                  </span>
                </div>
              </div>

              {active === 0 && (
                <div className="lp-screen__body">
                  <p className="lp-screen__muted">{m.receivedOn}</p>
                  <div className="lp-screen__photos">
                    <span className="lp-thumb" style={{ backgroundImage: `url(${evo})`, backgroundPosition: '50% 55%', backgroundSize: 'cover' }}>
                      <span className="lp-thumb__play">
                        <Play size={14} fill="currentColor" />
                      </span>
                      <span className="lp-thumb__label">
                        <Video size={12} /> {m.video}
                      </span>
                    </span>
                    <span className="lp-thumb" style={{ backgroundImage: `url(${evo})`, backgroundPosition: '82% 62%' }} />
                    <span className="lp-thumb" style={{ backgroundImage: `url(${evo})`, backgroundPosition: '48% 70%' }} />
                    <span className="lp-thumb" style={{ backgroundImage: `url(${evo})`, backgroundPosition: '10% 40%' }} />
                  </div>
                  <p className="lp-screen__row">
                    <Camera size={16} /> {m.photos}
                  </p>
                  <p className="lp-screen__row">
                    <Gauge size={16} /> {m.mileage}: {m.mileageValue} · {m.fuel}: ¾
                  </p>
                  <p className="lp-screen__row is-ok">
                    <PenLine size={16} /> {m.signed}
                  </p>
                </div>
              )}

              {active === 1 && (
                <div className="lp-screen__body">
                  <div className="lp-screen__progress">
                    <span>{m.progress}</span>
                    <span className="lp-screen__track">
                      <span style={{ width: '65%' }} />
                    </span>
                    <span>65%</span>
                  </div>
                  <div className="lp-screen__update">
                    <span className="lp-thumb lp-thumb--sm" style={{ backgroundImage: `url(${primer})`, backgroundPosition: '50% 60%' }} />
                    <span>
                      <span className="lp-screen__muted">{m.update1When}</span>
                      {m.update1}
                    </span>
                  </div>
                  <div className="lp-voice">
                    <span className="lp-voice__play">
                      <Play size={14} fill="currentColor" />
                    </span>
                    <span className="lp-voice__wave" aria-hidden="true">
                      {WAVE.map((h, i) => (
                        <i key={i} style={{ height: `${h}px`, animationDelay: `${i * 60}ms` }} />
                      ))}
                    </span>
                    <span className="lp-voice__time">0:18</span>
                  </div>
                  <p className="lp-screen__row">
                    <Mic size={16} /> {m.voice}
                  </p>
                  <div className="lp-screen__update">
                    <span className="lp-thumb lp-thumb--sm" style={{ backgroundImage: `url(${booth800})`, backgroundPosition: '55% 60%' }} />
                    <span>
                      <span className="lp-screen__muted">{m.update2When}</span>
                      {m.update2}
                    </span>
                  </div>
                </div>
              )}

              {active === 2 && (
                <div className="lp-screen__body">
                  <p className="lp-screen__heading">{m.quoteTitle}</p>
                  <ul className="lp-quote">
                    {lines.map((line, i) => (
                      <li key={line.name}>
                        <label className="lp-quote__line">
                          <input
                            type="checkbox"
                            checked={lineChecked[i]}
                            disabled={authorized}
                            onChange={(event) => {
                              const next = [...lineChecked];
                              next[i] = event.target.checked;
                              setLineChecked(next);
                            }}
                          />
                          <span className="lp-quote__name">{line.name}</span>
                          <span className="lp-quote__amount">{money(line.amount)}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <p className="lp-quote__total" aria-live="polite">
                    <span>{m.total}</span>
                    <strong>{money(total)}</strong>
                  </p>
                  {/* Se queda en su lugar (aria-disabled, no disabled) para que el foco no se pierda. */}
                  <button
                    type="button"
                    className="lp-quote__authorize"
                    aria-disabled={authorized}
                    onClick={() => setAuthorized(true)}
                  >
                    {m.authorize}
                  </button>
                  <p className="lp-quote__done" role="status">
                    {authorized && (
                      <>
                        <Check size={16} aria-hidden="true" /> {m.authorized}
                      </>
                    )}
                  </p>
                </div>
              )}

              {active === 3 && (
                <div className="lp-screen__body">
                  <div className="lp-sticker">
                    <img className="lp-sticker__logo" src={darkLogoUrl} alt="" width={900} height={290} loading="lazy" />
                    <p className="lp-sticker__title">{m.stickerTitle}</p>
                    <p className="lp-sticker__date">{m.stickerDate}</p>
                    <p className="lp-sticker__miles">{m.stickerMiles}</p>
                    <img className="lp-sticker__qr" src={qrUrl} alt="" width={120} height={120} loading="lazy" />
                    <p className="lp-sticker__scan">{m.stickerScan}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <figcaption className="lp-sr">{s.online.mockLabel}</figcaption>
        </figure>
      </div>
    </section>
  );
}
