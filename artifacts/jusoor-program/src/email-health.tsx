import { useState } from 'react';
import { useCheckEmailHealth, type EmailHealthStep } from '@workspace/api-client-react';
import { Button } from '@workspace/program-editorial/components/ui/button';
import { Dialog } from '@workspace/program-editorial/components/ui/dialog';
import { t } from './language';

const stepLabels: Record<EmailHealthStep['step'], string> = {
  profile: 'Read connected mailbox',
  lookup: 'Search sent mail',
  send: 'Send test message',
  metadata: 'Verify Message-ID',
};

export function emailHealthGuidance(step: EmailHealthStep): string {
  if (step.status === 'skipped') return 'Not run. A test email is optional and is sent only after the read checks pass.';
  if (step.status === 'ok') return 'This step passed.';
  if (step.failureKind === 'delivery_outcome_unknown') return 'The send outcome is unknown. Check Gmail Sent before attempting another test.';
  if (step.httpStatus === 403 && step.step === 'lookup') return 'Gmail is connected but missing permission to read mail. Reconnect the Gmail connector and tick all permission boxes.';
  if (step.httpStatus === 401 || step.httpStatus === 403) return 'Gmail authorization failed. Reconnect the Gmail connector and grant all requested permissions.';
  if (step.httpStatus === 429 || step.failureKind === 'gmail_quota') return 'Gmail is rate limited. Wait until the retry time before checking again.';
  if (!step.httpStatus) return 'The Gmail connector could not be reached. Check the connection and try again later.';
  return 'Gmail could not complete this step. Use the status and reason below to investigate.';
}

export function EmailHealth() {
  const [open, setOpen] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const check = useCheckEmailHealth({ mutation: { retry: false } });
  const [sendAttempted, setSendAttempted] = useState(false);
  const run = (sendTest: boolean) => {
    if (sendTest) setSendAttempted(true);
    check.mutate({ data: { sendTest, requestId } });
  };
  return <>
    <Button type="button" variant="secondary" onClick={() => setOpen(true)}>{t('Email health')}</Button>
    <Dialog open={open} onOpenChange={setOpen} title={t('Email health')}
      description={t('Check Gmail without sending email, or explicitly send one test to your own verified Admin email. No participant data is included.')}>
      <div className="recording-receipt-actions">
        <Button type="button" variant="secondary" disabled={check.isPending} onClick={() => run(false)}>{t('Check connection only')}</Button>
        <Button type="button" disabled={check.isPending || sendAttempted} onClick={() => run(true)}>{t('Send one test to my verified email')}</Button>
        {check.isPending && <p role="status" aria-busy="true">{t('Checking Gmail…')}</p>}
        {check.isError && <p role="alert">{t('Email health could not be checked. Verify your Admin email and try again. A test send is not retried automatically.')}</p>}
        {check.data && <div role="status">
          {check.data.steps.map(step => <section key={step.step}>
            <h3>{t(stepLabels[step.step])} — {t(step.status === 'ok' ? 'Passed' : step.status === 'failed' ? 'Failed' : 'Not run')}</h3>
            <p>{t(emailHealthGuidance(step))}</p>
            {step.httpStatus !== null && <p>{t('HTTP status')}: {step.httpStatus}</p>}
            {step.reason && <p>{t('Provider reason')}: <code>{step.reason}</code></p>}
          </section>)}
          {check.data.messageIdPreserved !== null && <p>{t(check.data.messageIdPreserved
            ? 'Gmail preserved the custom Message-ID.'
            : 'Gmail changed the custom Message-ID. Gmail receipt IDs are stored for accepted announcement emails.')}</p>}
        </div>}
        <Button type="button" variant="text" onClick={() => setOpen(false)}>{t('Close')}</Button>
      </div>
    </Dialog>
  </>;
}
