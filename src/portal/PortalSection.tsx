import { useState, type MouseEvent, type ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';

export interface PortalSectionProps {
  id?: string;
  icon?: LucideIcon;
  title: ReactNode;
  /** Lo que se ve con la sección cerrada, al lado del título (el saldo, cuántas fotos). */
  summary?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  testId?: string;
  children: ReactNode;
}

/**
 * Una tarjeta del enlace del cliente que se pliega (pedido del taller, 16/10/2026: el reporte
 * se veía demasiado largo). Es un `<details>` para que el teclado y los lectores de pantalla lo
 * entiendan solos, pero quien decide si está abierto es el estado: el clic del título se
 * cancela y cambia el estado, así el navegador no lo abre y cierra dos veces.
 */
export function PortalSection({ id, icon: Icon, title, summary, defaultOpen = false, className = '', testId, children }: PortalSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  const toggle = (e: MouseEvent) => {
    e.preventDefault();
    setOpen((prev) => !prev);
  };

  return (
    <details id={id} className={`portal-card portal-collapsible ${className}`.trim()} open={open} data-testid={testId}>
      <summary className="portal-collapsible-summary" onClick={toggle}>
        <h2 className="portal-section-title">
          {Icon && <Icon size={18} />} {title}
        </h2>
        {summary && <span className="portal-section-summary">{summary}</span>}
        <ChevronDown size={18} className="portal-section-chevron" aria-hidden="true" />
      </summary>
      <div className="portal-collapsible-content">{children}</div>
    </details>
  );
}

export default PortalSection;
