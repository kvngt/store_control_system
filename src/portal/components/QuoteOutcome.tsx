import { Check, X } from 'lucide-react';
import type { Formatters, PortalStrings } from '../format';
import type { PortalReport } from '../portal.types';

export interface QuoteOutcomeProps {
  report: PortalReport;
  s: PortalStrings;
  fmt: Formatters;
}

const MAX_DECLINED_ITEMS = 5;

/**
 * Resumen en la vista principal de lo que el cliente respondió al último presupuesto
 * desde este enlace, sin exponer nombres de técnicos.
 */
export function QuoteOutcome({ report, s, fmt }: QuoteOutcomeProps) {
  if (report.presupuesto && report.presupuesto.lineas.length > 0) return null;
  if (report.orden.retirada_sin_reparar) return null;

  const latest = report.presupuestos_respondidos?.[0];
  if (!latest || latest.via !== 'cliente_portal') return null;

  // `autorizados` cuenta líneas y el cliente ve un trabajo agrupado como una sola fila:
  // el título no lleva número, solo el total.
  const approved = latest.autorizados > 0;
  const title = approved
    ? s.quoteOutcomeApproved.replace('{total}', fmt.money(latest.total_aprobado ?? 0))
    : s.quoteOutcomeDeclined;

  const declined = report.cuenta.no_autorizados ?? [];
  const visibleDeclined = declined.slice(0, MAX_DECLINED_ITEMS);
  const extraCount = declined.length - visibleDeclined.length;

  return (
    <section className="portal-card portal-quote-outcome">
      <h2 className="portal-section-title">
        {approved ? <Check size={18} aria-hidden="true" /> : <X size={18} aria-hidden="true" />}
        <span>{title}</span>
      </h2>
      <p className="portal-muted portal-quote-outcome-date">{fmt.dateTime(latest.respondido_en)}</p>
      {visibleDeclined.length > 0 && (
        <div className="portal-not-authorized portal-quote-outcome-declined">
          <div className="portal-label">{s.notAuthorized}</div>
          {visibleDeclined.map((item, i) => (
            <div key={i} className="portal-line">
              <span>{item.descripcion}</span>
              <span>{fmt.money(item.monto)}</span>
            </div>
          ))}
          {extraCount > 0 && (
            <p className="portal-muted portal-quote-outcome-more">
              {s.quoteOutcomeMore.replace('{count}', String(extraCount))}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
