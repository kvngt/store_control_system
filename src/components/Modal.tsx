import { useEffect, useId, useRef } from 'react';
import type {
  CSSProperties,
  FormEventHandler,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  RefObject,
} from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../context/language.context';
import BodyPortal from './BodyPortal';
import { useEscapeLayer } from './escapeLayer';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) =>
      !el.hasAttribute('disabled') &&
      !el.closest('[hidden], [aria-hidden="true"]') &&
      el.tabIndex >= 0
  );
}

export interface ModalProps {
  onClose: () => void;
  title: ReactNode;
  titleId?: string;
  children: ReactNode;
  footer?: ReactNode;
  headerExtra?: ReactNode;
  size?: 'md' | 'lg';
  className?: string;
  style?: CSSProperties;
  overlayStyle?: CSSProperties;
  closeDisabled?: boolean;
  closeOnBackdrop?: boolean;
  role?: 'dialog' | 'alertdialog';
  ariaDescribedBy?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  as?: 'div' | 'form';
  onSubmit?: FormEventHandler<HTMLFormElement>;
  noValidate?: boolean;
  usePortal?: boolean;
  bodyClassName?: string;
  bodyStyle?: CSSProperties;
  footerClassName?: string;
  footerStyle?: CSSProperties;
}

/**
 * Shared accessible modal container handling backdrop dismissal, stacked
 * Escape handling, focus placement, focus trapping and focus restoration.
 */
export default function Modal({
  onClose,
  title,
  titleId,
  children,
  footer,
  headerExtra,
  size = 'md',
  className,
  style,
  overlayStyle,
  closeDisabled = false,
  closeOnBackdrop = true,
  role = 'dialog',
  ariaDescribedBy,
  initialFocusRef,
  as = 'div',
  onSubmit,
  noValidate,
  usePortal = false,
  bodyClassName,
  bodyStyle,
  footerClassName,
  footerStyle,
}: ModalProps) {
  const { t } = useLanguage();
  const autoTitleId = useId();
  const resolvedTitleId = titleId ?? autoTitleId;

  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const initialFocusRefLatest = useRef(initialFocusRef);
  initialFocusRefLatest.current = initialFocusRef;

  useEscapeLayer(overlayRef, () => {
    if (!closeDisabled) onClose();
  });

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;

    if (initialFocusRefLatest.current?.current) {
      initialFocusRefLatest.current.current.focus();
    } else if (dialog) {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const alreadyFocusedControl =
        active &&
        active !== dialog &&
        active !== closeBtnRef.current &&
        dialog.contains(active);
      if (!alreadyFocusedControl) {
        const bodyControls = bodyRef.current ? getFocusableElements(bodyRef.current) : [];
        const footerControls = footerRef.current ? getFocusableElements(footerRef.current) : [];
        const target = bodyControls[0] ?? footerControls[0] ?? dialog;
        target.focus();
      }
    }

    return () => {
      if (previousFocus && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  const handleBackdropClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!closeDisabled && closeOnBackdrop && e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusables = getFocusableElements(dialog);
    if (focusables.length === 0) {
      e.preventDefault();
      return;
    }

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (e.shiftKey) {
      if (!active || active === first || active === dialog || !dialog.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (!active || active === last || !dialog.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const modalClasses = ['modal', size === 'lg' ? 'modal-lg' : '', className].filter(Boolean).join(' ');
  const bodyClasses = ['modal-body', bodyClassName].filter(Boolean).join(' ');
  const footerClasses = ['modal-footer', footerClassName].filter(Boolean).join(' ');

  const innerContent = (
    <>
      <div className="modal-header">
        <h2 className="modal-title" id={resolvedTitleId}>
          {title}
        </h2>
        {headerExtra}
        <button
          ref={closeBtnRef}
          type="button"
          className="modal-close"
          onClick={closeDisabled ? undefined : onClose}
          disabled={closeDisabled}
          aria-label={t('common.close')}
        >
          <X size={20} />
        </button>
      </div>
      <div ref={bodyRef} className={bodyClasses} style={bodyStyle}>
        {children}
      </div>
      {footer != null && footer !== false && (
        <div ref={footerRef} className={footerClasses} style={footerStyle}>
          {footer}
        </div>
      )}
    </>
  );

  const modalTree = (
    <div
      ref={overlayRef}
      className="modal-overlay"
      style={overlayStyle}
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className={modalClasses}
        style={style}
        role={role}
        aria-modal="true"
        aria-labelledby={resolvedTitleId}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {as === 'form' ? (
          <form onSubmit={onSubmit} noValidate={noValidate}>
            {innerContent}
          </form>
        ) : (
          innerContent
        )}
      </div>
    </div>
  );

  return usePortal ? <BodyPortal>{modalTree}</BodyPortal> : modalTree;
}
