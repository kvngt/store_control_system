import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface CollapsibleSectionProps {
  title: string;
  icon?: ReactNode;
  /** Un dato corto a la derecha del título (cuántas fotos, el total…), para saber
   *  qué hay adentro sin abrirla. */
  summary?: ReactNode;
  /**
   * Abierta o cerrada desde afuera. El detalle de la orden guarda qué secciones están abiertas
   * para "Desplegar todo" y para abrir la que pide un enlace. Sin esto, la sección se maneja sola.
   */
  open?: boolean;
  onToggle?: () => void;
  /** Solo sin `open`: cómo arranca. */
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * Una sección plegable: un encabezado con título, resumen y flecha, y el contenido abajo.
 *
 * Nació para el teléfono (`MobileSection`): el detalle de una orden apila una docena de
 * tarjetas y había que desplazarse por todas para llegar a la que se buscaba. Desde el
 * 04/10/2026 también en escritorio y cerrada al entrar, dentro de cada pestaña: el taller
 * pidió ver primero los títulos y abrir solo lo que necesita.
 *
 * La tarjeta de adentro pierde su marco y su título (`.collapsible-section-body` en
 * `components.css`), porque el encabezado ya los pone. El contenido se esconde con
 * `hidden` en vez de desmontarse: plegar una sección no debe borrar una línea a
 * medio escribir ni la firma que se estaba trazando. Si la tarjeta no pinta nada
 * (el presupuesto vacío, la comisión de quien no está asignado), la sección
 * entera desaparece por CSS.
 */
export default function CollapsibleSection({
  title,
  icon,
  summary,
  open: controlledOpen,
  onToggle,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const bodyId = useId();
  const open = controlledOpen ?? ownOpen;
  const toggle = onToggle ?? (() => setOwnOpen((o) => !o));

  return (
    <section className={`card collapsible-section${open ? ' open' : ''}`}>
      <button
        type="button"
        className="collapsible-section-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={toggle}
      >
        {icon && <span className="collapsible-section-icon">{icon}</span>}
        <span className="collapsible-section-title">{title}</span>
        {summary != null && summary !== '' && <span className="collapsible-section-summary">{summary}</span>}
        <ChevronDown size={18} className="collapsible-section-chevron" aria-hidden />
      </button>
      <div id={bodyId} className="collapsible-section-body" hidden={!open}>
        {children}
      </div>
    </section>
  );
}
