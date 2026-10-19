import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Wrench, Package } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { AlertError } from '../../components/AlertError';
import { catalogService } from '../../services/catalog.service';
import { getErrorMessage } from '../../lib/errors';
import type { CatalogJob } from '../../types/database';

interface EditableLine {
  id?: string;
  tipo: 'mano_obra' | 'repuesto';
  descripcion: string;
  especialidad: 'mecanica' | 'pintura';
  cantidad: number;
  precio: number | '';
  costo_unitario: number | '' | null;
  horas?: number | '' | null;
}

interface CatalogJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  sedeId: string;
  job?: CatalogJob | null;
  onSaved: () => void;
}

export default function CatalogJobModal({
  isOpen,
  onClose,
  sedeId,
  job,
  onSaved,
}: CatalogJobModalProps) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();

  const [nombre, setNombre] = useState('');
  const [activo, setActivo] = useState(true);
  const [lineas, setLineas] = useState<EditableLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (job) {
        setNombre(job.nombre);
        setActivo(job.activo);
        setLineas(
          (job.lineas ?? []).map((l) => ({
            id: l.id,
            tipo: l.tipo,
            descripcion: l.descripcion,
            especialidad: (l.especialidad ?? 'mecanica') as 'mecanica' | 'pintura',
            cantidad: l.cantidad,
            precio: l.precio,
            costo_unitario: l.costo_unitario ?? '',
            horas: l.horas ?? '',
          }))
        );
      } else {
        setNombre('');
        setActivo(true);
        setLineas([]);
      }
      setError('');
    }
  }, [isOpen, job]);

  if (!isOpen) return null;

  const handleAddLabor = () => {
    setLineas((prev) => [
      ...prev,
      {
        tipo: 'mano_obra',
        descripcion: '',
        especialidad: 'mecanica',
        cantidad: 1,
        precio: '',
        costo_unitario: null,
        horas: '',
      },
    ]);
  };

  const handleAddPart = () => {
    setLineas((prev) => [
      ...prev,
      {
        tipo: 'repuesto',
        descripcion: '',
        especialidad: 'mecanica',
        cantidad: 1,
        precio: '',
        costo_unitario: '',
        horas: null,
      },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    setLineas((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateLine = (index: number, patch: Partial<EditableLine>) => {
    setLineas((prev) =>
      prev.map((l, idx) => (idx === index ? { ...l, ...patch } : l))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = nombre.trim();
    if (!cleanName) {
      setError(t('catalog.nameRequired'));
      return;
    }
    if (lineas.length === 0) {
      setError(t('catalog.emptyLines'));
      return;
    }

    for (let i = 0; i < lineas.length; i++) {
      const line = lineas[i];
      if (!line.descripcion.trim()) {
        setError(t('catalog.emptyLines'));
        return;
      }
      if (line.precio === '' || Number(line.precio) < 0) {
        setError(t('catalog.priceInvalid'));
        return;
      }
      if (line.tipo === 'repuesto' && (Number(line.cantidad) < 1 || !Number.isInteger(Number(line.cantidad)))) {
        setError(t('catalog.quantityInvalid'));
        return;
      }
    }

    try {
      setSaving(true);
      setError('');
      await catalogService.save({
        id: job?.id ?? null,
        sede_id: sedeId,
        nombre: cleanName,
        activo,
        lineas: lineas.map((l, idx) => ({
          tipo: l.tipo,
          descripcion: l.descripcion.trim(),
          especialidad: l.tipo === 'mano_obra' ? l.especialidad : null,
          cantidad: l.tipo === 'mano_obra' ? 1 : Math.max(1, Number(l.cantidad) || 1),
          precio: Number(l.precio) || 0,
          costo_unitario:
            l.tipo === 'repuesto' && l.costo_unitario !== '' && l.costo_unitario !== null
              ? Number(l.costo_unitario)
              : null,
          horas:
            l.tipo === 'mano_obra' && l.horas !== '' && l.horas !== null && l.horas !== undefined
              ? Number(l.horas)
              : null,
          posicion: idx,
        })),
      });

      showToast('success', t('catalog.savedSuccess'));
      onSaved();
      onClose();
    } catch (err: unknown) {
      const errMsg = getErrorMessage(err, language);
      if (
        errMsg.includes('23505') ||
        (err as { code?: string })?.code === '23505'
      ) {
        setError(t('catalog.duplicateName'));
      } else {
        setError(errMsg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        <div className="modal-header">
          <h3 className="modal-title">
            {job ? t('catalog.editJob') : t('catalog.newJob')}
          </h3>
          <button type="button" className="modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
            <AlertError message={error} />

            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label className="form-label" htmlFor="catalog-job-name">
                {t('catalog.name')}
              </label>
              <input
                id="catalog-job-name"
                type="text"
                className="form-input"
                placeholder={t('catalog.namePlaceholder')}
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                maxLength={120}
                required
                disabled={saving}
              />
            </div>

            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={activo}
                  onChange={(e) => setActivo(e.target.checked)}
                  disabled={saving}
                />
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-medium)' }}>
                  {t('catalog.active')}
                </span>
              </label>
              <p className="field-hint" style={{ margin: '4px 0 0 24px' }}>
                {t('catalog.activeHint')}
              </p>
            </div>

            <div style={{ marginBottom: 'var(--space-3)' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 'var(--space-2)',
                  flexWrap: 'wrap',
                  gap: 'var(--space-2)',
                }}
              >
                <h4 style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 600 }}>
                  {t('catalog.lines')}
                </h4>
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleAddLabor}
                    disabled={saving}
                  >
                    <Plus size={14} /> {t('catalog.addLabor')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleAddPart}
                    disabled={saving}
                  >
                    <Plus size={14} /> {t('catalog.addPart')}
                  </button>
                </div>
              </div>

              {lineas.length === 0 ? (
                <div
                  style={{
                    padding: 'var(--space-6)',
                    textAlign: 'center',
                    border: '1px dashed var(--color-surface-border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-text-secondary)',
                    fontSize: 'var(--font-size-sm)',
                  }}
                >
                  {t('catalog.emptyLines')}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {lineas.map((line, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: 'var(--space-3)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-surface-border)',
                        background: 'var(--color-bg-secondary)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--space-2)',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 'var(--space-2)',
                        }}
                      >
                        <span
                          className="job-chip"
                          style={{
                            fontWeight: 600,
                            background:
                              line.tipo === 'mano_obra'
                                ? 'var(--color-bg-tertiary)'
                                : 'var(--color-bg-hover)',
                          }}
                        >
                          {line.tipo === 'mano_obra' ? (
                            <>
                              <Wrench size={12} /> {t('catalog.lineTypeLabor')}
                            </>
                          ) : (
                            <>
                              <Package size={12} /> {t('catalog.lineTypePart')}
                            </>
                          )}
                        </span>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm btn-icon"
                          onClick={() => handleRemoveLine(idx)}
                          disabled={saving}
                          title={t('common.delete')}
                        >
                          <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                        </button>
                      </div>

                      <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1 1 200px' }}>
                          <input
                            type="text"
                            className="form-input"
                            placeholder={t('catalog.descriptionPlaceholder')}
                            value={line.descripcion}
                            onChange={(e) =>
                              handleUpdateLine(idx, { descripcion: e.target.value })
                            }
                            maxLength={200}
                            required
                            disabled={saving}
                          />
                        </div>

                        {line.tipo === 'mano_obra' ? (
                          <>
                            <div style={{ width: 130 }}>
                              <select
                                className="form-input form-select"
                                value={line.especialidad}
                                onChange={(e) =>
                                  handleUpdateLine(idx, {
                                    especialidad: e.target.value as 'mecanica' | 'pintura',
                                  })
                                }
                                disabled={saving}
                              >
                                <option value="mecanica">
                                  {t('workOrders.mechanical')}
                                </option>
                                <option value="pintura">
                                  {t('workOrders.painting')}
                                </option>
                              </select>
                            </div>
                            <div style={{ width: 85 }}>
                              <input
                                type="number"
                                step="0.25"
                                min="0"
                                className="form-input"
                                placeholder={t('tasks.hours')}
                                title={t('tasks.hours')}
                                value={line.horas ?? ''}
                                onChange={(e) =>
                                  handleUpdateLine(idx, {
                                    horas: e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0),
                                  })
                                }
                                disabled={saving}
                              />
                            </div>
                            <div style={{ width: 110 }}>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="form-input"
                                placeholder={t('catalog.price')}
                                value={line.precio}
                                onChange={(e) =>
                                  handleUpdateLine(idx, {
                                    precio: e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0),
                                  })
                                }
                                required
                                disabled={saving}
                              />
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ width: 80 }}>
                              <input
                                type="number"
                                step="1"
                                min="1"
                                className="form-input"
                                placeholder={t('catalog.quantity')}
                                value={line.cantidad}
                                onChange={(e) =>
                                  handleUpdateLine(idx, {
                                    cantidad: Math.max(1, parseInt(e.target.value, 10) || 1),
                                  })
                                }
                                required
                                disabled={saving}
                              />
                            </div>
                            <div style={{ width: 110 }}>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="form-input"
                                placeholder={t('catalog.price')}
                                value={line.precio}
                                onChange={(e) =>
                                  handleUpdateLine(idx, {
                                    precio: e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0),
                                  })
                                }
                                required
                                disabled={saving}
                              />
                            </div>
                            <div style={{ width: 110 }}>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="form-input"
                                placeholder={t('catalog.cost')}
                                value={line.costo_unitario ?? ''}
                                onChange={(e) =>
                                  handleUpdateLine(idx, {
                                    costo_unitario: e.target.value === '' ? null : Math.max(0, parseFloat(e.target.value) || 0),
                                  })
                                }
                                disabled={saving}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving}
            >
              {saving ? t('common.loading') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
