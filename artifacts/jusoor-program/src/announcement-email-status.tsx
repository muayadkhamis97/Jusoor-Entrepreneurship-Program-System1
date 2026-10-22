import { useQueryClient } from '@tanstack/react-query';
import { getListAnnouncementsQueryKey, useRetryAnnouncementEmail, type AnnouncementEmailStatus } from '@workspace/api-client-react';
import { Button } from '@workspace/program-editorial/components/ui/button';
import { t } from './language';

const stateLabels: Record<AnnouncementEmailStatus['state'], string> = {
  not_requested: 'Portal only — email not requested.',
  queued: 'Email queued for publication. Recipients are resolved when the message goes live.',
  processing: 'Email delivery in progress.',
  complete: 'Email processing complete.',
  needs_attention: 'Some email deliveries need attention.',
  paused: 'Email paused: the author no longer has access to this active program. An Admin must review their access.',
  unavailable: 'Email status unavailable. The portal announcement is saved.',
};

export function AnnouncementEmailDelivery({ id, email }: { id: number; email?: AnnouncementEmailStatus }) {
  const client = useQueryClient();
  const retry = useRetryAnnouncementEmail();
  if (!email) return null;
  return <section className="recording-receipt-actions" aria-label={t('Announcement email delivery')} data-testid={`announcement-email-${id}`}>
    <p role="status">{t(stateLabels[email.state])}</p>
    {email.state === 'complete' && email.sent + email.pending + email.failed + email.uncertain + email.skipped === 0 &&
      <p>{t('No accepted participants matched this audience at publication. No emails were sent.')}</p>}
    {email.state !== 'not_requested' && email.state !== 'unavailable' && email.state !== 'queued' && <>
      <p>{t('Accepted by Gmail')}: {email.sent} · {t('Pending')}: {email.pending} · {t('Failed')}: {email.failed} · {t('Uncertain')}: {email.uncertain} · {t('Skipped')}: {email.skipped}</p>
      <small>{t('Accepted by Gmail does not confirm inbox delivery. Skipped recipients are no longer eligible.')}</small>
    </>}
    {email.uncertain > 0 && <p className="form-error">{t('Delivery could not be confirmed. These attempts are held for staff review and cannot be retried here, to prevent duplicate emails.')}</p>}
    {email.canRetry && <Button type="button" variant="text" disabled={retry.isPending} data-testid={`retry-announcement-email-${id}`}
      onClick={() => retry.mutate({ id }, { onSuccess: () => { void client.invalidateQueries({ queryKey: getListAnnouncementsQueryKey() }); } })}>
      {t(retry.isPending ? 'Queuing retry…' : 'Retry failed emails')}
    </Button>}
    {retry.isError && <p className="form-error" role="alert">{t('Email retry could not be queued. The portal announcement is unchanged.')}</p>}
  </section>;
}
