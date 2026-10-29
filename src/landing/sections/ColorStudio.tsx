import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { MessageCircle, MoveHorizontal } from 'lucide-react';
import carUrl from '../assets/restorify-car.glb?url';
import posterUrl from '../assets/studio-poster.webp';
import { shopLine } from '../business';
import type { LandingLanguage, LandingStrings } from '../strings';
import type { ColorStudio as Studio } from '../studio/colorStudio';
import { FINISH_ORDER, PAINT_COLORS, type Finish } from '../studio/palette';
import { whatsAppUrl } from '../../lib/phone';

/** `poster`: la imagen fija (antes de cargar o sin WebGL). `live`: el carro en 3D. */
type Mode = 'poster' | 'loading' | 'live' | 'unavailable';

/** El 3D solo con WebGL 2 y sin el ahorro de datos del teléfono. */
function canRender3D(): boolean {
  try {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return false;
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '');

/** Las flechas mueven la selección dentro de un grupo de opciones, como en un grupo de radios. */
function arrowStep(event: KeyboardEvent, index: number, count: number): number {
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') return (index + 1) % count;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') return (index - 1 + count) % count;
  if (event.key === 'Home') return 0;
  if (event.key === 'End') return count - 1;
  return -1;
}

/**
 * El estudio de color, como los visualizadores de los fabricantes de vinil: la persona elige color y
 * acabado, gira el carro y manda lo elegido por WhatsApp. three.js y el modelo se descargan solo
 * cuando la sección está por verse.
 */
export default function ColorStudio({ s, language }: { s: LandingStrings; language: LandingLanguage }) {
  const [colorIndex, setColorIndex] = useState(0);
  const [finish, setFinish] = useState<Finish>('metallic');
  const [mode, setMode] = useState<Mode>('poster');
  const [touched, setTouched] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const studioRef = useRef<Studio | null>(null);
  const colorRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const finishRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const paintRef = useRef({ hex: PAINT_COLORS[0].hex, finish: 'metallic' as Finish });

  const color = PAINT_COLORS[colorIndex];
  paintRef.current = { hex: color.hex, finish };

  useEffect(() => {
    studioRef.current?.setPaint(color.hex, finish);
  }, [color.hex, finish]);

  // Se carga al acercarse a la sección, una sola vez.
  useEffect(() => {
    const section = sectionRef.current;
    const host = hostRef.current;
    if (!section || !host || typeof IntersectionObserver === 'undefined') return;
    if (!canRender3D()) {
      setMode('unavailable');
      return;
    }
    let cancelled = false;
    let canvas: HTMLCanvasElement | null = null;
    let visible = false;
    const syncActive = () => studioRef.current?.setActive(visible && !document.hidden);
    const release = () => {
      studioRef.current?.dispose();
      studioRef.current = null;
    };
    const fallBack = () => {
      if (cancelled) return;
      release();
      setMode('unavailable');
    };

    const load = () => {
      setMode('loading');
      canvas = document.createElement('canvas');
      host.appendChild(canvas);
      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      import('../studio/colorStudio')
        .then(({ createColorStudio }) =>
          createColorStudio({
            canvas: canvas!,
            modelUrl: carUrl,
            initialColor: paintRef.current.hex,
            initialFinish: paintRef.current.finish,
            autoRotate: !reduced,
            onInteract: () => setTouched(true),
            onLost: fallBack,
          }),
        )
        .then((studio) => {
          if (cancelled) {
            studio.dispose();
            return;
          }
          studioRef.current = studio;
          studio.setPaint(paintRef.current.hex, paintRef.current.finish);
          syncActive();
          setMode('live');
        })
        .catch(fallBack);
    };

    let started = false;
    const near = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started) return;
        started = true;
        near.disconnect();
        load();
      },
      { rootMargin: '700px 0px' },
    );
    near.observe(section);

    const seen = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncActive();
    });
    seen.observe(section);
    document.addEventListener('visibilitychange', syncActive);
    const resizeObserver = new ResizeObserver(() => studioRef.current?.resize());
    resizeObserver.observe(host);

    return () => {
      cancelled = true;
      near.disconnect();
      seen.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', syncActive);
      release();
      canvas?.remove();
    };
  }, []);

  const finishName = s.studio.finishes[finish];
  const colorName = color.name[language];
  const ctaHref = whatsAppUrl(shopLine(language).e164, fill(s.studio.ctaMessage, { color: colorName, finish: finishName }));

  const chooseColor = (index: number, focus = false) => {
    setColorIndex(index);
    if (focus) colorRefs.current[index]?.focus();
  };
  const chooseFinish = (index: number, focus = false) => {
    setFinish(FINISH_ORDER[index]);
    if (focus) finishRefs.current[index]?.focus();
  };

  return (
    <section ref={sectionRef} id="estudio" className="lp-section lp-carbon lp-studio" aria-labelledby="lp-studio-title">
      <div className="lp-wrap lp-studio__inner">
        <div className="lp-studio__head">
          <h2 id="lp-studio-title" className="lp-h2">
            {s.studio.title}
          </h2>
          <p className="lp-lead">{s.studio.text}</p>
        </div>

        <div className="lp-studio__controls">
          <p className="lp-studio__label" id="lp-studio-colors">
            {s.studio.colorsLabel}: <strong>{colorName}</strong>
          </p>
          <div className="lp-swatches" role="radiogroup" aria-labelledby="lp-studio-colors">
            {PAINT_COLORS.map((paint, i) => (
              <button
                key={paint.id}
                ref={(el) => {
                  colorRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={i === colorIndex}
                aria-label={paint.name[language]}
                tabIndex={i === colorIndex ? 0 : -1}
                className="lp-swatch"
                style={{ ['--swatch' as string]: paint.hex }}
                onClick={() => chooseColor(i)}
                onKeyDown={(event) => {
                  const next = arrowStep(event, i, PAINT_COLORS.length);
                  if (next < 0) return;
                  event.preventDefault();
                  chooseColor(next, true);
                }}
              />
            ))}
          </div>

          <p className="lp-studio__label" id="lp-studio-finish">
            {s.studio.finishLabel}
          </p>
          <div className="lp-finishes" role="radiogroup" aria-labelledby="lp-studio-finish">
            {FINISH_ORDER.map((option, i) => (
              <button
                key={option}
                ref={(el) => {
                  finishRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={option === finish}
                tabIndex={option === finish ? 0 : -1}
                className="lp-finish-option"
                onClick={() => chooseFinish(i)}
                onKeyDown={(event) => {
                  const next = arrowStep(event, i, FINISH_ORDER.length);
                  if (next < 0) return;
                  event.preventDefault();
                  chooseFinish(next, true);
                }}
              >
                {s.studio.finishes[option]}
              </button>
            ))}
          </div>

          <a className="lp-btn lp-btn--gold lp-studio__cta" href={ctaHref} target="_blank" rel="noopener noreferrer">
            <MessageCircle aria-hidden="true" size={18} />
            {s.studio.cta}
          </a>
          <p className="lp-note">{mode === 'unavailable' ? s.studio.fallback : s.studio.note}</p>
        </div>

        <div className="lp-stage" data-mode={mode}>
          <img
            className="lp-stage__poster"
            src={posterUrl}
            alt=""
            width={1200}
            height={827}
            loading="lazy"
            decoding="async"
          />
          <div
            ref={hostRef}
            className="lp-stage__canvas"
            role="img"
            aria-label={fill(s.studio.canvasLabel, { color: colorName, finish: finishName })}
          />
          {mode === 'loading' && (
            <p className="lp-stage__loading" role="status">
              <span className="lp-stage__spinner" aria-hidden="true" />
              {s.studio.loading}
            </p>
          )}
          {mode === 'live' && !touched && (
            <p className="lp-stage__hint" aria-hidden="true">
              <MoveHorizontal size={16} />
              {s.studio.drag}
            </p>
          )}
          <p className="lp-stage__chip" aria-hidden="true">
            <span className="lp-stage__dot" style={{ background: color.hex }} />
            {colorName} · {finishName}
          </p>
        </div>
      </div>
    </section>
  );
}
