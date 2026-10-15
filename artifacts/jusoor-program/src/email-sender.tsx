import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Copy, LoaderCircle, Mail, RotateCw, Unplug } from 'lucide-react';
import {
  getGetEmailSenderStatusQueryKey,
  useDisconnectGmailSender,
  useGetEmailSenderStatus,
  useStartGmailSenderConnection,
} from '@workspace/api-client-react';
import { t, useAppLanguage } from './language';

export function EmailSenderPanel() {
  const { language } = useAppLanguage();
  const queryClient = useQueryClient();
  const statusQuery = useGetEmailSenderStatus({
    query: { queryKey: getGetEmailSenderStatusQueryKey(), refetchOnWindowFocus: true },
  });
  const startConnection = useStartGmailSenderConnection();
  const disconnectConnection = useDisconnectGmailSender();
  const [message, setMessage] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('gmailSender');
    if (!result) return;
    setMessage(
      result === 'connected'
        ? t('Gmail sender connected.')
        : result === 'cancelled'
          ? t('Gmail connection was cancelled.')
          : t('Gmail connection could not be completed. Check the setup and try again.'),
    );
    void statusQuery.refetch();
    url.searchParams.delete('gmailSender');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, [statusQuery.refetch]);

  const connect = () => {
    setMessage('');
    startConnection.mutate({ data: { returnPath: window.location.pathname } }, {
      onSuccess: ({ authorizationUrl }) => window.location.assign(authorizationUrl),
      onError: () => setMessage(t('Gmail connection could not be started. Check the setup and try again.')),
    });
  };

  const disconnect = () => {
    setMessage('');
    disconnectConnection.mutate(undefined, {
      onSuccess: () => {
        setConfirmDisconnect(false);
        setMessage(t('Gmail sender disconnected. The existing sender will be used if configured.'));
        void queryClient.invalidateQueries({ queryKey: getGetEmailSenderStatusQueryKey() });
      },
      onError: () => setMessage(t('The Gmail sender could not be disconnected. Try again.')),
    });
  };

  const copyCallbackUrl = async () => {
    const callbackUrl = statusQuery.data?.callbackUrl;
    if (!callbackUrl) return;
    try {
      await navigator.clipboard.writeText(callbackUrl);
      setMessage(t('Redirect URL copied.'));
    } catch {
      setMessage(t('Clipboard access was blocked. Select and copy the redirect URL manually.'));
    }
  };

  const status = statusQuery.data;
  const locale = language === 'ar' ? 'ar-JO' : 'en-GB';

  return (
    <section className="api-email-sender-panel" aria-labelledby="email-sender-title" data-testid="email-sender-panel">
      <div className="api-email-sender-heading">
        <div className="api-email-sender-icon"><Mail size={18} aria-hidden="true" /></div>
        <div>
          <div className="api-eyebrow">{t('AUTOMATED EMAIL')}</div>
          <h2 id="email-sender-title">{t('Email sender')}</h2>
          <p>{t('Connect one Gmail account to send platform notifications and reminders.')}</p>
        </div>
      </div>

      {statusQuery.isLoading && <div className="api-notice" role="status"><LoaderCircle size={16} />{t('Loading email sender settings…')}</div>}
      {statusQuery.isError && <div className="api-notice api-notice-error" role="alert">
        <AlertTriangle size={16} />
        <span>{t('Email sender settings could not be loaded.')}</span>
        <button type="button" className="api-text-button" onClick={() => void statusQuery.refetch()}>{t('Retry')}</button>
      </div>}

      {status && (
        <>
          <div className={`api-email-sender-status ${status.connected ? 'is-connected' : ''}`} role="status" data-testid="email-sender-status">
            <span className="api-email-sender-status-icon">{status.connected ? <Check size={16} /> : <Mail size={16} />}</span>
            <div>
              <strong>{status.connected ? t('Gmail is connected') : t('Gmail is not connected')}</strong>
              <span>{status.connected && status.accountEmail
                ? status.accountEmail
                : t('Until connected, email continues through the existing sender when configured.')}</span>
              {status.connectedAt && <small>{t('Connected')} · {new Date(status.connectedAt).toLocaleString(locale)}</small>}
            </div>
          </div>

          {!status.storageReady && <div className="api-notice api-notice-error" role="alert">
            <AlertTriangle size={16} />
            {t('Email sender storage is not ready. Apply the additive sender migration before connecting Gmail.')}
          </div>}

          {!status.clientConfigured && <div className="api-email-sender-setup">
            <strong>{t('Google OAuth setup is required')}</strong>
            <ol>
              <li>{t('Enable the Gmail API for a Google Cloud project and create a Web application OAuth client.')}</li>
              <li>{t('Add this exact redirect URL to the OAuth client:')}</li>
              <li>{t('Save the OAuth client ID and client secret in workspace Secrets, then reload this page.')}</li>
            </ol>
            {status.callbackUrl
              ? <div className="api-email-sender-callback">
                <code dir="ltr">{status.callbackUrl}</code>
                <button type="button" className="api-icon-button" onClick={() => void copyCallbackUrl()} aria-label={t('Copy redirect URL')} title={t('Copy redirect URL')}><Copy size={15} /></button>
              </div>
              : <div className="api-inline-error" role="alert"><AlertTriangle size={15} />{t('Open this page from the approved app address to get its redirect URL.')}</div>}
          </div>}

          {message && <div className="api-email-sender-feedback" role="status" data-testid="email-sender-feedback">{message}</div>}

          <div className="api-email-sender-actions">
            {status.connected ? (
              <>
                <button
                  type="button"
                  className="api-button api-button-primary"
                  onClick={connect}
                  disabled={!status.clientConfigured || !status.storageReady || startConnection.isPending}
                >
                  {startConnection.isPending ? <><LoaderCircle size={15} />{t('Starting connection…')}</> : <><RotateCw size={15} />{t('Reauthorize Gmail')}</>}
                </button>
                {confirmDisconnect ? <>
                <span>{t('Disconnecting removes saved access and returns new email to the existing sender, if configured.')}</span>
                <button type="button" className="api-button api-button-quiet" onClick={() => setConfirmDisconnect(false)} disabled={disconnectConnection.isPending}>{t('Cancel')}</button>
                <button type="button" className="api-button api-button-danger" onClick={disconnect} disabled={disconnectConnection.isPending}>
                  {disconnectConnection.isPending ? <><LoaderCircle size={15} />{t('Disconnecting…')}</> : <><Unplug size={15} />{t('Confirm disconnect')}</>}
                </button>
              </> : <button type="button" className="api-button api-button-quiet" onClick={() => setConfirmDisconnect(true)} disabled={disconnectConnection.isPending}>
                <Unplug size={15} />{t('Disconnect Gmail')}
              </button>}
              </>
            ) : <button
              type="button"
              className="api-button api-button-primary"
              onClick={connect}
              disabled={!status.clientConfigured || !status.storageReady || startConnection.isPending}
              data-testid="button-connect-gmail"
            >
              {startConnection.isPending ? <><LoaderCircle size={15} />{t('Starting connection…')}</> : <><Mail size={15} />{t('Connect Gmail')}</>}
            </button>}
            <button type="button" className="api-button api-button-quiet" onClick={() => void statusQuery.refetch()} disabled={statusQuery.isFetching}>
              <RotateCw size={15} className={statusQuery.isFetching ? 'api-spinning' : undefined} />{t('Refresh status')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
