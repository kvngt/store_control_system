import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useAuth } from '../../context/auth.context';
import { useToast } from '../../context/toast.context';
import { sedesService } from '../../services/sedes.service';
import { usersService } from '../../services/users.service';
import { queryKeys } from '../../lib/queryClient';
import { emptyList } from '../../lib/emptyList';
import { getErrorMessage } from '../../lib/errors';
import { isOptionalEmailValid } from '../../lib/email';
import type { Sede, UserProfile } from '../../types/database';
import { cleanSedePhones, normalizeSedePhone } from './sedePhones';
import SedeItem, { type SedeBrandDraft } from './SedeItem';
import CreateSedeModal from './CreateSedeModal';
import DeleteSedeModal from './DeleteSedeModal';

export default function SedesCard() {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const { user, refreshUser, refreshSedes } = useAuth();
  const queryClient = useQueryClient();

  // Not sede-scoped: this screen manages every workshop and everyone in them. Solo la sección de
  // administración las usa: un técnico no las pide (un fallo de red le pintaba un error ajeno).
  const isAdmin = user?.rol === 'admin';
  const sedesQuery = useQuery({ queryKey: queryKeys.sedes(), queryFn: () => sedesService.getSedes(), enabled: isAdmin });
  const usersQuery = useQuery({
    queryKey: queryKeys.users(undefined),
    queryFn: () => usersService.getUsers(),
    enabled: isAdmin,
  });

  const sedes = sedesQuery.data ?? emptyList<Sede>();
  const users = usersQuery.data ?? emptyList<UserProfile>();
  const loading = sedesQuery.isPending || usersQuery.isPending;
  const loadError = sedesQuery.error ?? usersQuery.error;

  const loadData = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.sedes() });
    queryClient.invalidateQueries({ queryKey: queryKeys.users(undefined) });
  };

  // Translated here rather than at fetch time, so switching the UI language
  // no longer re-reads every sede and every staff profile.
  const loadErrorMessage = loadError ? getErrorMessage(loadError, language) : '';

  const [capacityDrafts, setCapacityDrafts] = useState<Record<string, string>>({});
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
  const [ratePerHourDrafts, setRatePerHourDrafts] = useState<Record<string, string>>({});
  const [savingSedeId, setSavingSedeId] = useState<string | null>(null);
  const prevSedesRef = useRef<Sede[]>([]);
  const savedSedeIdRef = useRef<string | null>(null);

  const buildBrandDraft = (s: Sede): SedeBrandDraft => ({
    nombre: s.nombre,
    direccion: s.direccion,
    color_tema: s.color_tema || '#EBC334',
    email_contacto: s.email_contacto || '',
    // Una sede de antes de la lista solo tiene `telefono`: pasa a ser la primera fila,
    // sin descripción (ninguna sirve en los dos idiomas del cliente).
    telefonos:
      Array.isArray(s.telefonos) && s.telefonos.length > 0
        ? s.telefonos.map(normalizeSedePhone)
        : s.telefono?.trim()
          ? [{ label: '', numero: s.telefono.trim(), tipo: 'oficina' as const, whatsapp: false }]
          : [],
  });

  // The capacity and branding inputs are drafts seeded from whatever the last
  // load returned; refreshing sedes after saving one keeps unsaved drafts on other sedes.
  useEffect(() => {
    const prevById = new Map(prevSedesRef.current.map((s) => [s.id, s]));
    const forceResetId = savedSedeIdRef.current;
    savedSedeIdRef.current = null;

    const mergeScalarDrafts = (prev: Record<string, string>, baselineOf: (s: Sede) => string) =>
      Object.fromEntries(
        sedes.map((sede) => {
          const prevSede = prevById.get(sede.id);
          const keepDirty =
            sede.id !== forceResetId &&
            prevSede !== undefined &&
            prev[sede.id] !== undefined &&
            prev[sede.id] !== baselineOf(prevSede);
          return [sede.id, keepDirty ? prev[sede.id] : baselineOf(sede)];
        })
      );

    setCapacityDrafts((prev) => mergeScalarDrafts(prev, (s) => String(s.capacidad)));
    setRateDrafts((prev) => mergeScalarDrafts(prev, (s) => String(s.comision_porcentaje ?? 35)));
    setRatePerHourDrafts((prev) =>
      mergeScalarDrafts(prev, (s) => (s.tarifa_hora != null ? String(s.tarifa_hora) : ''))
    );
    setBrandDrafts((prev) =>
      Object.fromEntries(
        sedes.map((s) => {
          const prevSede = prevById.get(s.id);
          const keepDirty =
            s.id !== forceResetId &&
            prevSede !== undefined &&
            prev[s.id] !== undefined &&
            JSON.stringify(prev[s.id]) !== JSON.stringify(buildBrandDraft(prevSede));
          return [s.id, keepDirty ? prev[s.id] : buildBrandDraft(s)];
        })
      )
    );
    prevSedesRef.current = sedes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedes]);

  // --- sede branding / CRUD (admin only) ---
  const [brandDrafts, setBrandDrafts] = useState<Record<string, SedeBrandDraft>>({});
  const [uploadingLogoId, setUploadingLogoId] = useState<string | null>(null);
  const [invalidNameSedeId, setInvalidNameSedeId] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [logoTargetSede, setLogoTargetSede] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Sede | null>(null);
  const [joiningSedeId, setJoiningSedeId] = useState<string | null>(null);

  const updateBrandDraft = (sedeId: string, patch: Partial<SedeBrandDraft>) => {
    if (patch.nombre !== undefined && invalidNameSedeId === sedeId) {
      setInvalidNameSedeId(null);
    }
    setBrandDrafts((p) => ({ ...p, [sedeId]: { ...p[sedeId], ...patch } }));
  };

  const handleSaveBranding = async (sedeId: string) => {
    const draft = brandDrafts[sedeId];
    if (!draft || !draft.nombre.trim()) {
      setInvalidNameSedeId(sedeId);
      showToast('error', t('settings.nameRequired'));
      return;
    }
    setInvalidNameSedeId((prev) => (prev === sedeId ? null : prev));
    // Es el Reply-To de los correos al cliente: mal escrito, sus respuestas se pierden.
    if (!isOptionalEmailValid(draft.email_contacto)) {
      showToast('error', t('settings.invalidContactEmail'));
      return;
    }
    const phones = cleanSedePhones(draft.telefonos);
    if (phones.error) {
      showToast('error', t(phones.error));
      return;
    }

    setSavingSedeId(sedeId);
    try {
      await sedesService.updateSede(sedeId, {
        nombre: draft.nombre.trim(),
        direccion: draft.direccion.trim(),
        color_tema: draft.color_tema,
        email_contacto: draft.email_contacto.trim() || null,
        telefonos: phones.phones,
      });
      savedSedeIdRef.current = sedeId;
      await refreshSedes();
      loadData();
      showToast('success', t('settings.sedeUpdated'));
    } catch (err) {
      showToast('error', t('settings.sedeError'), getErrorMessage(err, language));
    } finally {
      setSavingSedeId(null);
    }
  };

  const handleLogoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !logoTargetSede) return;
    setUploadingLogoId(logoTargetSede);
    try {
      const url = await sedesService.uploadSedeLogo(logoTargetSede, file);
      await sedesService.updateSede(logoTargetSede, { logo_url: url });
      savedSedeIdRef.current = logoTargetSede;
      await refreshSedes();
      loadData();
      showToast('success', t('settings.logoUpdated'));
    } catch (err) {
      showToast('error', t('settings.logoError'), getErrorMessage(err, language));
    } finally {
      setUploadingLogoId(null);
      setLogoTargetSede(null);
    }
  };

  const handleSaveOperations = async (sedeId: string) => {
    const capacity = parseInt(capacityDrafts[sedeId], 10);
    const rate = parseFloat(rateDrafts[sedeId]);
    const hourlyRateStr = ratePerHourDrafts[sedeId]?.trim();
    const hourlyRate = hourlyRateStr ? parseFloat(hourlyRateStr) : null;
    if (!capacity || capacity <= 0) {
      showToast('error', t('settings.capacityInvalid'));
      return;
    }
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      showToast('error', t('payroll.rateInvalid'));
      return;
    }
    if (hourlyRate !== null && (!Number.isFinite(hourlyRate) || hourlyRate < 0)) {
      showToast('error', t('settings.hourlyRateInvalid'));
      return;
    }
    setSavingSedeId(sedeId);
    try {
      // One update for all operations settings.
      await sedesService.updateSede(sedeId, {
        capacidad: capacity,
        comision_porcentaje: rate,
        tarifa_hora: hourlyRate,
      });
      savedSedeIdRef.current = sedeId;
      await refreshSedes();
      loadData();
      showToast('success', t('settings.sedeUpdated'));
    } catch (err) {
      showToast('error', t('settings.sedeError'), getErrorMessage(err, language));
    } finally {
      setSavingSedeId(null);
    }
  };

  // Moves the signed-in admin's own membership to this sede. Joining one sede
  // is the same action as leaving the previous one, because a profile can only
  // belong to a single workshop.
  const handleJoinSede = async (sede: Sede) => {
    if (!user || user.sede_id === sede.id) return;
    setJoiningSedeId(sede.id);
    try {
      await usersService.moveUserToSede(user.id, sede.id);
      await refreshUser();
      loadData();
      showToast('success', `${t('settings.joinedSede')} ${sede.nombre}`);
    } catch (err) {
      showToast('error', t('settings.joinSedeError'), getErrorMessage(err, language));
    } finally {
      setJoiningSedeId(null);
    }
  };

  return (
    <div className="card" style={{ gridColumn: '1 / -1' }}>
      <div className="card-header">
        <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Building2 size={18} /> {t('settings.workshops')}
        </h3>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCreateModal(true)}>
          <Plus size={16} /> {t('settings.newWorkshop')}
        </button>
      </div>

      {loadErrorMessage && <div className="alert-error">{loadErrorMessage}</div>}

      {/* Shared hidden picker for sede logos */}
      <input
        type="file"
        ref={logoInputRef}
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleLogoChange}
      />
      {loading ? (
        <div className="loading-state"><div className="spinner" /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))', gap: 'var(--space-4)' }}>
          {sedes.map((sede) => (
            <SedeItem
              key={sede.id}
              sede={sede}
              sedeUsers={users.filter((u) => u.sede_id === sede.id)}
              currentUserSedeId={user?.sede_id}
              isAdmin={isAdmin}
              brandDraft={brandDrafts[sede.id]}
              capacityDraft={capacityDrafts[sede.id]}
              rateDraft={rateDrafts[sede.id]}
              ratePerHourDraft={ratePerHourDrafts[sede.id]}
              invalidName={invalidNameSedeId === sede.id}
              uploadingLogo={uploadingLogoId === sede.id}
              saving={savingSedeId === sede.id}
              joining={joiningSedeId === sede.id}
              onLogoClick={(id) => {
                setLogoTargetSede(id);
                logoInputRef.current?.click();
              }}
              onDeleteClick={setDeleteTarget}
              onBrandChange={updateBrandDraft}
              onSaveBranding={handleSaveBranding}
              onCapacityChange={(id, value) => setCapacityDrafts((prev) => ({ ...prev, [id]: value }))}
              onRateChange={(id, value) => setRateDrafts((prev) => ({ ...prev, [id]: value }))}
              onRatePerHourChange={(id, value) => setRatePerHourDrafts((prev) => ({ ...prev, [id]: value }))}
              onSaveOperations={handleSaveOperations}
              onJoinSede={handleJoinSede}
            />
          ))}
        </div>
      )}

      {deleteTarget && (
        <DeleteSedeModal
          sede={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={loadData}
        />
      )}

      {showCreateModal && (
        <CreateSedeModal
          onClose={() => setShowCreateModal(false)}
          onCreated={loadData}
        />
      )}
    </div>
  );
}
