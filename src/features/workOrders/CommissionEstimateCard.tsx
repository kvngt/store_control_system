import { useState } from 'react';
import { AlertTriangle, Wallet, Edit2, CheckCircle2, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { money } from '../../lib/money';
import type { CommissionEstimate, Specialty } from '../../types/database';

interface CommissionEstimateCardProps {
  estimate: CommissionEstimate;
  /** Administración ve el reparto entero; un técnico, lo suyo. */
  isAdmin: boolean;
  userId?: string;
  names: Record<string, string>;
  onApproveCommission?: (comisionId: string, montoNuevo?: number, porcentajeNuevo?: number) => Promise<void>;
}

/**
 * La comisión de una orden, con la cuenta a la vista.
 *
 * Desde 20261010000006 la comisión es por tarea: cada línea de mano de obra con técnico le paga
 * a ese técnico su porcentaje. Las líneas de antes, sin técnico, siguen con el reparto por
 * especialidad (bolsa × porcentaje ÷ compañeros). La tarjeta muestra las dos cosas: es lo que
 * evita la pregunta "¿de dónde sale este número?" el día del pago.
 *
 * Para un técnico es la única cifra de dinero que ve: sus tareas y, si la hay, su parte del
 * reparto. Para administración es el reparto entero y dos avisos: tareas sin técnico (nadie
 * cobrará su comisión) y una bolsa heredada que nadie cobra.
 *
 * Todas las cifras las da la base (`comisiones_estimadas`, la misma cuenta que devenga al
 * entregar). Aquí no se multiplica ni se suma nada.
 */
export default function CommissionEstimateCard({ estimate, isAdmin, userId, names, onApproveCommission }: CommissionEstimateCardProps) {
  const { t } = useLanguage();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editMonto, setEditMonto] = useState('');
  const [editPorcentaje, setEditPorcentaje] = useState('');
  const [busy, setBusy] = useState(false);

  const specialtyLabel = (s: Specialty) => (s === 'pintura' ? t('workOrders.painting') : t('workOrders.mechanical'));
  const tareas = estimate.tareas ?? [];
  const sinAsignar = estimate.sin_asignar ?? [];
  const rate = (porcentaje: number | null) => porcentaje != null ? `${Number(porcentaje)}%` : 'Pendiente';
  const hasPool = (especialidad: Specialty) => estimate.bolsas.some((b) => b.especialidad === especialidad);
  const inheritedDetail = (especialidad: Specialty, porcentaje: number | null, tecnicos: number) => {
    const bolsa = estimate.bolsas.find((b) => b.especialidad === especialidad);
    return t('commission.detail')
      .replace('{especialidad}', specialtyLabel(especialidad))
      .replace('{labor}', bolsa?.base != null ? money(bolsa.base) : 'Pendiente')
      .replace('{rate}', porcentaje != null ? String(Number(porcentaje)) : 'Pendiente')
      .replace('{crew}', String(tecnicos));
  };

  if (!isAdmin) {
    const mine = estimate.reparto.filter((r) => r.usuario_id === userId);
    if (mine.length === 0) return null;
    const salaried = mine.every((r) => r.esquema === 'salario');
    const myTasks = tareas.filter((x) => x.usuario_id === userId);

    return (
      <div className="card commission-estimate" style={{ marginTop: 'var(--space-4)' }}>
        <div className="commission-estimate-row">
          <div>
            <h3 className="card-title">
              <Wallet size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
              {t('workOrders.estimatedCommission')}
            </h3>
            {salaried ? (
              <p className="field-hint" style={{ marginTop: 'var(--space-1)' }}>{t('commission.salaried')}</p>
            ) : (
              <>
                {/* Su parte del reparto heredado (líneas de antes sin técnico). Un grupo sin
                    `heredado` (dato anterior a la comisión por tarea) es todo reparto; con tareas
                    y sin bolsa, la línea "$0.00 ÷ 1" solo estorbaría. */}
                {mine
                  .filter((r) => (r.heredado ?? true) && (!r.tareas || hasPool(r.especialidad)))
                  .map((r) => (
                    <p key={r.especialidad} className="field-hint" style={{ marginTop: 'var(--space-1)' }}>
                      {inheritedDetail(r.especialidad, r.porcentaje, r.tecnicos)}
                    </p>
                  ))}
                {myTasks.map((x) => (
                  <p key={x.labor_id} className="field-hint commission-task-line" style={{ marginTop: 'var(--space-1)' }}>
                    <span>
                      {t('commission.taskDetail')
                        .replace('{descripcion}', x.descripcion)
                        .replace('{base}', x.base != null ? money(Number(x.base)) : 'Pendiente')
                        .replace('{rate}', x.porcentaje != null ? String(Number(x.porcentaje)) : 'Pendiente')}
                    </span>
                    <span className="commission-split-amount">{x.monto != null ? money(Number(x.monto)) : <span className="badge">Pendiente</span>}</span>
                  </p>
                ))}
              </>
            )}
          </div>
          {!salaried && <div className="commission-estimate-amount">{money(Number(estimate.mi_total))}</div>}
        </div>
        <p className="field-hint" style={{ marginTop: 'var(--space-2)' }}>
          {t('workOrders.estimatedCommissionHint')}
        </p>
      </div>
    );
  }

  // Administración: una sección por especialidad con lo de cada quien (sus tareas más su parte
  // del reparto heredado), incluidas las especialidades con gente asignada y sin mano de obra,
  // para que se vea por qué alguien no cobra. Debajo, el detalle por tarea.
  const specialties = [...new Set([...estimate.bolsas.map((b) => b.especialidad), ...estimate.reparto.map((r) => r.especialidad)])];
  if (specialties.length === 0 && tareas.length === 0 && sinAsignar.length === 0) return null;

  return (
    <div className="card" style={{ marginTop: 'var(--space-4)' }}>
      <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>
        <Wallet size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
        {t('commission.splitTitle')}
      </h3>

      {sinAsignar.length > 0 && (
        <div className="commission-split-warning commission-unassigned" role="note">
          <AlertTriangle size={14} aria-hidden="true" />
          <div>
            <p>{t('commission.unassignedTitle')}</p>
            <ul>
              {sinAsignar.map((x) => (
                <li key={x.labor_id}>
                  {x.descripcion} <span className="commission-split-rate">({specialtyLabel(x.especialidad)})</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {specialties.map((esp) => {
        const bolsa = estimate.bolsas.find((b) => b.especialidad === esp);
        const people = estimate.reparto.filter((r) => r.especialidad === esp);
        return (
          <div key={esp} className="commission-split">
            <div className="commission-split-header">
              <strong>{specialtyLabel(esp)}</strong>
              {bolsa && (
                <span>
                  {(tareas.length > 0 ? t('commission.inheritedPool') : t('commission.pool')).replace('{monto}', money(bolsa.base))}
                </span>
              )}
            </div>
            {bolsa && bolsa.tecnicos === 0 && (
              <p className="commission-split-warning" role="note">
                <AlertTriangle size={14} /> {t('commission.nobodyAssigned').replace('{especialidad}', specialtyLabel(esp).toLowerCase())}
              </p>
            )}
            {people.length > 0 && (
              <ul className="commission-split-list">
                {people.map((r) => {
                  const parts = [
                    r.tareas > 0 ? t('commission.taskCount').replace('{n}', String(r.tareas)) : '',
                    r.heredado && r.tareas > 0 && hasPool(esp) ? t('commission.inheritedShare').replace('{crew}', String(r.tecnicos)) : '',
                  ].filter(Boolean);
                  const isEditing = editingId === r.comision_id;
                  return (
                    <li key={r.usuario_id}>
                      <span>
                        {names[r.usuario_id] ?? '—'}
                        {parts.length > 0 && <span className="commission-split-rate"> · {parts.join(' + ')}</span>}
                        {isAdmin && r.comision_id && !isEditing && (
                          <span className={`badge ${r.estado === 'aceptada' ? 'badge-success' : 'badge-waiting-auth'}`} style={{ marginLeft: 8 }}>
                            {r.estado === 'aceptada' ? t('common.approved') : t('common.pending')}
                          </span>
                        )}
                      </span>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input type="number" className="form-input form-input-sm" style={{ width: 70 }} value={editPorcentaje} onChange={e => setEditPorcentaje(e.target.value)} placeholder="%" />
                          <span>%</span>
                          <input type="number" className="form-input form-input-sm" style={{ width: 90 }} value={editMonto} onChange={e => setEditMonto(e.target.value)} placeholder="$" />
                          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={async () => {
                            if (!onApproveCommission || !r.comision_id) return;
                            setBusy(true);
                            await onApproveCommission(r.comision_id, editMonto ? Number(editMonto) : undefined, editPorcentaje ? Number(editPorcentaje) : undefined);
                            setBusy(false);
                            setEditingId(null);
                          }}>
                            <CheckCircle2 size={16} />
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditingId(null)}>
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <span className="commission-split-rate">
                            {r.esquema === 'salario' ? t('commission.salaryStaysInShop') : rate(r.porcentaje)}
                          </span>
                          <span className="commission-split-amount">{r.esquema === 'salario' ? '—' : (r.monto != null ? money(Number(r.monto)) : 'Pendiente')}</span>
                          {isAdmin && r.comision_id && onApproveCommission && (
                            <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
                              {r.estado === 'sugerida' && (
                                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={async () => {
                                  setBusy(true);
                                  await onApproveCommission(r.comision_id!);
                                  setBusy(false);
                                }}>
                                  {t('common.accept')}
                                </button>
                              )}
                              <button type="button" className="btn btn-ghost btn-sm btn-icon" disabled={busy} onClick={() => {
                                setEditingId(r.comision_id!);
                                setEditMonto(r.monto ? String(r.monto) : '');
                                setEditPorcentaje(r.porcentaje ? String(r.porcentaje) : '');
                              }}>
                                <Edit2 size={14} />
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}

      {tareas.length > 0 && (
        <div className="commission-split">
          <div className="commission-split-header">
            <strong>{t('commission.byTask')}</strong>
          </div>
          <ul className="commission-split-list commission-task-list">
            {tareas.map((x) => {
              const isEditing = editingId === x.comision_id;
              return (
              <li key={x.labor_id}>
                <span>
                  {x.descripcion}
                  <span className="commission-split-rate"> · {names[x.usuario_id] ?? '—'}</span>
                  {isAdmin && x.comision_id && !isEditing && (
                    <span className={`badge ${x.estado === 'aceptada' ? 'badge-success' : 'badge-waiting-auth'}`} style={{ marginLeft: 8 }}>
                      {x.estado === 'aceptada' ? t('common.approved') : t('common.pending')}
                    </span>
                  )}
                </span>
                {isEditing ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="number" className="form-input form-input-sm" style={{ width: 70 }} value={editPorcentaje} onChange={e => setEditPorcentaje(e.target.value)} placeholder="%" />
                    <span>%</span>
                    <input type="number" className="form-input form-input-sm" style={{ width: 90 }} value={editMonto} onChange={e => setEditMonto(e.target.value)} placeholder="$" />
                    <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={async () => {
                      if (!onApproveCommission || !x.comision_id) return;
                      setBusy(true);
                      await onApproveCommission(x.comision_id, editMonto ? Number(editMonto) : undefined, editPorcentaje ? Number(editPorcentaje) : undefined);
                      setBusy(false);
                      setEditingId(null);
                    }}>
                      <CheckCircle2 size={16} />
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setEditingId(null)}>
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="commission-split-rate">
                      {x.esquema === 'salario' ? t('commission.salaryStaysInShop') : `${x.base != null ? money(Number(x.base)) : 'Pendiente'} × ${rate(x.porcentaje)}`}
                    </span>
                    <span className="commission-split-amount">{x.esquema === 'salario' ? '—' : (x.monto != null ? money(Number(x.monto)) : 'Pendiente')}</span>
                    {isAdmin && x.comision_id && onApproveCommission && (
                      <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
                        {x.estado === 'sugerida' && (
                          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={async () => {
                            setBusy(true);
                            await onApproveCommission(x.comision_id!);
                            setBusy(false);
                          }}>
                            {t('common.accept')}
                          </button>
                        )}
                        <button type="button" className="btn btn-ghost btn-sm btn-icon" disabled={busy} onClick={() => {
                          setEditingId(x.comision_id!);
                          setEditMonto(x.monto ? String(x.monto) : '');
                          setEditPorcentaje(x.porcentaje ? String(x.porcentaje) : '');
                        }}>
                          <Edit2 size={14} />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            )})}
          </ul>
        </div>
      )}
      <p className="field-hint" style={{ marginTop: 'var(--space-2)' }}>{t('commission.splitHint')}</p>
    </div>
  );
}
