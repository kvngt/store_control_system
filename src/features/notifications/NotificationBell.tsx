import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, X } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { useToast } from '../../context/toast.context';
import { useUnsavedChanges } from '../../context/unsavedChanges.context';
import type { AppNotification } from '../../types/database';
import { relativeTime, renderNotification } from './renderNotification';
import { useNotifications } from './useNotifications';

/**
 * La campana del encabezado.
 *
 * Un aviso que llega con la app abierta aparece también como toast: la campana
 * es fácil de no ver en un teléfono, y "te asignaron una orden" es justo el tipo
 * de cosa que no debería esperar a que alguien la mire.
 */
export default function NotificationBell() {
  const { t, language } = useLanguage();
  const { showToast } = useToast();
  const { confirmNavigation } = useUnsavedChanges();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { items, unreadCount, loading, markRead, markAllRead } = useNotifications({
    onArrive: (notification) => {
      const { title, body } = renderNotification(notification, t);
      showToast('success', title, body);
    },
  });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openNotification = (notification: AppNotification) => {
    if (!confirmNavigation()) return;
    if (!notification.leida_en) void markRead(notification.id);
    setOpen(false);
    if (notification.url) navigate(notification.url);
  };

  const badge = unreadCount > 99 ? '99+' : String(unreadCount);

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button
        type="button"
        className="header-notification"
        id="notifications-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={unreadCount ? t('notifications.unreadLabel').replace('{count}', badge) : t('notifications.title')}
      >
        <Bell size={20} />
        {unreadCount > 0 && <span className="header-notification-count">{badge}</span>}
      </button>

      {open && (
        <div className="notif-dropdown" role="dialog" aria-label={t('notifications.title')}>
          <div className="notif-dropdown-header">
            <span>{t('notifications.title')}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {unreadCount > 0 && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void markAllRead()}>
                  <CheckCheck size={14} /> {t('notifications.markAllRead')}
                </button>
              )}
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label={t('common.close')}>
                <X size={16} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="search-dropdown-empty">{t('common.loading')}</div>
          ) : items.length === 0 ? (
            <div className="search-dropdown-empty">{t('notifications.empty')}</div>
          ) : (
            <ul className="notif-list">
              {items.map((notification) => {
                const { title, body } = renderNotification(notification, t);
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      className={'notif-dropdown-item' + (notification.leida_en ? '' : ' is-unread')}
                      onClick={() => openNotification(notification)}
                    >
                      <span className="notif-dot" aria-hidden="true" />
                      <div style={{ minWidth: 0 }}>
                        <div className="notif-dropdown-item-title">{title}</div>
                        {body && <div className="notif-dropdown-item-sub">{body}</div>}
                        <div className="notif-time">{relativeTime(notification.creado_en, language)}</div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
