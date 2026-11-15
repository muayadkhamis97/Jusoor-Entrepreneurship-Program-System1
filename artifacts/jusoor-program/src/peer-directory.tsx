import { useEffect, useId, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetParticipantPeerDirectoryQueryKey,
  useGetParticipantPeerDirectory,
  useUpdateParticipantPeerDirectoryPreferences,
} from '@workspace/api-client-react';
import type {
  ParticipantPeerDirectoryPreferences,
  ParticipantPeerDirectoryPeer,
} from '@workspace/api-client-react';
import { Mail, Phone, Users } from 'lucide-react';
import { t } from './language';
import './peer-directory.css';

const hiddenPreferences: ParticipantPeerDirectoryPreferences = {
  isListed: false,
  shareEmail: false,
  sharePhone: false,
};

export function ParticipantPeerDirectory({ programId }: { programId: number }) {
  const contactHelpId = `peer-directory-contact-help-${useId()}`;
  const queryClient = useQueryClient();
  const query = useGetParticipantPeerDirectory(programId, {
    query: {
      queryKey: getGetParticipantPeerDirectoryQueryKey(programId),
      refetchOnWindowFocus: true,
    },
  });
  const save = useUpdateParticipantPeerDirectoryPreferences();
  const [preferences, setPreferences] = useState(hiddenPreferences);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (query.data) setPreferences(query.data.preferences);
  }, [query.data]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback('');
    save.mutate(
      { programId, data: preferences },
      {
        onSuccess: (saved) => {
          setPreferences(saved);
          setFeedback(t('Your directory preferences were saved.'));
          void queryClient.invalidateQueries({
            queryKey: getGetParticipantPeerDirectoryQueryKey(programId),
          });
        },
      },
    );
  };

  return (
    <section className="participant-section peer-directory" data-testid={`peer-directory-${programId}`}>
      <div className="participant-section-head">
        <div>
          <h2>{t('Founder peer directory')}</h2>
          <p>{t('Meet founders who opted in to connect with your cohort.')}</p>
        </div>
        <Users size={18} aria-hidden="true" />
      </div>

      {query.isLoading ? <p className="peer-directory-message">{t('Loading peer directory…')}</p>
        : query.isError ? <div className="peer-directory-message" role="alert">
          <span>{t('The peer directory could not be loaded. Try again.')}</span>
          <button type="button" className="button button-outline" onClick={() => void query.refetch()}>{t('Retry connection')}</button>
        </div>
          : <>
            <form className="participant-card peer-directory-preferences" onSubmit={submit}>
              <p>{t('Your profile is hidden by default. Choose whether to appear in this program’s peer directory.')}</p>
              <label className="peer-directory-option">
                <input
                  type="checkbox"
                  checked={preferences.isListed}
                  onChange={event => setPreferences(event.target.checked
                    ? { ...preferences, isListed: true }
                    : { isListed: false, shareEmail: false, sharePhone: false })}
                  data-testid={`checkbox-peer-listed-${programId}`}
                />
                <span>{t('Appear in this cohort’s directory')}</span>
              </label>
              <label className={`peer-directory-option${preferences.isListed ? '' : ' is-disabled'}`}>
                <input
                  type="checkbox"
                  checked={preferences.shareEmail}
                  disabled={!preferences.isListed}
                  aria-describedby={!preferences.isListed ? contactHelpId : undefined}
                  onChange={event => setPreferences(current => ({ ...current, shareEmail: event.target.checked }))}
                  data-testid={`checkbox-peer-email-${programId}`}
                />
                <span>{t('Share my email with peers')}</span>
              </label>
              <label className={`peer-directory-option${preferences.isListed ? '' : ' is-disabled'}`}>
                <input
                  type="checkbox"
                  checked={preferences.sharePhone}
                  disabled={!preferences.isListed}
                  aria-describedby={!preferences.isListed ? contactHelpId : undefined}
                  onChange={event => setPreferences(current => ({ ...current, sharePhone: event.target.checked }))}
                  data-testid={`checkbox-peer-phone-${programId}`}
                />
                <span>{t('Share my phone with peers')}</span>
              </label>
              {!preferences.isListed && <p id={contactHelpId} className="peer-directory-helper">{t('Turn on directory listing first to share your contact details.')}</p>}
              <div className="peer-directory-actions">
                <button className="button button-primary" type="submit" disabled={save.isPending} data-testid={`button-save-peer-preferences-${programId}`}>
                  {save.isPending ? t('Saving preferences…') : t('Save directory preferences')}
                </button>
                {feedback && <span role="status" className="role-success">{feedback}</span>}
                {save.isError && <span role="alert" className="form-error">{t('Your directory preferences could not be saved. Try again.')}</span>}
              </div>
            </form>

            <div className="participant-card peer-directory-list">
              <h3>{query.data?.programName}</h3>
              {!query.data?.peers.length
                ? <p className="session-info">{t('No peers have opted in yet. You can check back later.')}</p>
                : query.data.peers.map((peer: ParticipantPeerDirectoryPeer, index: number) => (
                  <article className="peer-directory-person" key={`${peer.businessName}-${index}`}>
                    <div className="peer-directory-person-copy">
                      <b>{peer.founderName}</b>
                      <span>{peer.businessName}</span>
                      {peer.industry && <small>{t('Industry')}: {peer.industry}</small>}
                    </div>
                    <div className="peer-directory-contact">
                      {peer.email && <a href={`mailto:${peer.email}`} aria-label={`${t('Email')} ${peer.founderName}`}><Mail size={14} />{peer.email}</a>}
                      {peer.phone && <a href={`tel:${peer.phone}`} aria-label={`${t('Phone')} ${peer.founderName}`}><Phone size={14} />{peer.phone}</a>}
                    </div>
                  </article>
                ))}
            </div>
          </>}
    </section>
  );
}
