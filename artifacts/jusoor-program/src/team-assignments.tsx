import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAuthMeQueryKey,
  getGetProgramTeamAssignmentsQueryKey,
  getListStaffQueryKey,
  useAssignParticipantBusiness,
  useGetAuthMe,
  useGetProgramTeamAssignments,
  useGetStaffAssignmentHistory,
  useListPrograms,
  useUpdateProgramStaffRoles,
  type ProgramSpecialistRole,
  type ProgramTeamAssignments,
} from '@workspace/api-client-react';
import { Building2, Check, CircleAlert, History, LoaderCircle, Shield, Users } from 'lucide-react';
import { LanguageToggle, t, useAppLanguage } from './language';
import { useProgramSelection } from './program-selection';
import './team-assignments.css';

const roleOptions: ProgramSpecialistRole[] = ['trainer', 'mentor', 'judge'];

function responseError(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object' || !('data' in error)) return fallback;
  const data = error.data;
  return data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
    ? data.error
    : fallback;
}

export function ProgramTeamAssignmentsPage({ isAdmin }: { isAdmin: boolean }) {
  useAppLanguage();
  const client = useQueryClient();
  const currentUser = useGetAuthMe({ query: { queryKey: getGetAuthMeQueryKey() } });
  const programsQuery = useListPrograms();
  const programs = programsQuery.data || [];
  const [selectedProgramId, setSelectedProgramId] = useProgramSelection(programs, true);

  const assignmentsQuery = useGetProgramTeamAssignments(selectedProgramId ?? 0, {
    query: {
      queryKey: getGetProgramTeamAssignmentsQueryKey(selectedProgramId ?? 0),
      enabled: selectedProgramId !== null,
    },
  });
  const refreshAssignments = () => {
    if (selectedProgramId !== null) {
      void client.invalidateQueries({ queryKey: getGetProgramTeamAssignmentsQueryKey(selectedProgramId) });
    }
    void client.invalidateQueries({ queryKey: getListStaffQueryKey() });
    void client.invalidateQueries({ queryKey: getGetAuthMeQueryKey() });
  };

  const selectedProgramName = useMemo(
    () => programs.find(program => program.id === selectedProgramId)?.name,
    [programs, selectedProgramId],
  );
  const data = assignmentsQuery.data;

  return <div className="program-assignments-page">
    <header className="page-heading">
      <div>
        <div className="eyebrow">{t('TEAM / PROGRAM ASSIGNMENTS')}</div>
        <h1 className="app-title">{t('Roles & business teams')}</h1>
        <p>{t('Give each specialist the right roles in each program, and group accepted participants with their business.')}</p>
      </div>
      <LanguageToggle />
    </header>

    <section className="panel assignment-scope-card">
      <label className="field">
        <span>{t('Program')}</span>
        <select
          className="form-control"
          value={selectedProgramId ?? ''}
          onChange={event => setSelectedProgramId(event.target.value ? Number(event.target.value) : null)}
          data-testid="select-assignment-program"
          disabled={programs.length === 0}
        >
          <option value="">{t('Choose a program')}</option>
          {programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
        </select>
      </label>
      <div className="assignment-scope-note">
        <Shield size={16} />
        <span>{isAdmin
          ? t('Admins can manage assignments in every active program.')
          : t('You can assign existing staff only in programs assigned to you. Ask an admin to invite new staff accounts.')}</span>
      </div>
    </section>

    {programsQuery.isLoading && <div className="empty-panel">{t('Loading programs…')}</div>}
    {programsQuery.isError && <div className="empty-panel error-panel" role="alert">{t('Programs could not be loaded. Try again.')}</div>}
    {!programsQuery.isLoading && !programsQuery.isError && programs.length === 0 && (
      <div className="empty-panel">
        <div className="empty-icon"><Users size={21} /></div>
        <h3>{t('No active programs are assigned.')}</h3>
        <p>{t('Ask an admin to assign you to a program before managing its roles and business teams.')}</p>
      </div>
    )}
    {selectedProgramId !== null && assignmentsQuery.isLoading && <div className="loading-panel" aria-label={t('Loading assignments')}><div className="skeleton skeleton-wide" /><div className="skeleton skeleton-table" /></div>}
    {selectedProgramId !== null && assignmentsQuery.isError && (
      <div className="empty-panel error-panel" role="alert">
        <div className="empty-icon"><CircleAlert size={21} /></div>
        <h3>{t('Assignments could not be loaded.')}</h3>
        <p>{t('Your program data is unchanged. Try again.')}</p>
        <button className="button button-outline" onClick={() => void assignmentsQuery.refetch()}>{t('Retry')}</button>
      </div>
    )}
    {data && <AssignmentsSections
      key={selectedProgramId}
      data={data}
      programName={selectedProgramName || t('Selected program')}
      currentStaffId={currentUser.data?.id}
      isAdmin={isAdmin}
      onSaved={refreshAssignments}
    />}
  </div>;
}

function AssignmentsSections({
  data,
  programName,
  currentStaffId,
  isAdmin,
  onSaved,
}: {
  data: ProgramTeamAssignments;
  programName: string;
  currentStaffId?: number;
  isAdmin: boolean;
  onSaved: () => void;
}) {
  return <>
    <section className="panel program-assignment-panel">
      <div className="panel-heading">
        <div><div className="eyebrow">{t('SPECIALIST ACCESS')}</div><h2 className="app-title">{t('Staff roles')}</h2></div>
        <span className="section-meta">{programName}</span>
      </div>
      <p className="assignment-section-copy">{t('Set roles separately for each program. A person can be a trainer and mentor in this program without receiving those roles in another program.')}</p>
      {!data.staff.length
        ? <div className="assignment-empty">{t('No team accounts are available for this program yet. Admins can add team members first.')}</div>
        : <div className="table-wrap" role="region" tabIndex={0} aria-label={t('Scrollable results table')}>
          <table className="assignment-table">
            <thead><tr><th>{t('TEAM MEMBER')}</th><th>{t('PROGRAM ROLES')}</th><th>{t('ACCOUNT')}</th></tr></thead>
            <tbody>{data.staff.map(member => <StaffRoleRow
              key={member.staffId}
              member={member}
              programId={data.programId}
              currentStaffId={currentStaffId}
              isAdmin={isAdmin}
              onSaved={onSaved}
            />)}</tbody>
          </table>
        </div>}
    </section>

    <section className="panel program-assignment-panel">
      <div className="panel-heading">
        <div><div className="eyebrow">{t('STARTUP TEAMS')}</div><h2 className="app-title">{t('Participant business teams')}</h2></div>
        <span className="section-meta">{programName}</span>
      </div>
      <p className="assignment-section-copy">{t('Assign accepted participants to a business. Teammates can see the shared business profile and team roster, but personal learning progress, assessments, and feedback stay private.')}</p>
      {!data.participants.length
        ? <div className="assignment-empty">{t('Accepted participants will appear here.')}</div>
        : <div className="table-wrap" role="region" tabIndex={0} aria-label={t('Scrollable results table')}>
          <table className="assignment-table">
            <thead><tr><th>{t('PARTICIPANT')}</th><th>{t('BUSINESS TEAM')}</th><th>{t('SAVE')}</th></tr></thead>
            <tbody>{data.participants.map(participant => <ParticipantBusinessRow
              key={participant.applicationId}
              participant={participant}
              programId={data.programId}
              businesses={data.businesses}
              onSaved={onSaved}
            />)}</tbody>
          </table>
        </div>}
    </section>
    {isAdmin && <AssignmentAuditHistory />}
  </>;
}

function AssignmentAuditHistory() {
  const query = useGetStaffAssignmentHistory();
  const events = query.data || [];
  const summarizeValue = (type: string, value: Record<string, unknown>) => {
    if (type === 'staff_roles') {
      const roles = Array.isArray(value.roles) ? value.roles : [];
      return roles.length ? roles.map(role => t(String(role))).join(', ') : t('No specialist roles');
    }
    const name = typeof value.businessName === 'string' ? value.businessName : null;
    const id = typeof value.businessId === 'number' ? value.businessId : null;
    return name || (id === null ? t('No business team') : `${t('Business')} #${id}`);
  };

  return <section className="panel program-assignment-panel" data-testid="assignment-audit-history">
    <div className="panel-heading">
      <div><div className="eyebrow">{t('ADMIN HISTORY')}</div><h2 className="app-title"><History size={20} /> {t('Assignment changes')}</h2></div>
      <span className="section-meta">{t('Most recent 250')}</span>
    </div>
    <p className="assignment-section-copy">{t('Review who changed specialist access or a participant business team, and when.')}</p>
    {query.isLoading
      ? <div className="empty-panel">{t('Loading assignment history…')}</div>
      : query.isError
        ? <div className="empty-panel error-panel" role="alert">
          <h3>{t('Assignment history could not be loaded.')}</h3>
          <button className="button button-outline" onClick={() => void query.refetch()}>{t('Retry')}</button>
        </div>
        : events.length === 0
          ? <div className="assignment-empty">{t('No assignment changes have been recorded yet.')}</div>
           : <div className="table-wrap" role="region" tabIndex={0} aria-label={t('Scrollable results table')}>
            <table className="assignment-table">
              <thead><tr>
                <th>{t('WHEN')}</th><th>{t('PROGRAM')}</th><th>{t('CHANGE')}</th><th>{t('AFFECTED ACCOUNT')}</th><th>{t('PREVIOUS')}</th><th>{t('NEW')}</th><th>{t('CHANGED BY')}</th>
              </tr></thead>
              <tbody>{events.map(event => <tr key={event.id} data-testid={`assignment-audit-${event.id}`}>
                <td>{new Date(event.createdAt).toLocaleString()}</td>
                <td>{event.programName}</td>
                <td>{t(event.assignmentType === 'staff_roles' ? 'Staff roles' : 'Business team')}</td>
                <td>{event.assignmentType === 'staff_roles'
                  ? event.affectedAccountEmail || `${t('Staff account')} #${event.affectedStaffId}`
                  : `${event.affectedApplicationName || t('Application')} (#${event.applicationId})`}</td>
                <td>{summarizeValue(event.assignmentType, event.previousValue)}</td>
                <td>{summarizeValue(event.assignmentType, event.newValue)}</td>
                <td>{event.actorEmail}</td>
              </tr>)}</tbody>
            </table>
          </div>}
  </section>;
}

function StaffRoleRow({
  member,
  programId,
  currentStaffId,
  isAdmin,
  onSaved,
}: {
  member: ProgramTeamAssignments['staff'][number];
  programId: number;
  currentStaffId?: number;
  isAdmin: boolean;
  onSaved: () => void;
}) {
  const [roles, setRoles] = useState<ProgramSpecialistRole[]>(member.roles);
  const mutation = useUpdateProgramStaffRoles();
  useEffect(() => setRoles(member.roles), [member.roles]);
  const canEdit = isAdmin || currentStaffId !== member.staffId;
  const dirty = roleOptions.some(role => roles.includes(role) !== member.roles.includes(role));
  const save = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate({ programId, staffId: member.staffId, data: { roles } }, { onSuccess: onSaved });
  };

  return <tr>
    <td><div className="staff-email"><span className="staff-avatar">{member.email.slice(0, 1).toUpperCase()}</span><div><b>{member.email}</b><small>{t(member.status === 'active' ? 'Active account' : 'Invitation pending')}</small></div></div></td>
    <td><form className="assignment-role-form" onSubmit={save}>
      <div className="assignment-role-options">{roleOptions.map(role => <label key={role} className="assignment-role-option">
        <input
          type="checkbox"
          checked={roles.includes(role)}
          disabled={!canEdit || mutation.isPending}
          onChange={event => setRoles(previous => event.target.checked
            ? [...previous, role]
            : previous.filter(value => value !== role))}
          aria-label={`${t(role)} ${t('role for')} ${member.email}`}
          data-testid={`role-${member.staffId}-${role}`}
        />
        <span>{t(role)}</span>
      </label>)}</div>
      {!canEdit && <small className="field-hint">{t('Ask an admin to change your own specialist roles.')}</small>}
      {mutation.isError && <span className="form-error" role="alert">{t(responseError(mutation.error, 'The roles could not be saved. Try again.'))}</span>}
      {canEdit && <button type="submit" className="button button-quiet assignment-save-button" disabled={!dirty || mutation.isPending} data-testid={`save-roles-${member.staffId}`}>
        {mutation.isPending ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}{t(mutation.isPending ? 'Saving…' : 'Save roles')}
      </button>}
    </form></td>
    <td><span className={`badge ${member.status === 'active' ? 'badge-good' : 'badge-warm'}`}><span />{t(member.status === 'active' ? 'Active' : 'Invited')}</span></td>
  </tr>;
}

function ParticipantBusinessRow({
  participant,
  programId,
  businesses,
  onSaved,
}: {
  participant: ProgramTeamAssignments['participants'][number];
  programId: number;
  businesses: ProgramTeamAssignments['businesses'];
  onSaved: () => void;
}) {
  const [businessId, setBusinessId] = useState(participant.assignedBusinessId?.toString() || '');
  const mutation = useAssignParticipantBusiness();
  useEffect(() => setBusinessId(participant.assignedBusinessId?.toString() || ''), [participant.assignedBusinessId]);
  const dirty = (businessId ? Number(businessId) : null) !== participant.assignedBusinessId;
  const save = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate({
      programId,
      data: { applicationId: participant.applicationId, businessId: businessId ? Number(businessId) : null },
    }, { onSuccess: onSaved });
  };

  return <tr>
    <td><div className="staff-email"><span className="staff-avatar">{participant.founderName.slice(0, 1).toUpperCase()}</span><div><b>{participant.founderName}</b><small>{participant.email}</small></div></div></td>
    <td><select
      className="form-control assignment-business-select"
      value={businessId}
      onChange={event => setBusinessId(event.target.value)}
      disabled={mutation.isPending}
      aria-label={`${t('Business team for')} ${participant.founderName}`}
      data-testid={`business-team-${participant.applicationId}`}
    >
      <option value="">{t('No business team')}</option>
      {businesses.map(business => <option key={business.id} value={business.id}>{business.businessName}</option>)}
    </select></td>
    <td><form onSubmit={save} className="assignment-business-form">
      {mutation.isError && <span className="form-error" role="alert">{t(responseError(mutation.error, 'The business assignment could not be saved.'))}</span>}
      <button className="button button-quiet assignment-save-button" type="submit" disabled={!dirty || mutation.isPending} data-testid={`save-business-${participant.applicationId}`}>
        {mutation.isPending ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}{t(mutation.isPending ? 'Saving…' : 'Save team')}
      </button>
    </form></td>
  </tr>;
}
