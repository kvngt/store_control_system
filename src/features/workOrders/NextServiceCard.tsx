import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Calendar, Check, ExternalLink, Gauge, Lightbulb, PenLine, Printer, Tag, Trash2, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { formatDay } from '../../lib/dates';
import { getErrorMessage } from '../../lib/errors';
import { queryKeys } from '../../lib/queryClient';
import { nextServiceService } from '../../services/nextService.service';
import { openStickerWindow, serviceStickerUrl } from './nextService';
import { noteForSticker } from './stickerNote';
import type { Sede, WorkOrder } from '../../types/database';

interface NextServiceCardProps {
  order: WorkOrder;
  isAdmin: boolean;
  canSuggest: boolean;
  sede?: Sede | null;
  onOpenModal: (initialData?: { fecha?: string | null; millas?: number | null; nota?: string | null } | null) => void;
}

export default function NextServiceCard({
  order,
  isAdmin,
  canSuggest,
  sede,
  onOpenModal,
}: NextServiceCardProps) {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  // es-US, como el dinero (lib/money.ts): 108,000 y no 108.000.
  const numFmt = new Intl.NumberFormat(language === 'es' ? 'es-US' : 'en-US');

  const query = useQuery({
    queryKey: queryKeys.nextService(order.id),
    queryFn: () => nextServiceService.getNextService(order.id),
  });

  const serviceData = query.data;
  const isProgrammed = !!serviceData?.token && (!!serviceData?.fecha || serviceData?.millas !== null);
  const hasSuggestion = !!serviceData?.sugerido_en && (!!serviceData?.sugerido_fecha || serviceData?.sugerido_millas !== null);

  const handleRemove = async () => {
    if (!confirm(t('nextService.removeConfirm'))) return;
    setBusy(true);
    try {
      await nextServiceService.remove(order.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.nextService(order.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.workOrderDetail(order.id) });
      showToast('success', t('nextService.removedSuccess'));
    } catch (err) {
      showToast('error', t('nextService.removeError'), getErrorMessage(err, language));
    } finally {
      setBusy(false);
    }
  };

  const handleDiscardSuggestion = async () => {
    if (!confirm(t('nextService.discardConfirm'))) return;
    setBusy(true);
    try {
      await nextServiceService.discardSuggestion(order.id);
      await queryClient.invalidateQueries({ queryKey: queryKeys.nextService(order.id) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.workOrderDetail(order.id) });
      showToast('success', t('nextService.discardedSuccess'));
    } catch (err) {
      showToast('error', t('nextService.discardError'), getErrorMessage(err, language));
    } finally {
      setBusy(false);
    }
  };

  const handleUseSuggestion = () => {
    if (!serviceData) return;
    onOpenModal({
      fecha: serviceData.sugerido_fecha,
      millas: serviceData.sugerido_millas,
      nota: serviceData.sugerido_nota,
    });
  };

  const handleDirectPrint = async () => {
    if (!serviceData?.token) return;
    // Dentro del clic, antes del import: si no, el iPhone bloquea la ventana.
    const printWindow = openStickerWindow();
    setPrinting(true);
    const lang = order.cliente?.idioma === 'en' ? 'en' : 'es';
    try {
      const { nota: noteForPdf, fallo } = await noteForSticker(serviceData.nota, lang);
      if (fallo) {
        showToast('error', t('nextService.noteNotTranslated'));
      }
      const { printServiceSticker } = await import('../../lib/serviceStickerPdf');
      await printServiceSticker(
        {
          taller: {
            nombre: sede?.nombre || '',
            telefono: sede?.telefono || null,
          },
          vehiculo: {
            anio: order.vehiculo?.anio || 0,
            marca: order.vehiculo?.marca || '',
            modelo: order.vehiculo?.modelo || '',
            placa: order.vehiculo?.placa || '',
          },
          servicio: {
            fecha: serviceData.fecha,
            millas: serviceData.millas,
            nota: noteForPdf,
            token: serviceData.token,
          },
          numero_orden: order.numero_orden,
        },
        lang,
        printWindow
      );
    } catch (err) {
      printWindow?.close();
      showToast('error', t('nextService.printError'), getErrorMessage(err, language));
    } finally {
      setPrinting(false);
    }
  };

  const publicUrl = serviceData?.token ? serviceStickerUrl(serviceData.token) : null;

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Sugerencia del técnico pendiente (visible para admin y técnico) */}
      {hasSuggestion && (
        <div
          style={{
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--surface-sunken)',
            borderRadius: 'var(--radius-md)',
            borderLeft: '4px solid var(--primary)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 600 }}>
              <Lightbulb size={16} color="var(--primary)" />
              <span>{t('nextService.suggestionHeader')}</span>
            </div>
            {isAdmin && (
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-xs"
                  onClick={handleUseSuggestion}
                  disabled={busy}
                  id="btn-use-suggestion"
                >
                  <Check size={12} /> {t('nextService.useSuggestion')}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => void handleDiscardSuggestion()}
                  disabled={busy}
                  id="btn-discard-suggestion"
                >
                  <X size={12} /> {t('nextService.discardSuggestion')}
                </button>
              </div>
            )}
          </div>

          <div style={{ fontSize: '0.875rem', display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
            {serviceData.sugerido_fecha && (
              <div>
                <strong>{t('nextService.dateLabel')}:</strong> {formatDay(serviceData.sugerido_fecha, language)}
              </div>
            )}
            {serviceData.sugerido_millas !== null && serviceData.sugerido_millas !== undefined && (
              <div>
                <strong>{t('nextService.milesLabel')}:</strong> {numFmt.format(serviceData.sugerido_millas)} mi
              </div>
            )}
            {serviceData.sugerido_nota && (
              <div style={{ width: '100%' }}>
                <strong>{t('nextService.noteLabel')}:</strong> {serviceData.sugerido_nota}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Próximo servicio programado */}
      {isProgrammed ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 'var(--space-3)',
            }}
          >
            {serviceData.fecha && (
              <div className="card" style={{ padding: 'var(--space-3)', backgroundColor: 'var(--surface-sunken)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 4 }}>
                  <Calendar size={14} />
                  <span>{t('nextService.dateLabel')}</span>
                </div>
                <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>{formatDay(serviceData.fecha, language)}</div>
              </div>
            )}

            {serviceData.millas !== null && serviceData.millas !== undefined && (
              <div className="card" style={{ padding: 'var(--space-3)', backgroundColor: 'var(--surface-sunken)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 4 }}>
                  <Gauge size={14} />
                  <span>{t('nextService.milesLabel')}</span>
                </div>
                <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>{numFmt.format(serviceData.millas)} mi</div>
              </div>
            )}
          </div>

          {serviceData.nota && (
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              <strong>{t('nextService.noteLabel')}:</strong> {serviceData.nota}
            </div>
          )}

          {/* Enlace público /s/<código> */}
          {publicUrl && (
            <div style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ color: 'var(--text-muted)' }}>{t('nextService.publicUrlLabel')}:</span>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--primary)', wordBreak: 'break-all' }}
              >
                {publicUrl}
                <ExternalLink size={12} />
              </a>
            </div>
          )}

          {/* Acciones de administración */}
          {isAdmin && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() =>
                  onOpenModal({
                    fecha: serviceData.fecha,
                    millas: serviceData.millas,
                    nota: serviceData.nota,
                  })
                }
                disabled={busy}
                id="btn-edit-sticker"
              >
                <PenLine size={14} /> {t('nextService.editSticker')}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void handleDirectPrint()}
                disabled={busy || printing}
                id="btn-print-sticker"
              >
                <Printer size={14} /> {printing ? t('common.loading') : t('nextService.printSticker')}
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => void handleRemove()}
                disabled={busy}
                id="btn-remove-service"
              >
                <Trash2 size={14} /> {t('nextService.removeService')}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'center', padding: 'var(--space-4) 0' }}>
          <p style={{ color: 'var(--text-muted)', marginBottom: 'var(--space-3)' }}>
            {t('nextService.noServiceProgrammed')}
          </p>

          {isAdmin && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onOpenModal(null)}
              id="btn-program-service-empty"
            >
              <Tag size={14} /> {t('nextService.programButton')}
            </button>
          )}

          {!isAdmin && canSuggest && !hasSuggestion && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onOpenModal(null)}
              id="btn-suggest-service-empty"
            >
              <Lightbulb size={14} /> {t('nextService.suggestButton')}
            </button>
          )}
        </div>
      )}

      {/* Botón para sugerir si ya hay un servicio programado pero el técnico desea sugerir un ajuste */}
      {!isAdmin && canSuggest && (isProgrammed || hasSuggestion) && (
        <div style={{ marginTop: 'var(--space-2)', borderTop: '1px solid var(--border)', paddingTop: 'var(--space-3)' }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() =>
              onOpenModal({
                fecha: serviceData?.sugerido_fecha || serviceData?.fecha,
                millas: serviceData?.sugerido_millas ?? serviceData?.millas,
                nota: serviceData?.sugerido_nota || serviceData?.nota,
              })
            }
            id="btn-suggest-service-edit"
          >
            <Lightbulb size={14} /> {t('nextService.suggestButton')}
          </button>
        </div>
      )}
    </div>
  );
}
