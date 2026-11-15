import { AlertTriangle, CheckCircle2, ClipboardCheck, Info } from 'lucide-react';
import PortalSection from '../PortalSection';
import type { Formatters, PortalStrings } from '../format';
import type { PortalMedia, PortalReport } from '../portal.types';
import { PortalMediaGrid } from './PortalMedia';

export interface InspectionSectionProps {
  inspeccion: NonNullable<PortalReport['inspeccion']>;
  multimedia: PortalMedia[];
  s: PortalStrings;
  fmt: Formatters;
}

export function InspectionSection({ inspeccion, multimedia, s, fmt }: InspectionSectionProps) {
  const { resumen, puntos, nombre } = inspeccion;
  const urgentCount = resumen?.urgente ?? 0;
  const cautionCount = resumen?.atencion ?? 0;
  const goodCount = resumen?.bien ?? 0;

  const defaultOpen = urgentCount > 0 || cautionCount > 0;

  const attentionPoints = puntos.filter((p) => p.estado === 'urgente' || p.estado === 'atencion');
  const goodPoints = puntos.filter((p) => p.estado === 'bien');

  const urgentLabel = (urgentCount === 1 ? s.inspection.summaryUrgente : s.inspection.summaryUrgentes).replace(
    '{count}',
    String(urgentCount)
  );
  const cautionLabel = (cautionCount === 1 ? s.inspection.summaryAtencion : s.inspection.summaryAtenciones).replace(
    '{count}',
    String(cautionCount)
  );
  const goodLabel = s.inspection.summaryBien.replace('{count}', String(goodCount));

  return (
    <PortalSection
      icon={ClipboardCheck}
      title={nombre || s.inspection.title}
      defaultOpen={defaultOpen}
      testId="inspection-section"
    >
      {/* Resumen en 3 fichas */}
      <div className="portal-inspection-chips" role="group" aria-label={s.inspection.title}>
        <span className="portal-inspection-chip is-urgente" data-testid="chip-urgente">
          <AlertTriangle size={14} aria-hidden="true" />
          {urgentLabel}
        </span>
        <span className="portal-inspection-chip is-atencion" data-testid="chip-atencion">
          <Info size={14} aria-hidden="true" />
          {cautionLabel}
        </span>
        <span className="portal-inspection-chip is-bien" data-testid="chip-bien">
          <CheckCircle2 size={14} aria-hidden="true" />
          {goodLabel}
        </span>
      </div>

      {puntos.length === 0 && <p className="portal-muted">{s.inspection.empty}</p>}

      {/* Puntos en urgente y atención con nota y fotos */}
      {attentionPoints.length > 0 && (
        <div className="portal-inspection-points">
          {attentionPoints.map((p) => {
            const pointPhotos = multimedia.filter((m) => m.inspeccion_punto_id === p.id);
            const isUrgente = p.estado === 'urgente';
            const badgeClass = isUrgente ? 'is-urgente' : 'is-atencion';
            const badgeText = isUrgente ? s.inspection.urgenteBadge : s.inspection.atencionBadge;

            return (
              <article key={p.id} className={`portal-inspection-point-card ${badgeClass}`}>
                <div className="portal-inspection-point-header">
                  <div className="portal-inspection-point-title">
                    <span>{p.nombre}</span>
                    <span className="portal-inspection-point-section">{p.seccion}</span>
                  </div>
                  <span className={`portal-inspection-point-badge ${badgeClass}`}>{badgeText}</span>
                </div>
                {p.nota && <p className="portal-inspection-point-note">{p.nota}</p>}
                {pointPhotos.length > 0 && <PortalMediaGrid media={pointPhotos} s={s} fmt={fmt} />}
              </article>
            );
          })}
        </div>
      )}

      {/* Puntos en buen estado en lista plegada */}
      {goodPoints.length > 0 && (
        <details className="portal-inspection-good-details">
          <summary className="portal-inspection-good-summary">
            <CheckCircle2 size={16} className="portal-inspection-good-bullet" />
            <span>{s.inspection.goodSectionTitle.replace('{count}', String(goodPoints.length))}</span>
          </summary>
          <ul className="portal-inspection-good-list">
            {goodPoints.map((p) => (
              <li key={p.id} className="portal-inspection-good-item">
                <span>
                  <strong style={{ marginRight: 'var(--space-1)' }}>✓</strong>
                  {p.nombre}
                </span>
                <span className="portal-inspection-point-section">{p.seccion}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </PortalSection>
  );
}
