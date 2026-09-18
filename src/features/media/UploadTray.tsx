import { useEffect, useState } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronUp, Image as ImageIcon, Mic, RotateCcw, UploadCloud, Video, WifiOff, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import type { UploadItem } from '../../lib/media/uploadQueue';
import { useMediaUploads } from './mediaUploads.context';

const KIND_ICON = { foto: ImageIcon, video: Video, audio: Mic } as const;

/**
 * La bandeja de subidas: lo único que el técnico necesita saber de la cola.
 *
 * Aparece solo mientras hay algo en camino, flota por encima de la barra
 * inferior en el teléfono, y se puede plegar. Un error se queda con su botón de
 * reintentar hasta que alguien decida, porque un video que no subió es un video
 * que el cliente no va a ver.
 */
export default function UploadTray() {
  const { t } = useLanguage();
  const { items, online, retry, discard } = useMediaUploads();
  const [expanded, setExpanded] = useState(false);
  const busy = items.length > 0;

  // En el teléfono la bandeja flota por encima de la barra inferior, y `.page-content`
  // solo reserva la altura de esa barra: justo después de grabar un video, la bandeja
  // aparecía encima del botón "Agregar Avance" y no había forma de pulsarlo. Mismo
  // recurso que `drawer-open` en AppLayout: el <body> avisa y el CSS reserva sitio.
  useEffect(() => {
    if (!busy) return;
    document.body.classList.add('uploads-open');
    return () => document.body.classList.remove('uploads-open');
  }, [busy]);

  if (!busy) return null;

  const done = items.filter((i) => i.estado === 'listo').length;
  const failed = items.filter((i) => i.estado === 'error').length;
  const total = items.length;
  const overall = items.reduce((sum, i) => sum + i.progreso, 0) / total;

  const stateLabel = (item: UploadItem) => {
    switch (item.estado) {
      case 'pendiente':
        return item.intentos > 0 ? t('media.uploadRetrying') : t('media.uploadWaiting');
      case 'subiendo':
        return `${Math.round(item.progreso * 100)}%`;
      case 'guardando':
        return t('media.uploadSaving');
      case 'listo':
        return t('media.uploadDone');
      case 'error':
        return t('media.uploadFailed');
    }
  };

  return (
    <div className={`upload-tray ${failed ? 'has-errors' : ''}`} role="status" aria-live="polite">
      <button type="button" className="upload-tray-summary" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
        {!online ? <WifiOff size={18} /> : failed ? <AlertCircle size={18} /> : done === total ? <Check size={18} /> : <UploadCloud size={18} />}
        <span className="upload-tray-text">
          {t('media.uploadSummary').replace('{done}', String(done)).replace('{total}', String(total))}
          {failed > 0 && ` · ${t('media.uploadFailedCount').replace('{count}', String(failed))}`}
        </span>
        {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
      </button>
      <div className="progress-bar upload-tray-progress">
        <div className="progress-fill" style={{ width: `${Math.round(overall * 100)}%` }} />
      </div>

      {expanded && (
        <ul className="upload-tray-list">
          {!online && <li className="upload-tray-offline">{t('media.offline')}</li>}
          {items.map((item) => {
            const Icon = KIND_ICON[item.tipo];
            return (
              <li key={item.id} className={`upload-tray-item state-${item.estado}`}>
                <Icon size={16} />
                <div className="upload-tray-item-body">
                  <div className="upload-tray-item-title">
                    {item.numeroOrden || t('workOrders.title')} · {t(`media.kind.${item.tipo}`)}
                  </div>
                  <div className="upload-tray-item-state">{stateLabel(item)}</div>
                  {/* El motivo técnico, recortado: es lo que alguien de soporte
                      necesita para saber si es la red, un permiso o el límite
                      de tamaño (ver docs/multimedia-y-notificaciones.md). */}
                  {item.error && (item.estado === 'error' || item.intentos > 0) && (
                    <div className="upload-tray-item-error" title={item.error}>
                      {item.error.length > 90 ? `${item.error.slice(0, 90)}…` : item.error}
                    </div>
                  )}
                  {item.estado !== 'error' && item.estado !== 'listo' && (
                    <div className="progress-bar" style={{ height: 4 }}>
                      <div className="progress-fill" style={{ width: `${Math.round(item.progreso * 100)}%` }} />
                    </div>
                  )}
                </div>
                {item.estado === 'error' && (
                  <>
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => retry(item.id)} title={t('media.retry')} aria-label={t('media.retry')}>
                      <RotateCcw size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon"
                      onClick={() => {
                        if (confirm(t('media.discardConfirm'))) void discard(item.id);
                      }}
                      title={t('media.discard')}
                      aria-label={t('media.discard')}
                    >
                      <X size={14} />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
