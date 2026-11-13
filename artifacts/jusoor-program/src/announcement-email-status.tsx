import { useQueryClient } from '@tanstack/react-query';
import { getListAnnouncementsQueryKey, useRetryAnnouncementEmail, type AnnouncementEmailStatus } from '@workspace/api-client-react';
import { Button } from '@workspace/program-editorial/components/ui/button';
import { currentLanguage, t } from './language';

export function emailFailureLabel(kind: string): string {
  return ({
    quota: 'Gmail sending limit reached',
    needs_reconnect: 'Gmail connection or permission problem',
    invalid_recipient: 'Recipient address rejected',
    transient: 'Temporary Gmail failure',
    ambiguous: 'Delivery outcome unknown',
  } as Record<string, string>)[kind] ?? 'Email delivery failed';
}
export function emailOperationLabel(operation: string | null): string {
  return ({
    profile_lookup: 'Read connected mailbox',
    sent_message_lookup: 'Search sent mail',
    send: 'Send message',
  } as Record<string, string>)[operation ?? ''] ?? 'Email processing';
}

const stateLabels: Record<AnnouncementEmailStatus['state'], string> = {
  not_requested: 'Portal only — email not requested.',
  queued: 'Email queued for publication. Recipients are resolved when the message goes live.',
  processing: 'Email delivery in progress.',
  complete: 'Email processing complete.',
  needs_attention: 'Some email deliveries need attention.',
  paused: 'Email paused: the author no longer has access to this active program. An Admin must review their access.',
  quota_paused: 'Email paused: the daily Gmail sending limit was reached. Pending emails will resume automatically.',
  needs_reconnect: 'Email disconnected: reconnect the Gmail connection before pending emails can resume.',
  unavailable: 'Email status unavailable. The portal announcement is saved.',
};

export function announcementEmailStateMessage(state: AnnouncementEmailStatus['state']): string {
  return stateLabels[state];
}

export function AnnouncementEmailDelivery({ id, email }: { id: number; email?: AnnouncementEmailStatus }) {
  const client = useQueryClient();
  const retry = useRetryAnnouncementEmail();
  if (!email) return null;
  return <section className="recording-receipt-actions" aria-label={t('Announcement email delivery')} data-testid={`announcement-email-${id}`}>
    <p role="status">{t(announcementEmailStateMessage(email.state))}</p>
    {email.state === 'complete' && email.sent + email.pending + email.failed + email.uncertain + email.skipped === 0 &&
      <p>{t('No accepted participants matched this audience at publication. No emails were sent.')}</p>}
    {email.state !== 'not_requested' && email.state !== 'unavailable' && email.state !== 'queued' && <>
      <p>{t('Accepted by Gmail')}: {email.sent} · {t('Pending')}: {email.pending} · {t('Failed')}: {email.failed}{email.invalidRecipients > 0 ? ` · ${t('Invalid addresses')}: ${email.invalidRecipients}` : ''} · {t('Uncertain')}: {email.uncertain} · {t('Skipped')}: {email.skipped}</p>
      <small>{t('Accepted by Gmail does not confirm inbox delivery. Skipped recipients are no longer eligible.')}</small>
    </>}
    {email.invalidRecipients > 0 && <p className="form-error">{t('Some recipient addresses were rejected and will not be retried.')}</p>}
    {email.uncertain > 0 && <p className="form-error">{t('Delivery could not be confirmed. These attempts are held for staff review and cannot be retried here, to prevent duplicate emails.')}</p>}
    {email.nextRetryAt && <p>{t('Next connection check or retry')}: <time dateTime={email.nextRetryAt}>{new Date(email.nextRetryAt).toLocaleString(currentLanguage() === 'ar' ? 'ar-JO' : 'en')}</time></p>}
    {Boolean(email.failures?.length) && <details>
      <summary>{t('Delivery diagnostics')}</summary>
      <ul>{email.failures?.map(failure => <li key={failure.deliveryId}>
        {t('Delivery record')} #{failure.deliveryId}: {t(emailFailureLabel(failure.failureKind))} — {t(emailOperationLabel(failure.operation))}
        {failure.providerStatus !== null && ` · ${t('HTTP status')}: ${failure.providerStatus}`}
        {failure.reason && <> · {t('Provider reason')}: <code>{failure.reason}</code></>}
      </li>)}</ul>
    </details>}
    {email.canRetry && <Button type="button" variant="text" disabled={retry.isPending} data-testid={`retry-announcement-email-${id}`}
      onClick={() => retry.mutate({ id }, { onSuccess: () => { void client.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() }); } })}>
      {t(retry.isPending ? 'Queuing retry…' : 'Retry failed emails')}
    </Button>}
    {retry.isError && <p className="form-error" role="alert">{t('Email retry could not be queued. The portal announcement is unchanged.')}</p>}
  </section>;
}
