import { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, ChevronDown, LogOut } from 'lucide-react';
import { t } from './language';

export type ParticipantAccountSignOut = (options: { redirectUrl: string }) => Promise<void>;

export function getParticipantAccountRedirectUrl(
  action: 'sign-out' | 'switch-account',
  basePath = import.meta.env.BASE_URL,
) {
  const prefix = basePath.replace(/\/+$/, '');
  return action === 'switch-account' ? `${prefix}/participant` : `${prefix}/`;
}

export function ParticipantAccountActions({ signOut, name }: { signOut: ParticipantAccountSignOut; name: string }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const lastItemRef = useRef<HTMLButtonElement>(null);
  const openFromEndRef = useRef(false);
  const initial = name.trim().charAt(0).toLocaleUpperCase() || 'U';

  useEffect(() => {
    if (!menuOpen) return;
    (openFromEndRef.current ? lastItemRef.current : firstItemRef.current)?.focus();
    openFromEndRef.current = false;
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [menuOpen]);

  const finishSession = async (action: 'sign-out' | 'switch-account') => {
    if (pending) return;
    setMenuOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
    setPending(true);
    setFailed(false);
    try {
      await signOut({ redirectUrl: getParticipantAccountRedirectUrl(action) });
    } catch {
      setPending(false);
      setFailed(true);
    }
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openFromEndRef.current = event.key === 'ArrowUp';
      setMenuOpen(true);
    }
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = [firstItemRef.current, lastItemRef.current].filter((item): item is HTMLButtonElement => item !== null);
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Escape') {
      event.preventDefault();
      setMenuOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      items[(current + direction + items.length) % items.length]?.focus();
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items.at(-1)?.focus();
    }
  };

  return (
    <div
      ref={rootRef}
      className="participant-account-actions"
      data-testid="participant-account-actions"
      aria-busy={pending}
      onBlur={event => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setMenuOpen(false);
      }}
    >
      {failed && <span className="participant-account-error" role="alert">{t('Sign out failed. Please try again.')}</span>}
      {pending && <span className="participant-account-status" role="status" aria-live="polite">{t('Signing out…')}</span>}
      <button
        type="button"
        ref={triggerRef}
        id="button-participant-account-menu"
        className="participant-account-menu-trigger"
        aria-label={`${t('Account menu')}: ${initial}`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls="participant-account-menu"
        onClick={() => setMenuOpen(value => !value)}
        onKeyDown={handleTriggerKeyDown}
        disabled={pending}
        data-testid="button-participant-account-menu"
      >
        <span aria-hidden="true">{initial}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <div
        id="participant-account-menu"
        className="participant-account-menu"
        role="menu"
        aria-labelledby="button-participant-account-menu"
        hidden={!menuOpen}
        onKeyDown={handleMenuKeyDown}
      >
        <button ref={firstItemRef} type="button" role="menuitem" onClick={() => void finishSession('sign-out')} disabled={pending} data-testid="button-participant-sign-out">
          <LogOut size={15} aria-hidden="true" />{t('Sign out')}
        </button>
        <button ref={lastItemRef} type="button" role="menuitem" onClick={() => void finishSession('switch-account')} disabled={pending} data-testid="button-participant-switch-account">
          <ArrowRightLeft size={15} aria-hidden="true" />{t('Switch account')}
        </button>
      </div>
    </div>
  );
}
