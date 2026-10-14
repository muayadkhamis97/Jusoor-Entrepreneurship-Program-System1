import * as DialogPrimitive from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { useLayoutEffect, useRef } from 'react';

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
        <DialogPrimitive.Overlay className="modal-backdrop" />
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
            if (!closeOnOutsideInteraction) event.preventDefault();
          }}
          onEscapeKeyDown={event => {
            if (!closeOnEscape) event.preventDefault();
          }}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
