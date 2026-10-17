import React, { useState } from 'react';
import { Undo2, Lock, Save } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import {
  type DamageMark,
  type DamageType,
  DAMAGE_TYPES,
  MAX_DAMAGE_MARKS,
} from '../../lib/vehicleDiagram';
import { VehicleDiagram, type VehicleDiagramLabels } from '../../components/VehicleDiagram';

export interface DamageDiagramEditorProps {
  marks: DamageMark[];
  onChange?: (marks: DamageMark[]) => void;
  editable?: boolean;
  isLocked?: boolean;
  onSave?: (marks: DamageMark[]) => Promise<void> | void;
  isSaving?: boolean;
}

export const DamageDiagramEditor: React.FC<DamageDiagramEditorProps> = ({
  marks,
  onChange,
  editable = true,
  isLocked = false,
  onSave,
  isSaving = false,
}) => {
  const { t } = useLanguage();
  const [activeType, setActiveType] = useState<DamageType>('golpe');

  const canEdit = editable && !isLocked;

  const labels: VehicleDiagramLabels = {
    views: {
      izquierda: t('damage.views.izquierda'),
      derecha: t('damage.views.derecha'),
      frontal: t('damage.views.frontal'),
      trasera: t('damage.views.trasera'),
      superior: t('damage.views.superior'),
    },
    types: {
      golpe: t('damage.types.golpe'),
      rayon: t('damage.types.rayon'),
      pintura: t('damage.types.pintura'),
      roto: t('damage.types.roto'),
      otro: t('damage.types.otro'),
    },
    remove: t('damage.remove'),
    empty: t('damage.empty'),
  };

  const handleAdd = (mark: DamageMark) => {
    if (!canEdit || !onChange) return;
    if (marks.length >= MAX_DAMAGE_MARKS) return;
    onChange([...marks, mark]);
  };

  const handleRemove = (index: number) => {
    if (!canEdit || !onChange) return;
    const next = marks.filter((_, i) => i !== index);
    onChange(next);
  };

  const handleUndo = () => {
    if (!canEdit || !onChange || marks.length === 0) return;
    onChange(marks.slice(0, -1));
  };

  return (
    <div className="damage-editor">
      <div className="damage-editor-header">
        <h4 className="damage-editor-title">{t('damage.title')}</h4>
        {isLocked ? (
          <div className="alert alert-warning" role="alert">
            <Lock size={16} />
            <span>{t('damage.locked')}</span>
          </div>
        ) : (
          canEdit && <p className="damage-editor-hint">{t('damage.hint')}</p>
        )}
      </div>

      {canEdit && (
        <div className="damage-editor-toolbar">
          <div
            role="radiogroup"
            aria-label={t('damage.title')}
            className="damage-editor-types"
          >
            {DAMAGE_TYPES.map((type) => {
              const isSelected = activeType === type.id;
              return (
                <button
                  key={type.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className={`btn ${isSelected ? 'btn-primary' : 'btn-outline'} damage-type-chip`}
                  onClick={() => setActiveType(type.id)}
                >
                  <span className="damage-badge-circle">{type.letter}</span>
                  <span>{t(`damage.types.${type.id}`)}</span>
                </button>
              );
            })}
          </div>

          <div className="damage-editor-actions" style={{ display: 'flex', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="btn btn-outline damage-undo-btn"
              onClick={handleUndo}
              disabled={marks.length === 0}
              aria-label={t('damage.undo')}
            >
              <Undo2 size={16} />
              <span>{t('damage.undo')}</span>
            </button>

            {onSave && (
              <button
                type="button"
                className="btn btn-primary damage-save-btn"
                onClick={() => onSave(marks)}
                disabled={isSaving}
              >
                <Save size={16} />
                <span>{isSaving ? '...' : t('damage.save')}</span>
              </button>
            )}
          </div>
        </div>
      )}

      <VehicleDiagram
        marks={marks}
        labels={labels}
        editable={canEdit}
        activeType={activeType}
        onAdd={handleAdd}
        onRemove={handleRemove}
      />

      <div className="damage-legend" aria-hidden="true">
        {DAMAGE_TYPES.map((type) => (
          <span key={type.id} className="damage-legend-item">
            <span className="damage-badge-circle">{type.letter}</span>
            <span>{t(`damage.types.${type.id}`)}</span>
          </span>
        ))}
      </div>
    </div>
  );
};
export default DamageDiagramEditor;
