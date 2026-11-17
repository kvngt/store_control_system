import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../../context/auth.context';
import { useLanguage } from '../../../context/language.context';
import { useToast } from '../../../context/toast.context';
import { useUnsavedChanges } from '../../../context/unsavedChanges.context';
import { useBackButtonTrap } from '../../../lib/backButtonTrap';
import { getErrorMessage } from '../../../lib/errors';
import { clearIntakeDraft, loadIntakeDraft, saveIntakeDraft, type IntakeDraft } from '../intakeDraft';
import { useWorkOrderForm } from '../useWorkOrderForm';
import { useIntakeRecords } from './useIntakeRecords';
import { useIntakeSubmit } from './useIntakeSubmit';

interface UseIntakeOptions {
  onOrderCreated: (orderId: string) => void;
}

/**
 * Orquesta el flujo completo de alta de una orden: apertura, borrador local,
 * trampa del botón «atrás», catálogos, guardado incremental y envío final.
 */
export function useIntake({ onOrderCreated }: UseIntakeOptions) {
  const { t, language } = useLanguage();
  const { user, currentSede } = useAuth();
  const { showToast } = useToast();
  const { setGuard } = useUnsavedChanges();

  const isAdmin = user?.rol === 'admin';
  const sedeId = isAdmin ? currentSede?.id : user?.sede_id;
  const targetSedeId = sedeId || currentSede?.id || '';
  const userId = user?.id;

  const form = useWorkOrderForm();

  const [showCreateModal, setShowCreateModal] = useState(false);
  // La pregunta al querer salir de un alta a medias (X, fondo, «atrás» de Android o menú) y la de
  // retomar un borrador al abrirla.
  const [exitDialog, setExitDialog] = useState(false);
  const [restoreDialog, setRestoreDialog] = useState<IntakeDraft | null>(null);
  const pendingProceedRef = useRef<(() => void) | null>(null);

  const records = useIntakeRecords({ form, isAdmin, sedeId, targetSedeId });

  const submit = useIntakeSubmit({
    form,
    user,
    isAdmin,
    targetSedeId,
    operators: records.operators,
    saveNewCustomer: records.saveNewCustomer,
    saveNewVehicle: records.saveNewVehicle,
    avisoDeLoGuardado: records.avisoDeLoGuardado,
    reloadPickers: records.reloadPickers,
    resetSavedFlags: records.resetSavedFlags,
    onCreatedSuccess: (orderId) => {
      // Por si se tocó «atrás» mientras guardaba: la pregunta no aparece al abrir la orden siguiente.
      pendingProceedRef.current = null;
      setExitDialog(false);
      setShowCreateModal(false);
      onOrderCreated(orderId);
    },
  });

  /** Abrir el alta: si hay un borrador de esta persona, se ofrece retomarlo. */
  const open = () => {
    const draft = userId ? loadIntakeDraft(userId) : null;
    setRestoreDialog(draft);
    setShowCreateModal(true);
  };

  /**
   * Cierra el alta. `keepDraft`: dejar lo capturado como borrador para retomarlo; si no, se borra.
   * El cliente y el vehículo nuevos que ya estén completos se guardan igual (pedido del 06/10/2026).
   */
  const close = async (keepDraft: boolean) => {
    // Al cerrar es cuando se pierde el hilo: el formulario se vacía y el cliente recién creado deja de
    // estar seleccionado.
    const values = form.form.getValues();
    const pendingNew = values.customerMode === 'new' || values.vehicleMode === 'new';
    if (pendingNew) {
      try {
        const saved = await records.savePendingRecordsOnCancel();
        if (saved.cliente || saved.vehiculo) {
          showToast('success', saved.vehiculo ? t('intake.savedOnCancelBoth') : t('intake.customerSaved'));
        }
      } catch (err) {
        showToast('error', t('intake.saveOnCancelError'), getErrorMessage(err, language));
        return;
      }
    }
    if (records.hasSavedBeforeFail()) records.reloadPickers();
    // Después de guardar lo pendiente: el borrador lleva ya al cliente y al vehículo como existentes.
    if (userId) {
      if (keepDraft) {
        saveIntakeDraft(userId, form.form.getValues(), form.step);
        showToast('success', t('intake.draftSaved'));
      } else {
        clearIntakeDraft(userId);
      }
    }
    submit.resetSubmitState();
    records.resetSavedFlags();
    setExitDialog(false);
    setShowCreateModal(false);
    form.reset();
    const proceed = pendingProceedRef.current;
    pendingProceedRef.current = null;
    proceed?.();
  };

  // Quiere salir (X, fondo o «atrás»). Sin nada capturado se cierra; con trabajo a medias se pregunta.
  const requestClose = () => {
    // Guardando no se sale: la orden se está creando (la X y el fondo quedaban activos).
    if (submit.saving) return;
    if (!form.isDirty) {
      void close(false);
      return;
    }
    pendingProceedRef.current = null;
    setExitDialog(true);
  };

  // «Atrás» de Android: la pantalla se queda y se pregunta, en vez de perder lo capturado.
  // Cada rama que deja el alta abierta vuelve a armar la trampa: si no, el siguiente «atrás» salía de la
  // pantalla y se perdían las fotos y el comprobante, que no entran en el borrador (revisión del 04/11/2026).
  const backTrap = useBackButtonTrap(showCreateModal, () => {
    // Guardando, o con la pregunta de retomar el borrador abierta, «atrás» no hace nada.
    if (submit.saving || restoreDialog) {
      backTrap.rearm();
      return;
    }
    // Con la pregunta de salir abierta, «atrás» la cierra y se sigue editando.
    if (exitDialog) {
      pendingProceedRef.current = null;
      setExitDialog(false);
      backTrap.rearm();
      return;
    }
    if (form.isDirty) {
      pendingProceedRef.current = null;
      setExitDialog(true);
      backTrap.rearm();
      return;
    }
    void close(false);
  });

  // El borrador se guarda solo mientras se captura: cada cambio (con una pausa), al cambiar de paso y al
  // mandar la app al fondo, que es cuando Android puede descartar la pestaña.
  useEffect(() => {
    if (!showCreateModal || !userId || restoreDialog) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const guardar = () => saveIntakeDraft(userId, form.form.getValues(), form.step);
    const subscription = form.form.watch(() => {
      clearTimeout(timer);
      timer = setTimeout(guardar, 600);
    });
    const alFondo = () => {
      if (document.visibilityState === 'hidden') guardar();
    };
    document.addEventListener('visibilitychange', alFondo);
    window.addEventListener('pagehide', guardar);
    guardar();
    return () => {
      clearTimeout(timer);
      subscription.unsubscribe();
      document.removeEventListener('visibilitychange', alFondo);
      window.removeEventListener('pagehide', guardar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreateModal, userId, restoreDialog, form.step]);

  // Register a navigation guard for as long as the create-order modal has
  // unsaved data, so the sidebar/global search can't silently navigate away
  // and lose it.
  const dirtyRef = useRef(form.isDirty);
  dirtyRef.current = form.isDirty;
  const savingRef = useRef(submit.saving);
  savingRef.current = submit.saving;

  useEffect(() => {
    if (showCreateModal) {
      setGuard(
        (proceed) => {
          if (savingRef.current) return false;
          if (!dirtyRef.current) return true;
          pendingProceedRef.current = proceed;
          setExitDialog(true);
          return false;
        },
        () => dirtyRef.current
      );
    } else {
      setGuard(null);
    }
    return () => setGuard(null);
  }, [showCreateModal, setGuard]);

  const confirmRestore = () => {
    if (!restoreDialog) return;
    form.restoreDraft(restoreDialog.values, restoreDialog.step);
    setRestoreDialog(null);
  };

  const discardRestore = () => {
    if (userId) clearIntakeDraft(userId);
    setRestoreDialog(null);
  };

  const keepEditing = () => {
    pendingProceedRef.current = null;
    setExitDialog(false);
    backTrap.rearm();
  };

  return {
    isAdmin,
    sedeId: targetSedeId,
    form,
    customers: records.customers,
    vehiclesForCustomer: records.vehiclesForCustomer,
    operators: records.operators,
    isOpen: showCreateModal,
    saving: submit.saving,
    error: submit.error,
    restoreDialog,
    exitDialog,
    getSavedNotice: records.avisoDeLoGuardado,
    open,
    requestClose,
    close,
    submit: submit.submitOrder,
    confirmRestore,
    discardRestore,
    keepEditing,
  };
}

export type IntakeApi = ReturnType<typeof useIntake>;
