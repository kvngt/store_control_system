import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { LifeBuoy, Search, X } from 'lucide-react';
import { useLanguage } from '../context/language.context';
import { useAuth } from '../context/auth.context';
import { useIsMobile } from '../lib/useMediaQuery';
import { helpRoleOf, prepareManual, searchSections, sectionHeadings, splitSections } from '../features/help/helpDoc';
import ManualContent from '../features/help/ManualContent';
// El manual vive en docs/ (es la misma fuente que se lee en el repositorio); aquí entra como texto.
import manualEs from '../../docs/manual-usuario.md?raw';
import manualEn from '../../docs/manual-usuario.en.md?raw';

/**
 * Ayuda: el manual de usuario dentro de la app, en el idioma elegido y con las secciones del rol
 * de quien entra (administración ve todo lo suyo; mecánicos y pintores, lo de técnico). Qué sección
 * es de qué rol lo dicen las marcas `<!-- rol: ... -->` del propio manual (ver `helpDoc.ts`).
 * No hay permisos aquí: esconder una sección del manual no es una regla, solo menos ruido.
 */
export default function Help() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const location = useLocation();
  const isMobile = useIsMobile();
  const role = helpRoleOf(user?.rol);
  const [query, setQuery] = useState('');

  const sections = useMemo(
    () => splitSections(prepareManual(language === 'en' ? manualEn : manualEs, role)),
    [language, role]
  );
  const visible = useMemo(() => searchSections(sections, query), [sections, query]);

  // Un enlace con #ancla (desde otra pantalla, compartido o del índice) abre la sección que fue
  // a ver. Las capturas cargan al acercarse y empujan el texto, así que durante unos segundos se
  // vuelve a llevar el título a la vista cada vez que el artículo cambia de alto — salvo que la
  // persona ya se haya movido por su cuenta.
  useEffect(() => {
    if (!location.hash) return;
    const id = decodeURIComponent(location.hash.slice(1));
    // 'instant': el sitio tiene `scroll-behavior: smooth`, y en un manual tan largo la animación
    // tarda segundos y se reinicia con cada imagen que carga.
    const ir = () => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'instant' });
    ir();
    const article = document.querySelector('.help-content');
    if (!article || typeof ResizeObserver === 'undefined') return;
    let seMovio = false;
    const soltar = () => { seMovio = true; };
    const opts = { passive: true } as const;
    window.addEventListener('wheel', soltar, opts);
    window.addEventListener('touchmove', soltar, opts);
    window.addEventListener('keydown', soltar);
    const ro = new ResizeObserver(() => { if (!seMovio) ir(); });
    ro.observe(article);
    const fin = window.setTimeout(() => ro.disconnect(), 4000);
    return () => {
      ro.disconnect();
      window.clearTimeout(fin);
      window.removeEventListener('wheel', soltar);
      window.removeEventListener('touchmove', soltar);
      window.removeEventListener('keydown', soltar);
    };
  }, [location.hash, sections]);

  const toc = (
    <nav aria-label={t('help.contents')}>
      <ul className="help-toc-list">
        {visible.flatMap((s) =>
          sectionHeadings(s).map((h, i) => (
            <li key={`${h.id}-${i}`} className={h.level === 3 ? 'help-toc-sub' : undefined}>
              <a href={`#${h.id}`}>{h.title}</a>
            </li>
          ))
        )}
      </ul>
    </nav>
  );

  return (
    <div className="help-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <LifeBuoy size={26} style={{ display: 'inline', marginRight: 'var(--space-2)', verticalAlign: 'middle' }} />
            {t('help.title')}
          </h1>
          <p className="page-subtitle">{role === 'admin' ? t('help.subtitleAdmin') : t('help.subtitleTech')}</p>
        </div>
      </div>

      <div className="help-search">
        <Search size={18} aria-hidden="true" />
        <input
          className="form-input"
          type="text"
          inputMode="search"
          enterKeyHint="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('help.search')}
          aria-label={t('help.search')}
        />
        {query && (
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setQuery('')} aria-label={t('help.clearSearch')}>
            <X size={16} />
          </button>
        )}
      </div>

      <div className="help-layout">
        <aside className="help-toc card">
          {/* En el teléfono el índice empieza cerrado, para que el manual quede a la vista. */}
          <details key={isMobile ? 'tel' : 'pc'} open={!isMobile} className="help-toc-details">
            <summary>{t('help.contents')}</summary>
            {toc}
          </details>
        </aside>

        <article className="help-content card">
          {visible.length === 0 ? (
            <p className="field-hint">{t('help.noResults')}</p>
          ) : (
            visible.map((s) => (
              <section key={s.heading.id} className="help-section">
                <ManualContent markdown={s.markdown} sectionId={s.heading.id} />
              </section>
            ))
          )}
        </article>
      </div>
    </div>
  );
}
