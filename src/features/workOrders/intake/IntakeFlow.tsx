import { lazy } from 'react';
import { useLanguage } from '../../../context/language.context';
import ChoiceDialog from '../../../components/ChoiceDialog';
import LazyModal from '../../../components/LazyModal';
import type { IntakeApi } from './useIntake';

const WorkOrderCreateModal = lazy(() => import('../WorkOrderCreateModal'));

interface IntakeFlowProps {
  intake: IntakeApi;
}

export default function IntakeFlow({ intake }: IntakeFlowProps) {
  const { t, language } = useLanguage();

  if (!intake.isAdmin || !intake.isOpen) return null;

  const { form, restoreDialog, exitDialog } = intake;

  return (
    <>
      <LazyModal onClose={intake.requestClose}>
        <WorkOrderCreateModal
          form={form}
          sedeId={intake.sedeId}
          customers={intake.customers}
          vehiclesForCustomer={intake.vehiclesForCustomer}
          operators={intake.operators}
          isAdmin={intake.isAdmin}
          saving={intake.saving}
          error={intake.error}
          onSubmit={intake.submit}
          onClose={intake.requestClose}
        />
      </LazyModal>

      {restoreDialog && (
        <ChoiceDialog
          title={t('intake.restoreTitle')}
          body={t('intake.restoreBody').replace(
            '{fecha}',
            new Date(restoreDialog.savedAt).toLocaleString(language === 'en' ? 'en-US' : 'es-US', {
              day: 'numeric',
              month: 'short',
              hour: 'numeric',
              minute: '2-digit',
            })
          )}
          onDismiss={intake.confirmRestore}
          actions={[
            {
              label: t('intake.restoreContinue'),
              variant: 'primary',
              onClick: intake.confirmRestore,
            },
            {
              label: t('intake.restoreStartNew'),
              variant: 'secondary',
              onClick: intake.discardRestore,
            },
          ]}
        />
      )}

      {exitDialog && (
        <ChoiceDialog
          title={t('intake.exitTitle')}
          body={[
            t('intake.exitBody'),
            intake.getSavedNotice(),
            form.form.getValues().customerMode === 'new' || form.form.getValues().vehicleMode === 'new'
              ? t('intake.keepNewOnCancel')
              : '',
            form.photos.hasMedia || form.receiptFile ? t('intake.exitMediaWarning') : '',
          ]
            .filter(Boolean)
            .join('\n\n')}
          onDismiss={intake.keepEditing}
          actions={[
            {
              label: t('intake.exitKeepEditing'),
              variant: 'primary',
              onClick: intake.keepEditing,
            },
            { label: t('intake.exitSaveDraft'), variant: 'secondary', onClick: () => void intake.close(true) },
            { label: t('intake.exitDiscard'), variant: 'danger', onClick: () => void intake.close(false) },
          ]}
        />
      )}
    </>
  );
}
