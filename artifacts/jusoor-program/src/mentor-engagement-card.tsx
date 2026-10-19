import { useRef, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetMentorDashboardQueryKey, useUpdateAssignedMentoring,
  type MentorEngagement, type MentorEngagementUpdate,
} from '@workspace/api-client-react';
import { Button } from '@workspace/program-editorial/components/ui/button';
import { t, useAppLanguage } from './language';

export type MentorEngagementDraft = { date: string; status: string; notes: string };
const label = (value: string) => t(value.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()));

export function MentorEngagementCard({ item, draft, onDraftChange }: {
  item: MentorEngagement;
  draft: MentorEngagementDraft;
  onDraftChange: (draft: MentorEngagementDraft) => void;
}) {
  useAppLanguage();
  const client = useQueryClient();
  // Hook instances belong to a keyed card, not the list. Concurrent saves on
  // different cards must not share pending, error or success state.
  const update = useUpdateAssignedMentoring();
  const submitting = useRef(false);
  const change = (next: Partial<MentorEngagementDraft>) => {
    update.reset();
    onDraftChange({ ...draft, ...next });
  };
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const data: MentorEngagementUpdate = {
      scheduledDate: draft.date || null,
      status: draft.status as MentorEngagementUpdate['status'],
      notes: draft.notes.trim() || null,
    };
    update.mutate({ id: item.id, data }, {
      onSuccess: () => { void client.invalidateQueries({ queryKey: getGetMentorDashboardQueryKey() }); },
      onSettled: () => { submitting.current = false; },
    });
  };
  return <article className="answer-card mentor-card" data-testid={`card-mentor-engagement-${item.id}`}>
    <div className="answer-meta">
      <div><b>{item.founderName} · {item.businessName}</b><span>{item.programName} · {label(item.type)}</span></div>
      <span className={`badge badge-${item.status === 'completed' ? 'good' : 'warm'}`}><span />{label(item.status)}</span>
    </div>
    <h3>{item.topic}</h3><p className="mentor-provider">{item.provider}</p>
    <form className="role-form-grid compact" onSubmit={save} aria-busy={update.isPending}>
      <label className="field">{t('Next meeting')}
        <input className="form-control" type="date" value={draft.date} disabled={update.isPending} onChange={event => change({ date: event.target.value })} data-testid={`input-mentor-date-${item.id}`} />
      </label>
      <label className="field">{t('Engagement status')}
        <select className="form-control" value={draft.status} disabled={update.isPending} onChange={event => change({ status: event.target.value })} data-testid={`select-mentor-status-${item.id}`}>
          <option value="requested">{t('Requested')}</option><option value="matched">{t('Matched')}</option><option value="scheduled">{t('Scheduled')}</option><option value="completed">{t('Completed')}</option>
        </select>
      </label>
      <label className="field field-wide">{t('Working notes')}
        <textarea className="form-control" rows={3} value={draft.notes} disabled={update.isPending} onChange={event => change({ notes: event.target.value })} placeholder={t('Capture agreed actions and useful context.')} data-testid={`input-mentor-notes-${item.id}`} />
      </label>
      <div className="field-wide">
        {update.isError && <p className="form-error" role="alert" data-testid={`error-mentor-engagement-${item.id}`}>{t('Could not update this engagement.')}</p>}
        {update.isSuccess && <p role="status" data-testid={`success-mentor-engagement-${item.id}`}>{t('Engagement saved.')}</p>}
        <Button className="button button-primary" type="submit" disabled={update.isPending} data-testid={`button-save-mentor-${item.id}`}>{update.isPending ? t('Saving…') : t('Save engagement')}</Button>
      </div>
    </form>
  </article>;
}
