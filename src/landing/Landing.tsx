import { useEffect, useRef, useState } from 'react';
import { LogIn, MapPin, Menu, MessageCircle, Phone, X } from 'lucide-react';
import logoUrl from './assets/restorify-logo-light.webp';
import { directionsUrl, shopLine, SHOP } from './business';
import { shopStatusAt, statusLabel } from './hours';
import ColorStudio from './sections/ColorStudio';
import Hero from './sections/Hero';
import Insurance from './sections/Insurance';
import PortalDemo from './sections/PortalDemo';
import Reviews from './sections/Reviews';
import Services from './sections/Services';
import Visit from './sections/Visit';
import Work from './sections/Work';
import { initialLandingLanguage, landingStrings, saveLandingLanguage, type LandingLanguage } from './strings';
import { telUrl, whatsAppUrl } from '../lib/phone';

const LANGUAGES: Array<{ code: LandingLanguage; name: string }> = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
];

/** La página de inicio de restorifyauto.net, para los clientes del taller. */
export default function Landing() {
  const [language, setLanguage] = useState<LandingLanguage>(initialLandingLanguage);
  const [now, setNow] = useState(() => new Date());
  const [menuOpen, setMenuOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const s = landingStrings[language];

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = s.metaTitle;
  }, [language, s.metaTitle]);

  // "Abierto · hasta las 6 p. m." se pone al día solo.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  // El menú del teléfono se cierra con Escape (el foco vuelve a su botón) y al tocar fuera de él.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    };
    const onPointer = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [menuOpen]);

  // La sección a la vista se marca en el menú; la barra del teléfono se esconde mientras se ven los
  // botones de llamar de la portada (no repite lo que ya está a la vista).
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>('main section[id]'));
    const spy = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setCurrent(entry.target.id);
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    sections.forEach((section) => spy.observe(section));
    const ctas = root.querySelector('.lp-hero__ctas');
    const bar = new IntersectionObserver(([entry]) => root.toggleAttribute('data-bar-hidden', entry.isIntersecting));
    if (ctas) bar.observe(ctas);
    return () => {
      spy.disconnect();
      bar.disconnect();
    };
  }, []);

  const chooseLanguage = (next: LandingLanguage) => {
    setLanguage(next);
    saveLandingLanguage(next);
  };

  const status = shopStatusAt(now);
  const statusText = statusLabel(status, language);
  // La línea que atiende en el idioma de quien lee: la de "Escríbanos" y la de WhatsApp de la barra.
  const mainLine = shopLine(language);
  const messageHref = whatsAppUrl(mainLine.e164, s.visit.whatsappMessage);

  const links = [
    { id: 'trabajos', label: s.nav.work },
    { id: 'servicios', label: s.nav.services },
    { id: 'seguros', label: s.nav.insurance },
    { id: 'estudio', label: s.nav.studio },
    { id: 'en-linea', label: s.nav.online, menuOnly: true },
    { id: 'visitenos', label: s.nav.visit },
  ];

  return (
    <div className="lp" ref={rootRef}>
      <a className="lp-skip" href="#lp-main">
        {s.skipToContent}
      </a>

      <header className="lp-header" ref={headerRef}>
        <div className="lp-wrap lp-header__inner">
          <a className="lp-header__logo" href="#lp-top">
            <img src={logoUrl} alt={SHOP.name} width={480} height={155} />
          </a>
          <nav className="lp-nav" aria-label={s.nav.label}>
            {links
              .filter((link) => !link.menuOnly)
              .map((link) => (
                <a key={link.id} href={`#${link.id}`} aria-current={current === link.id ? 'location' : undefined}>
                  {link.label}
                </a>
              ))}
          </nav>
          <div className="lp-header__actions">
            <div className="lp-lang" role="group" aria-label={s.nav.languageLabel}>
              {LANGUAGES.map(({ code, name }) => (
                <button key={code} type="button" lang={code} aria-pressed={language === code} onClick={() => chooseLanguage(code)}>
                  {code.toUpperCase()}
                  <span className="lp-sr"> {name}</span>
                </button>
              ))}
            </div>
            <a className="lp-staff" href="/login" title={s.nav.staff}>
              <LogIn aria-hidden="true" size={17} />
              <span className="lp-sr">{s.nav.staff}</span>
            </a>
            <a className="lp-btn lp-btn--gold lp-btn--sm lp-header__cta" href={messageHref} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden="true" size={18} />
              {s.nav.message}
            </a>
            <button
              ref={menuButtonRef}
              type="button"
              className="lp-menu-button"
              aria-expanded={menuOpen}
              aria-controls="lp-menu"
              aria-label={menuOpen ? s.nav.close : s.nav.menu}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
            </button>
          </div>
        </div>
        <div
          id="lp-menu"
          className="lp-menu"
          hidden={!menuOpen}
          onBlur={(event) => {
            // Si el foco sale del menú y de su botón (siguiendo con Tab), el menú se cierra.
            if (!headerRef.current?.contains(event.relatedTarget as Node | null)) setMenuOpen(false);
          }}
        >
          <nav className="lp-wrap" aria-label={s.nav.label}>
            {links.map((link) => (
              <a key={link.id} href={`#${link.id}`} onClick={() => setMenuOpen(false)}>
                {link.label}
              </a>
            ))}
            <a className="lp-btn lp-btn--gold" href={messageHref} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden="true" size={18} />
              {s.nav.message}
            </a>
            <a className="lp-menu__staff" href="/login">
              <LogIn aria-hidden="true" size={16} />
              {s.nav.staff}
            </a>
          </nav>
        </div>
      </header>

      <main id="lp-main" tabIndex={-1}>
        <Hero s={s} language={language} statusText={statusText} open={status.open} />
        <Work s={s} />
        <Services s={s} language={language} />
        <Insurance s={s} language={language} />
        <ColorStudio s={s} language={language} />
        <PortalDemo s={s} />
        <Reviews s={s} language={language} />
        <Visit s={s} language={language} statusText={statusText} open={status.open} />
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer__inner">
          <img className="lp-footer__logo" src={logoUrl} alt={SHOP.name} width={480} height={155} loading="lazy" />
          <p className="lp-footer__rights">
            © {now.getFullYear()} {s.footer.rights}
          </p>
          <nav className="lp-footer__links" aria-label={s.footer.label}>
            <a href="/privacidad">{s.footer.privacy}</a>
            <a href="/login">
              <LogIn aria-hidden="true" size={15} />
              {s.footer.staff}
            </a>
          </nav>
          <p className="lp-footer__credit">
            {s.footer.credit}{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">
              {s.footer.license}
            </a>
            {' · '}
            <a href="https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept" target="_blank" rel="noopener noreferrer">
              {s.footer.source}
            </a>
          </p>
        </div>
      </footer>

      <nav className="lp-bar" aria-label={s.bar.label}>
        <a href={telUrl(shopLine('en').e164) ?? undefined}>
          <Phone aria-hidden="true" size={19} />
          <span className="lp-sr">{s.bar.call} · </span>
          <span lang="en">{s.bar.english}</span>
        </a>
        <a href={telUrl(shopLine('es').e164) ?? undefined}>
          <Phone aria-hidden="true" size={19} />
          <span className="lp-sr">{s.bar.call} · </span>
          <span lang="es">{s.bar.spanish}</span>
        </a>
        <a className="lp-bar__gold" href={messageHref} target="_blank" rel="noopener noreferrer">
          <MessageCircle aria-hidden="true" size={19} />
          {s.bar.whatsapp}
        </a>
        <a href={directionsUrl()} target="_blank" rel="noopener noreferrer">
          <MapPin aria-hidden="true" size={19} />
          {s.bar.map}
        </a>
      </nav>
    </div>
  );
}
