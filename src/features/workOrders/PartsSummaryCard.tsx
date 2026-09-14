import { Package } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import type { PartSummary } from '../../types/database';
import LineStateBadge from './LineStateBadge';

/**
 * Los repuestos de una orden como los ve un mecánico o pintor: qué pieza y
 * cuántas, sin un solo monto.
 *
 * No es la tabla de repuestos con las columnas de precio escondidas. Los
 * precios nunca llegan al navegador de un técnico — `orden_repuestos` es solo
 * admin por RLS, y esto sale de la función `repuestos_de_orden`, que devuelve
 * únicamente descripción y cantidad. Esconder columnas habría dejado los montos
 * en la respuesta de red, a un clic de las herramientas del navegador.
 */
export default function PartsSummaryCard({ items }: { items: PartSummary[] }) {
  const { t } = useLanguage();

  return (
    <div className="card">
      <h3 className="card-title" style={{ marginBottom: 'var(--space-2)' }}>
        <Package size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
        {t('workOrders.partsDescription')}
      </h3>
      <p className="field-hint" style={{ marginBottom: 'var(--space-3)' }}>
        {t('workOrders.partsNoPricesHint')}
      </p>

      {items.length === 0 ? (
        <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
          {t('common.noResults')}
        </p>
      ) : (
        <ul className="parts-summary-list">
          {items.map((part) => (
            <li key={part.id} className={'parts-summary-item' + (part.estado === 'rechazado' ? ' line-rejected' : '')}>
              <span>
                <span className="line-desc">{part.descripcion}</span> <LineStateBadge state={part.estado} />
              </span>
              <span className="parts-summary-qty">× {part.cantidad}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
