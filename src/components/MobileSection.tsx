import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { useIsMobile } from '../lib/useMediaQuery';

interface MobileSectionProps {
  title: string;
  icon?: ReactNode;
  /** Un dato corto a la derecha del título (cuántas fotos, el total…), para saber
   *  qué hay adentro sin abrirla. */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * En el teléfono, una sección plegable: el detalle de una orden apila una docena de
 * tarjetas y había que desplazarse por todas para llegar a la que se buscaba. En
 * escritorio no hace nada y deja la tarjeta tal cual.
 *
 * La tarjeta de adentro pierde su marco y su título (`.mobile-section-body` en
 * `components.css`), porque el encabezado ya los pone. El contenido se esconde con
 * `hidden` en vez de desmontarse: plegar una sección no debe borrar una línea a
 * medio escribir ni la firma que se estaba trazando. Si la tarjeta no pinta nada
 * (el presupuesto vacío, la comisión de quien no está asignado), la sección
 * entera desaparece por CSS.
 */
export default function MobileSection({ title, icon, summary, defaultOpen = false, children }: MobileSectionProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  if (!isMobile) return <>{children}</>;

  return (
    <section className={`card mobile-section${open ? ' open' : ''}`}>
      <button
        type="button"
        className="mobile-section-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
      >
        {icon && <span className="mobile-section-icon">{icon}</span>}
        <span className="mobile-section-title">{title}</span>
        {summary != null && summary !== '' && <span className="mobile-section-summary">{summary}</span>}
        <ChevronDown size={18} className="mobile-section-chevron" aria-hidden />
      </button>
      <div id={bodyId} className="mobile-section-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
