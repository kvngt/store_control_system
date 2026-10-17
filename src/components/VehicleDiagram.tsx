import React from 'react';
import {
  type DamageMark,
  type DamageType,
  type DamageView,
  DAMAGE_TYPES,
  DAMAGE_VIEWS,
  MAX_DAMAGE_MARKS,
} from '../lib/vehicleDiagram';

export interface VehicleDiagramLabels {
  views: Record<DamageView, string>;
  types: Record<DamageType, string>;
  remove: string;
  empty: string;
}

export interface VehicleDiagramProps {
  marks: DamageMark[];
  labels: VehicleDiagramLabels;
  editable?: boolean;
  activeType?: DamageType;
  onAdd?: (mark: DamageMark) => void;
  onRemove?: (index: number) => void;
}

export const VehicleDiagram: React.FC<VehicleDiagramProps> = ({
  marks,
  labels,
  editable = false,
  activeType,
  onAdd,
  onRemove,
}) => {
  const handleSvgClick = (viewId: DamageView, e: React.MouseEvent<SVGSVGElement>) => {
    if (!editable || !onAdd || !activeType) return;
    if (marks.length >= MAX_DAMAGE_MARKS) return;

    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const rawX = (e.clientX - rect.left) / rect.width;
    const rawY = (e.clientY - rect.top) / rect.height;

    const x = Math.max(0, Math.min(1, Math.round(rawX * 1000) / 1000));
    const y = Math.max(0, Math.min(1, Math.round(rawY * 1000) / 1000));

    onAdd({ vista: viewId, x, y, tipo: activeType });
  };

  const handleMarkClick = (index: number, e: React.MouseEvent) => {
    if (!editable || !onRemove) return;
    e.stopPropagation();
    onRemove(index);
  };

  const handleMarkKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (!editable || !onRemove) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      onRemove(index);
    }
  };

  return (
    <div className="vehicle-diagram">
      <div className="vehicle-diagram-grid">
        {DAMAGE_VIEWS.map((view) => {
          const viewMarks = marks
            .map((mark, globalIndex) => ({ mark, globalIndex }))
            .filter((item) => item.mark.vista === view.id);

          return (
            <div
              key={view.id}
              className={`vehicle-diagram-card vehicle-diagram-card--${view.id}`}
            >
              <div className="vehicle-diagram-card-header">
                <span className="vehicle-diagram-view-title">
                  {labels.views[view.id]}
                </span>
                {viewMarks.length > 0 && (
                  <span className="badge badge-subtle">
                    {viewMarks.length}
                  </span>
                )}
              </div>
              <svg
                viewBox={`0 0 ${view.width} ${view.height}`}
                className={`vehicle-diagram-svg ${editable ? 'vehicle-diagram-svg--editable' : ''}`}
                aria-label={labels.views[view.id]}
                role="img"
                onClick={(e) => handleSvgClick(view.id, e)}
              >
                {view.shapes.map((shape, sIdx) => {
                  if (shape.kind === 'circle') {
                    return (
                      <circle
                        key={sIdx}
                        cx={shape.cx}
                        cy={shape.cy}
                        r={shape.r}
                        className="vehicle-diagram-shape"
                      />
                    );
                  }
                  const pointsStr = shape.points.map(([x, y]) => `${x},${y}`).join(' ');
                  if (shape.closed) {
                    return (
                      <polygon
                        key={sIdx}
                        points={pointsStr}
                        className="vehicle-diagram-shape"
                      />
                    );
                  }
                  return (
                    <polyline
                      key={sIdx}
                      points={pointsStr}
                      className="vehicle-diagram-shape"
                    />
                  );
                })}

                {viewMarks.map(({ mark, globalIndex }) => {
                  const cx = mark.x * view.width;
                  const cy = mark.y * view.height;
                  const letter = DAMAGE_TYPES[mark.tipo]?.letter || 'O';

                  return (
                    <g
                      key={globalIndex}
                      className={`vehicle-diagram-mark ${editable ? 'vehicle-diagram-mark--editable' : ''}`}
                      role={editable ? 'button' : undefined}
                      aria-label={editable ? `${labels.remove} ${labels.types[mark.tipo]}` : labels.types[mark.tipo]}
                      tabIndex={editable ? 0 : undefined}
                      onClick={(e) => handleMarkClick(globalIndex, e)}
                      onKeyDown={(e) => handleMarkKeyDown(globalIndex, e)}
                    >
                      {/* Área táctil de al menos 44px virtuales / escalados */}
                      <circle
                        cx={cx}
                        cy={cy}
                        r={14}
                        className="vehicle-diagram-mark-hit"
                      />
                      <circle
                        cx={cx}
                        cy={cy}
                        r={6.5}
                        className="vehicle-diagram-badge"
                      />
                      <text
                        x={cx}
                        y={cy}
                        className="vehicle-diagram-badge-text"
                        textAnchor="middle"
                        dominantBaseline="central"
                      >
                        {letter}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          );
        })}
      </div>

      <div className="vehicle-diagram-list-section">
        {marks.length === 0 ? (
          <p className="vehicle-diagram-empty">{labels.empty}</p>
        ) : (
          <ul className="vehicle-diagram-list">
            {marks.map((mark, index) => (
              <li key={index} className="vehicle-diagram-list-item">
                <span className="vehicle-diagram-list-text">
                  {`${labels.views[mark.vista]}: ${labels.types[mark.tipo]}`}
                </span>
                {editable && onRemove && (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm vehicle-diagram-remove-btn"
                    onClick={() => onRemove(index)}
                    aria-label={`${labels.remove}: ${labels.views[mark.vista]} ${labels.types[mark.tipo]}`}
                  >
                    {labels.remove}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
