import { useState, useEffect } from 'react';
import { X, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { AlertError } from '../../components/AlertError';
import { inspectionService } from '../../services/inspection.service';
import { getErrorMessage } from '../../lib/errors';
import type { InspectionTemplate, InspectionTemplatePoint } from '../../types/database';

interface InspectionTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  sedeId: string;
  template?: InspectionTemplate | null;
  onSaved: () => void;
}

export default function InspectionTemplateModal({
  isOpen,
  onClose,
  sedeId,
  template,
  onSaved,
}: InspectionTemplateModalProps) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();

  const [nombre, setNombre] = useState('');
  const [activo, setActivo] = useState(true);
  const [predeterminada, setPredeterminada] = useState(false);
  const [puntos, setPuntos] = useState<InspectionTemplatePoint[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (template) {
        setNombre(template.nombre);
        setActivo(template.activo);
        setPredeterminada(template.predeterminada);
        setPuntos(
          (template.puntos ?? []).map((p) => ({
            id: p.id,
            seccion: p.seccion,
            nombre: p.nombre,
            posicion: p.posicion,
          }))
        );
      } else {
        setNombre('');
        setActivo(true);
        setPredeterminada(false);
        setPuntos([]);
      }
      setError('');
    }
  }, [isOpen, template]);

  if (!isOpen) return null;

  const handleAddPoint = () => {
    const lastSection = puntos.length > 0 ? puntos[puntos.length - 1].seccion : '';
    setPuntos((prev) => [
      ...prev,
      {
        seccion: lastSection,
        nombre: '',
      },
    ]);
  };

  const handleRemovePoint = (index: number) => {
    setPuntos((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    setPuntos((prev) => {
      const copy = [...prev];
      const temp = copy[index - 1];
      copy[index - 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handleMoveDown = (index: number) => {
    if (index >= puntos.length - 1) return;
    setPuntos((prev) => {
      const copy = [...prev];
      const temp = copy[index + 1];
      copy[index + 1] = copy[index];
      copy[index] = temp;
      return copy;
    });
  };

  const handlePointChange = (index: number, field: 'seccion' | 'nombre', val: string) => {
    setPuntos((prev) =>
      prev.map((p, idx) => (idx === index ? { ...p, [field]: val } : p))
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedNombre = nombre.trim();
    if (!trimmedNombre) {
      setError(t('inspection.templates.nameRequired'));
      return;
    }

    if (puntos.length === 0) {
      setError(t('inspection.templates.pointsRequired'));
      return;
    }

    for (let i = 0; i < puntos.length; i++) {
      const p = puntos[i];
      if (!p.seccion.trim() || !p.nombre.trim()) {
        setError(t('inspection.templates.pointsRequired'));
        return;
      }
    }

    setSaving(true);
    setError('');

    try {
      await inspectionService.saveTemplate({
        id: template?.id ?? null,
        sede_id: sedeId,
        nombre: trimmedNombre,
        activo,
        predeterminada,
        puntos,
      });

      showToast('success', t('inspection.templates.savedSuccess'));
      onSaved();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, language));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal modal-lg" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h3 className="modal-title">
            {template ? t('inspection.templates.editTemplate') : t('inspection.templates.newTemplate')}
          </h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t('common.close')}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div className="modal-body" style={{ maxHeight: 'calc(85vh - 140px)', overflowY: 'auto' }}>
            <AlertError message={error} />

            <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
              <label className="form-label">{t('inspection.templates.name')}</label>
              <input
                type="text"
                className="form-input"
                placeholder={t('inspection.templates.namePlaceholder')}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                maxLength={120}
                autoFocus
              />
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={activo}
                  onChange={(e) => setActivo(e.target.checked)}
                />
                <span>{t('inspection.templates.active')}</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={predeterminada}
                  onChange={(e) => setPredeterminada(e.target.checked)}
                />
                <span>{t('inspection.templates.makeDefault')}</span>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
              <h4 style={{ margin: 0 }}>{t('inspection.templates.sections')} ({puntos.length})</h4>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleAddPoint}
              >
                <Plus size={16} /> {t('inspection.templates.addPoint')}
              </button>
            </div>

            {puntos.length === 0 ? (
              <p className="field-hint" style={{ textAlign: 'center', padding: 'var(--space-4)' }}>
                {t('inspection.templates.pointsRequired')}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                {puntos.map((point, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      padding: 'var(--space-2)',
                      background: 'var(--color-bg-tertiary)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-surface-border)',
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-icon btn-reorder"
                        onClick={() => handleMoveUp(index)}
                        disabled={index === 0}
                        title={t('inspection.templates.moveUp')}
                        aria-label={t('inspection.templates.moveUp')}
                      >
                        <ArrowUp size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm btn-icon btn-reorder"
                        onClick={() => handleMoveDown(index)}
                        disabled={index === puntos.length - 1}
                        title={t('inspection.templates.moveDown')}
                        aria-label={t('inspection.templates.moveDown')}
                      >
                        <ArrowDown size={14} />
                      </button>
                    </div>

                    <input
                      type="text"
                      className="form-input form-input-sm"
                      placeholder={t('inspection.templates.sectionPlaceholder')}
                      value={point.seccion}
                      onChange={(e) => handlePointChange(index, 'seccion', e.target.value)}
                      style={{ width: '35%' }}
                      maxLength={120}
                    />

                    <input
                      type="text"
                      className="form-input form-input-sm"
                      placeholder={t('inspection.templates.pointPlaceholder')}
                      value={point.nombre}
                      onChange={(e) => handlePointChange(index, 'nombre', e.target.value)}
                      style={{ flex: 1 }}
                      maxLength={120}
                    />

                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon"
                      onClick={() => handleRemovePoint(index)}
                      title={t('inspection.templates.removePoint')}
                      aria-label={t('inspection.templates.removePoint')}
                    >
                      <Trash2 size={16} style={{ color: 'var(--color-danger)' }} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
