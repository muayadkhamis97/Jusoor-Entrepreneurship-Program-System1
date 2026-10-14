import { useState } from 'react';
import { ArrowRightLeft, LogOut } from 'lucide-react';
import { t } from './language';

export type ParticipantAccountSignOut = (options: { redirectUrl: string }) => Promise<void>;

export function getParticipantAccountRedirectUrl(
  action: 'sign-out' | 'switch-account',
  basePath = import.meta.env.BASE_URL,
) {
  const prefix = basePath.replace(/\/+$/, '');
  return action === 'switch-account' ? `${prefix}/participant` : `${prefix}/`;
}

export function ParticipantAccountActions({ signOut }: { signOut: ParticipantAccountSignOut }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const finishSession = async (action: 'sign-out' | 'switch-account') => {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await signOut({ redirectUrl: getParticipantAccountRedirectUrl(action) });
    } catch {
      setPending(false);
      setFailed(true);
    }
  };

  return (
    <div className="participant-account-actions" data-testid="participant-account-actions" aria-busy={pending}>
      {failed && <span className="participant-account-error" role="alert">{t('Sign out failed. Please try again.')}</span>}
      {pending && <span className="participant-account-status" role="status" aria-live="polite">{t('Signing out…')}</span>}
      <button
        type="button"
        className="button button-quiet"
        onClick={() => void finishSession('sign-out')}
        disabled={pending}
        data-testid="button-participant-sign-out"
      >
        <LogOut size={14} aria-hidden="true" />
        {t('Sign out')}
      </button>
      <button
        type="button"
        className="button button-outline"
        onClick={() => void finishSession('switch-account')}
        disabled={pending}
        data-testid="button-participant-switch-account"
      >
        <ArrowRightLeft size={14} aria-hidden="true" />
        {t('Switch account')}
      </button>
    </div>
  );
}
