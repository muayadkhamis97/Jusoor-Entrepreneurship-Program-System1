import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetProgramTeamAssignmentsQueryKey,
  getListParticipantInvitationsQueryKey,
  useCreateParticipantInvitation,
  useGetProgramTeamAssignments,
} from '@workspace/api-client-react';
import { Check, CircleAlert, LoaderCircle, MailPlus, Users, X } from 'lucide-react';
import { AccessibleDialogSurface } from './accessible-dialog';
import { participantInvitationBody, participantsForBusiness } from './business-participants';
import { t, useAppLanguage } from './language';
import './business-participants.css';

type BusinessParticipantsDialogProps = {
  business: { id: number; businessName: string; programId: number };
  programName: string;
  isAdmin: boolean;
  onClose: () => void;
};

function responseError(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object' || !('data' in error)) return fallback;
  const data = error.data;
  return data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
    ? data.error
    : fallback;
}

export function BusinessParticipantsDialog({ business, programName, isAdmin, onClose }: BusinessParticipantsDialogProps) {
  useAppLanguage();
  const queryClient = useQueryClient();
  const assignments = useGetProgramTeamAssignments(business.programId, {
    query: {
      queryKey: getGetProgramTeamAssignmentsQueryKey(business.programId),
      refetchOnWindowFocus: true,
    },
  });
  const invite = useCreateParticipantInvitation();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null);
  const members = participantsForBusiness(assignments.data?.participants ?? [], business.id);
  const inviteError = invite.error;

  const submitInvitation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isAdmin || invite.isPending) return;
    const data = participantInvitationBody(email, displayName, business.id);
    invite.mutate({ data }, {
      onSuccess: () => {
        setInvitedEmail(data.email);
        setEmail('');
        setDisplayName('');
        void queryClient.invalidateQueries({ queryKey: getGetProgramTeamAssignmentsQueryKey(business.programId) });
        void queryClient.invalidateQueries({ queryKey: getListParticipantInvitationsQueryKey() });
      },
    });
  };

  return <AccessibleDialogSurface
    className="modal-card business-participants-dialog"
    labelledBy={`business-participants-title-${business.id}`}
    describedBy={`business-participants-description-${business.id}`}
    initialFocusSelector={`#business-participant-email-${business.id}`}
    onClose={onClose}
    testId={`dialog-business-participants-${business.id}`}
  >
    <div className="modal-head">
      <div>
        <div className="eyebrow">{t('BUSINESS / TEAM')}</div>
        <h2 id={`business-participants-title-${business.id}`} className="app-title">{t('Participants')}: {business.businessName}</h2>
        <p id={`business-participants-description-${business.id}`}>{t('People linked to this business in')} {programName}.</p>
      </div>
      <button type="button" className="icon-button" aria-label={t('Close dialog')} onClick={onClose} data-testid="button-close-business-participants"><X size={18} /></button>
    </div>
    <div className="business-participants-content">
      <section aria-labelledby={`business-roster-title-${business.id}`}>
        <div className="business-participants-heading">
          <h3 id={`business-roster-title-${business.id}`} className="app-title">{t('Business participants')}</h3>
          <span className="section-meta">{members.length}</span>
        </div>
        {assignments.isLoading ? <div className="business-participants-status"><LoaderCircle size={16} className="spin" />{t('Loading business participants…')}</div>
          : assignments.isError ? <div className="business-participants-error" role="alert">
            <CircleAlert size={16} />
            <span>{t(responseError(assignments.error, 'Participants could not load.'))}</span>
            <button type="button" className="button button-quiet" onClick={() => void assignments.refetch()} data-testid="button-retry-business-participants">{t('Retry')}</button>
          </div>
            : members.length === 0 ? <p className="business-participants-empty">{t('No participants are linked to this business yet.')}{!isAdmin && ` ${t('Ask an Admin to invite participants.')}`}</p>
              : <ul className="business-participant-list" data-testid={`business-participant-list-${business.id}`}>
                {members.map(member => <li key={member.applicationId}>
                  <span className="business-participant-avatar" aria-hidden="true">{member.founderName.trim().slice(0, 1).toLocaleUpperCase()}</span>
                  <span className="business-participant-identity"><strong>{member.founderName}</strong><small>{member.email}</small></span>
                </li>)}
              </ul>}
      </section>
      {isAdmin ? <section className="business-participant-invite" aria-labelledby={`business-invite-title-${business.id}`}>
          <div className="business-participants-heading">
            <h3 id={`business-invite-title-${business.id}`} className="app-title">{t('Invite a participant')}</h3>
            <MailPlus size={16} aria-hidden="true" />
          </div>
          <p className="business-participant-invite-copy">{t('The invitation will be for this business and its program.')}</p>
          {invitedEmail && <div className="business-participant-success" role="status" data-testid="business-participant-invite-success">
            <Check size={16} />
            <span>{t('Invitation sent to')} <strong>{invitedEmail}</strong>. {t('They can create an account or sign in using the same verified email address.')}</span>
          </div>}
          <form onSubmit={submitInvitation}>
            <div className="business-participant-invite-fields">
              <label className="field" htmlFor={`business-participant-email-${business.id}`}>
                <span>{t('Participant email')} <i aria-hidden="true">*</i></span>
                <input id={`business-participant-email-${business.id}`} className="form-control" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} data-testid="input-business-participant-email" />
              </label>
              <label className="field" htmlFor={`business-participant-name-${business.id}`}>
                <span>{t('Participant name (optional)')}</span>
                <input id={`business-participant-name-${business.id}`} className="form-control" type="text" autoComplete="name" value={displayName} onChange={event => setDisplayName(event.target.value)} data-testid="input-business-participant-name" />
              </label>
            </div>
            {inviteError && <div className="form-error" role="alert" data-testid="business-participant-invite-error"><CircleAlert size={16} />{t(responseError(inviteError, 'The participant invitation could not be saved.'))}</div>}
            <div className="modal-actions">
              <button className="button button-primary" type="submit" disabled={invite.isPending} data-testid="button-send-business-participant-invite">
                {invite.isPending ? <><LoaderCircle size={15} className="spin" />{t('Sending invitation…')}</> : <><MailPlus size={15} />{t('Send invitation')}</>}
              </button>
            </div>
          </form>
        </section>
        : <p className="business-participant-invite-copy">{t('Only Admins can invite participants.')}</p>}
    </div>
  </AccessibleDialogSurface>;
}
