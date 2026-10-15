import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { t } from './language';

type AccessibleDialogSurfaceProps = {
  children: ReactNode;
  className: string;
  labelledBy: string;
  describedBy?: string;
  onClose: () => void;
  initialFocusSelector?: string;
  role?: 'dialog' | 'alertdialog';
  closeOnOutsideInteraction?: boolean;
  closeOnEscape?: boolean;
  onDismissAttempt?: () => void;
  overlayClassName?: string;
  testId?: string;
};

export function AccessibleDialogSurface({
  children,
  className,
  labelledBy,
  describedBy,
  onClose,
  initialFocusSelector,
  role = 'dialog',
  closeOnOutsideInteraction = true,
  closeOnEscape = true,
  onDismissAttempt,
  overlayClassName,
  testId,
}: AccessibleDialogSurfaceProps) {
  const opener = useRef<HTMLElement | null>(null);
  const capturedOpener = useRef(false);
  const restoreFrame = useRef<number | null>(null);
  const content = useRef<HTMLDivElement | null>(null);

  const focusTarget = (target: HTMLElement | null): boolean => {
    if (
      !target?.isConnected ||
      target.matches(':disabled') ||
      target.closest('[inert], [aria-hidden="true"]')
    ) return false;
    const style = window.getComputedStyle(target);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (!target.hasAttribute('tabindex') && !target.matches('button, input, select, textarea, a[href]')) {
      target.setAttribute('tabindex', '-1');
    }
    target.focus({ preventScroll: true });
    return document.activeElement === target;
  };

  const restoreFocus = (closingContent: HTMLDivElement | null) => {
    if (restoreFrame.current !== null) return;
    let attempts = 0;
    const restoreAfterPortalCleanup = () => {
      restoreFrame.current = null;
      if (focusTarget(opener.current)) return;

      const remainingDialogs = Array.from(document.querySelectorAll<HTMLElement>(
        '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]',
      )).filter(dialog => {
        if (dialog === closingContent || !dialog.isConnected || dialog.closest('[inert], [aria-hidden="true"]')) return false;
        const style = window.getComputedStyle(dialog);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      let restored = false;
      for (const dialog of remainingDialogs.reverse()) {
        const preferred = dialog.querySelector<HTMLElement>(
          '[data-dialog-autofocus], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        );
        if (focusTarget(preferred) || focusTarget(dialog)) {
          restored = true;
          break;
        }
      }

      const activeElement = document.activeElement;
      if (
        !restored &&
        activeElement instanceof HTMLElement &&
        activeElement !== document.body &&
        activeElement.isConnected &&
        !closingContent?.contains(activeElement) &&
        !activeElement.closest('[inert], [aria-hidden="true"]')
      ) return;

      if (!restored) {
        const fallbackTargets = document.querySelectorAll<HTMLElement>(
          '[data-dialog-focus-fallback], main, [role="main"]',
        );
        for (const target of fallbackTargets) {
          if (focusTarget(target)) {
            restored = true;
            break;
          }
        }
      }
      if (!restored && attempts < 4) {
        attempts += 1;
        restoreFrame.current = window.requestAnimationFrame(restoreAfterPortalCleanup);
      }
    };
    restoreFrame.current = window.requestAnimationFrame(restoreAfterPortalCleanup);
  };

  useLayoutEffect(() => {
    const mountedContent = content.current;
    return () => restoreFocus(mountedContent);
  }, []);

  return (
    <DialogPrimitive.Root open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlayClassName || 'modal-backdrop'} />
        <DialogPrimitive.Content
          ref={content}
          className={`${className} dialog-content-positioned`}
          role={role}
          aria-modal="true"
          aria-labelledby={labelledBy}
          aria-describedby={describedBy}
          data-testid={testId}
          onOpenAutoFocus={event => {
            if (!capturedOpener.current) {
              capturedOpener.current = true;
              const activeElement = document.activeElement;
              if (activeElement instanceof HTMLElement && activeElement !== document.body && !content.current?.contains(activeElement)) {
                opener.current = activeElement;
              }
            }
            if (!initialFocusSelector) return;
            const initialTarget = content.current?.querySelector<HTMLElement>(initialFocusSelector);
            if (!initialTarget) return;
            event.preventDefault();
            initialTarget.focus();
          }}
          onCloseAutoFocus={event => {
            event.preventDefault();
            restoreFocus(event.currentTarget as HTMLDivElement);
          }}
          onPointerDownOutside={event => {
            if (!closeOnOutsideInteraction) {
              event.preventDefault();
              onDismissAttempt?.();
            }
          }}
          onEscapeKeyDown={event => {
            if (!closeOnEscape) {
              event.preventDefault();
              onDismissAttempt?.();
            }
          }}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function UnsavedChangesDialog({
  onKeepEditing,
  onDiscard,
}: {
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  return <AccessibleDialogSurface
    className="confirm-card unsaved-changes-card"
    role="alertdialog"
    labelledBy="unsaved-changes-title"
    describedBy="unsaved-changes-description"
    initialFocusSelector="[data-dialog-autofocus]"
    onClose={onKeepEditing}
    closeOnOutsideInteraction={false}
    testId="dialog-discard-changes"
  >
    <h2 id="unsaved-changes-title" className="app-title">{t('Discard unsaved changes?')}</h2>
    <p id="unsaved-changes-description">{t('Your changes have not been saved. Leave this editor and discard them?')}</p>
    <div className="modal-actions">
      <button type="button" className="button button-quiet" data-dialog-autofocus onClick={onKeepEditing}>{t('Keep editing')}</button>
      <button type="button" className="button button-danger" onClick={onDiscard}>{t('Discard changes')}</button>
    </div>
  </AccessibleDialogSurface>;
}
