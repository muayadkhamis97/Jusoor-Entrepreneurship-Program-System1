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
  const content = useRef<HTMLDivElement | null>(null);
  if (opener.current === null && typeof document !== 'undefined') {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement !== document.body) {
      opener.current = activeElement;
    }
  }
  useLayoutEffect(() => () => {
    const returnTarget = opener.current;
    if (!returnTarget?.isConnected) return;
    window.requestAnimationFrame(() => {
      if (returnTarget.isConnected) returnTarget.focus();
    });
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
            if (!initialFocusSelector) return;
            const initialTarget = content.current?.querySelector<HTMLElement>(initialFocusSelector);
            if (!initialTarget) return;
            event.preventDefault();
            initialTarget.focus();
          }}
          onCloseAutoFocus={event => {
            if (!opener.current?.isConnected) return;
            event.preventDefault();
            opener.current.focus();
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
