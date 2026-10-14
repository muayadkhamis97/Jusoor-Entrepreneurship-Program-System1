import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CertificatePdfPage, downloadCertificatePdf, type CertificateLanguage } from './certificate-pdf';
import { AssessmentComparison } from './assessment-comparison';
import {
  getGetLearningProgressAnalyticsQueryKey,
  getGetParticipantLearningProgressQueryKey,
  getVerifyCertificateQueryKey,
  useGetLearningProgressAnalytics,
  useGetParticipantLearningProgress,
  useVerifyCertificate,
  useIssueCourseCertificate,
  useRevokeCourseCertificate,
  useRetryCourseReminder,
  useRecordParticipantCourseActivity,
  useRecordParticipantModuleProgress,
} from '@workspace/api-client-react';
import type { CourseProgressModule, CourseProgressQuiz, CourseReminderFailure, LearningProgressParticipant, LearningProgressProgram, ParticipantLearningProgram } from '@workspace/api-client-react';
import {
  Activity, Award, BookOpen, CalendarClock, Check, CircleAlert, Clock3,
  Download, FileCheck2, Hourglass, Medal, RefreshCw, ShieldCheck, Sparkles,
} from 'lucide-react';
import { currentLanguage, t, useAppLanguage } from './language';
import './learning-progress.css';

const fmtDate = (value?: string | null) => value ? new Date(value).toLocaleDateString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : t('Not set');
const fmtDateTime = (value?: string | null) => value ? new Date(value).toLocaleString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : t('No activity yet');
const fmtTimestamp = (value: string) => new Date(value).toLocaleString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const certificateVerificationUrl = (code: string) => `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/verify-certificate?code=${encodeURIComponent(code)}`;
const fmtTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  if (currentLanguage() === 'ar') {
    const number = new Intl.NumberFormat('ar-JO');
    return `${number.format(hours)} س ${number.format(minutes)} د`;
  }
  return `${hours}h ${minutes}m`;
};
const progressStatus = (module: CourseProgressModule) => module.completionStatus === 'completed' ? t('Complete') : module.completionStatus === 'in_progress' ? t('In progress') : t('Not started');
const packageState = (value?: string | null) => value ? t(value.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase())) : t('Not started');
const assessmentText = (type: string) => t(({ knowledge_check: 'Knowledge check', pre_course: 'Pre-course assessment', post_course: 'Post-course assessment' } as Record<string, string>)[type] || type);
const gradingText = (format: string) => t(({ numerical: 'Numerical', percentage: 'Percentage', letter: 'Letter grade' } as Record<string, string>)[format] || format);
function formattedQuizGrade(quiz: CourseProgressQuiz, score: number | null): string {
  if (score == null || quiz.totalQuestions <= 0) return '—';
  if (quiz.gradingFormat === 'numerical') return `${score}/${quiz.totalQuestions}`;
  const percentage = score / quiz.totalQuestions * 100;
  if (quiz.gradingFormat === 'percentage') return `${Math.round(percentage)}%`;
  return [...quiz.letterGradeScale].sort((a, b) => b.minimumPercent - a.minimumPercent)
    .find(band => percentage >= band.minimumPercent)?.grade || '—';
}
const hasCourseAssessment = (quizzes: CourseProgressQuiz[]) => quizzes.some(quiz => quiz.assessmentType === 'pre_course' || quiz.assessmentType === 'post_course');

function useVisibleActiveTime(programIds: number[]) {
  const mutation = useRecordParticipantCourseActivity();
  const client = useQueryClient();
  const programKey = programIds.join(',');
  const idsRef = useRef(programIds);
  idsRef.current = programIds;
  const mutateRef = useRef(mutation.mutate);
  mutateRef.current = mutation.mutate;
  useEffect(() => {
    if (!programKey) return;
    let last = Date.now();
    let activeProgramId: number | null = null;
    const visibilityByProgram = new Map<number, number>();
    const observer = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = Number((entry.target as HTMLElement).dataset.learningProgramId);
        if (!Number.isFinite(id)) continue;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.25) visibilityByProgram.set(id, entry.intersectionRatio);
        else visibilityByProgram.delete(id);
      }
      activeProgramId = [...visibilityByProgram.entries()]
        .sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });
    if (observer) {
      idsRef.current.forEach(id => {
        const element = document.querySelector(`[data-learning-program-id="${id}"]`);
        if (element) observer.observe(element);
      });
    } else if (idsRef.current.length === 1) {
      activeProgramId = idsRef.current[0];
    }
    const timer = window.setInterval(() => {
      const now = Date.now();
      const elapsed = Math.floor((now - last) / 1000);
      last = now;
      if (document.visibilityState !== 'visible' || elapsed < 1 || activeProgramId === null) return;
      const bounded = Math.min(60, elapsed);
      mutateRef.current({ id: activeProgramId, data: { activeSeconds: bounded } }, {
        onSuccess: () => { void client.invalidateQueries({ queryKey: getGetParticipantLearningProgressQueryKey() }); },
      });
    }, 60_000);
    const reset = () => { last = Date.now(); };
    document.addEventListener('visibilitychange', reset);
    return () => { window.clearInterval(timer); observer?.disconnect(); document.removeEventListener('visibilitychange', reset); };
  }, [programKey, client]);
}

function CertificateCard({ certificate }: { certificate: NonNullable<ParticipantLearningProgram['certificate']> }) {
  const verificationUrl = certificateVerificationUrl(certificate.certificateCode);
  const revoked = Boolean(certificate.revokedAt);
  return <article className="learning-certificate" data-testid={`card-certificate-${certificate.id}`}>
    <div className="certificate-seal"><Award size={21} /></div>
    <div className="certificate-copy"><span className="lp-eyebrow">{t(revoked ? 'CERTIFICATE REVOKED' : 'CERTIFICATE ISSUED')}</span><h3>{certificate.programName}</h3><p>{t('Awarded to')} <b>{certificate.participantName}</b>{certificate.businessName ? ` · ${certificate.businessName}` : ''}</p><div className="certificate-meta"><span>{t('CODE')} <b data-testid={`text-certificate-code-${certificate.id}`}>{certificate.certificateCode}</b></span><span>{t('ISSUED')} {fmtDate(certificate.issuedAt)}</span><span>{t('BY')} {certificate.issuedByName}</span>{revoked && <span>{t('REVOKED')} {fmtDate(certificate.revokedAt)}</span>}</div><a className="certificate-verify-link" href={verificationUrl}>{t('Verify this certificate')}</a></div>
    {!revoked && <CertificateDownload certificate={certificate} testIdPrefix="participant" />}
  </article>;
}

function CertificateDownload({ certificate, testIdPrefix }: {
  certificate: NonNullable<ParticipantLearningProgram['certificate']>;
  testIdPrefix: 'participant' | 'coordinator';
}) {
  const certificateRef = useRef<HTMLElement>(null);
  const [language, setLanguage] = useState<CertificateLanguage>('both');
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const verificationUrl = certificateVerificationUrl(certificate.certificateCode);
  const downloadCertificate = async () => {
    const certificateElement = certificateRef.current;
    if (!certificateElement || downloading) return;
    setDownloading(true);
    setDownloadFailed(false);
    try {
      await downloadCertificatePdf(
        certificateElement,
        verificationUrl,
        `Jusoor-Certificate-${certificate.certificateCode}.pdf`,
      );
    } catch (error) {
      console.error('Could not generate the certificate PDF.', error);
      setDownloadFailed(true);
    } finally {
      setDownloading(false);
    }
  };
  const testId = `${testIdPrefix}-${certificate.id}`;
  return <div className={`certificate-download-controls ${testIdPrefix === 'coordinator' ? 'is-coordinator' : ''}`}>
    <label className="certificate-language-picker" htmlFor={`select-certificate-language-${testId}`}>
      <span>{t('Certificate language')}</span>
      <select
        id={`select-certificate-language-${testId}`}
        value={language}
        onChange={event => setLanguage(event.target.value as CertificateLanguage)}
        data-testid={`select-certificate-language-${testId}`}
      >
        <option value="en">{t('English')}</option>
        <option value="ar">{t('Arabic')}</option>
        <option value="both">{t('Bilingual')}</option>
      </select>
    </label>
    <button type="button" className="lp-button lp-button-outline print-hide" onClick={downloadCertificate} disabled={downloading} data-testid={`button-download-certificate-${testId}`}>
      <Download size={15} />{downloading ? t('Preparing PDF…') : t('Download PDF')}
    </button>
    {downloadFailed && <p className="certificate-download-error" role="alert">{t('Certificate PDF could not be downloaded. Please try again.')}</p>}
    <CertificatePdfPage
      ref={certificateRef}
      certificate={certificate}
      issuedDateEnglish={new Date(certificate.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
      issuedDateArabic={new Date(certificate.issuedAt).toLocaleDateString('ar-JO', { day: 'numeric', month: 'long', year: 'numeric' })}
      verificationUrl={verificationUrl}
      language={language}
    />
  </div>;
}

function ModuleProgressCard({ module, index, onToggle, pending }: { module: CourseProgressModule; index: number; onToggle: (module: CourseProgressModule) => void; pending: boolean }) {
  const overdue = module.dueAt && new Date(module.dueAt).getTime() < Date.now() && module.completionStatus !== 'completed';
  return <article className={`lp-module ${module.completionStatus === 'completed' ? 'is-complete' : ''}`} data-testid={`card-learning-module-${module.moduleId}`}>
    <div className="lp-module-index">{String(index + 1).padStart(2, '0')}</div>
    <div className="lp-module-body">
      <div className="lp-module-title-row"><h3 data-testid={`text-learning-module-title-${module.moduleId}`}>{module.title}</h3><span className={`lp-status ${module.completionStatus}`} data-testid={`status-learning-module-${module.moduleId}`}>{module.completionStatus === 'completed' && <Check size={12} />}{progressStatus(module)}</span></div>
      <div className="lp-module-facts"><span>{module.isRequired ? <><span className="lp-required-dot" />{t('Required')}</> : t('Optional')}</span><span className={overdue ? 'lp-overdue' : ''}><CalendarClock size={13} />{module.dueAt ? `${t('Due')} ${fmtDate(module.dueAt)}` : t('No deadline')}</span></div>
      {module.packages.length > 0 && <div className="lp-package-list">{module.packages.map(pkg => <div className="lp-package" key={pkg.materialId} data-testid={`row-learning-package-${pkg.materialId}`}><span className="lp-package-icon"><BookOpen size={13} /></span><div><b>{pkg.title}</b><small>{pkg.format.toUpperCase()} · {packageState(pkg.completionStatus)}{pkg.successStatus && pkg.successStatus !== 'unknown' ? ` · ${packageState(pkg.successStatus)}` : ''}{pkg.scoreScaled != null ? ` · ${(pkg.scoreScaled * 100).toFixed(0)}%` : ''}</small></div><span className="lp-package-updated">{pkg.updatedAt ? fmtDate(pkg.updatedAt) : ''}</span></div>)}</div>}
    </div>
    <button type="button" className={`lp-button ${module.completionStatus === 'completed' ? 'lp-button-quiet' : 'lp-button-primary'}`} onClick={() => onToggle(module)} disabled={pending} data-testid={`button-toggle-module-complete-${module.moduleId}`}>{pending ? t('Saving…') : module.completionStatus === 'completed' ? t('Mark incomplete') : <><Check size={14} />{t('Mark complete')}</>}</button>
  </article>;
}

export function ParticipantLearningProgress() {
  useAppLanguage();
  const query = useGetParticipantLearningProgress({ query: { queryKey: getGetParticipantLearningProgressQueryKey(), refetchOnWindowFocus: true, refetchInterval: 60_000 } });
  const client = useQueryClient();
  const record = useRecordParticipantModuleProgress();
  const programs = query.data?.programs || [];
  useVisibleActiveTime(programs.filter(program => program.modules.length > 0).map(program => program.programId));
  const [savingModule, setSavingModule] = useState<number | null>(null);
  const toggle = (module: CourseProgressModule) => {
    setSavingModule(module.moduleId);
    record.mutate({ id: module.moduleId, data: { completed: module.completionStatus !== 'completed' } }, {
      onSuccess: () => void client.invalidateQueries({ queryKey: getGetParticipantLearningProgressQueryKey() }),
      onSettled: () => setSavingModule(null),
    });
  };
  return <section className="learning-space participant-learning-space" data-testid="participant-learning-progress">
    <header className="lp-heading"><div><span className="lp-eyebrow">{t('ONLINE INCUBATION / YOUR PROGRESS')}</span><h2>{t('Learning, with momentum.')}</h2><p>{t('Your course progress, learning time and next deadlines across accepted programs.')}</p></div><span className="lp-live"><i />{t('ACTIVE TIME TRACKING')}</span></header>
    {query.isLoading ? <div className="lp-skeleton-stack"><div /><div /><div /></div>
      : query.isError ? <div className="lp-state lp-error"><CircleAlert size={20} /><div><b>{t('Learning progress could not load.')}</b><span>{t('Your records are unchanged. Reconnect to try again.')}</span></div><button className="lp-button lp-button-outline" onClick={() => void query.refetch()} data-testid="button-retry-learning-progress"><RefreshCw size={14} />{t('Retry')}</button></div>
      : !programs.length ? <div className="lp-state"><Sparkles size={20} /><div><b>{t('Your learning path is being prepared.')}</b><span>{t('Course progress appears here when you are accepted into a program.')}</span></div></div>
      : programs.map(program => <ProgramProgress key={program.programId} program={program} onToggle={toggle} savingModule={savingModule} />)}
    {record.isError && <p className="lp-mutation-error" role="alert" data-testid="error-module-progress">{t('Progress could not be saved. Please try again.')}</p>}
  </section>;
}

export function CertificateVerificationPage() {
  useAppLanguage();
  const initialCode = new URLSearchParams(window.location.search).get('code') ?? '';
  const [code, setCode] = useState(initialCode);
  const [requestedCode, setRequestedCode] = useState(initialCode.trim().toUpperCase());
  const verification = useVerifyCertificate(requestedCode, {
    query: { enabled: Boolean(requestedCode), retry: false, queryKey: getVerifyCertificateQueryKey(requestedCode) },
  });
  const errorStatus = (verification.error as { status?: number } | null)?.status;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    setCode(normalized);
    setRequestedCode(normalized);
    const url = new URL(window.location.href);
    if (normalized) url.searchParams.set('code', normalized);
    else url.searchParams.delete('code');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  };

  return <main className="certificate-verification-page" data-testid="certificate-verification-page">
    <a className="certificate-verification-brand" href="/">{t('Jusoor Program Hub')}</a>
    <section className="certificate-verification-card">
      <span className="lp-eyebrow">{t('PUBLIC CERTIFICATE CHECK')}</span>
      <h1>{t('Verify a certificate')}</h1>
      <p>{t('Enter the unique code printed on a Jusoor certificate to confirm its issuance.')}</p>
      <form className="certificate-verification-form" onSubmit={submit}>
        <label htmlFor="certificate-code-input">{t('Certificate code')}</label>
        <input
          id="certificate-code-input"
          value={code}
          onChange={event => setCode(event.target.value)}
          placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
          autoCapitalize="characters"
          autoComplete="off"
          maxLength={64}
          required
          data-testid="input-certificate-code"
        />
        <button className="lp-button lp-button-primary" type="submit" disabled={verification.isFetching} data-testid="button-verify-certificate">
          <ShieldCheck size={16} />{verification.isFetching ? t('Checking…') : t('Verify certificate')}
        </button>
      </form>
      {verification.isFetching && <div className="certificate-verification-result" role="status">{t('Checking the certificate record…')}</div>}
      {verification.data && <div className={`certificate-verification-result ${verification.data.status === 'revoked' ? 'is-invalid' : 'is-issued'}`} role="status" data-testid={`certificate-verification-${verification.data.status}`}>
        <div className={`certificate-verification-status ${verification.data.status === 'revoked' ? 'is-revoked' : ''}`}>{verification.data.status === 'revoked' ? <CircleAlert size={20} /> : <ShieldCheck size={20} />}<b>{t(verification.data.status === 'revoked' ? 'Certificate revoked — not valid' : 'Certificate issued')}</b></div>
        <dl>
          <div><dt>{t('Participant')}</dt><dd>{verification.data.participantName}</dd></div>
          <div><dt>{t('Business')}</dt><dd>{verification.data.businessName}</dd></div>
          <div><dt>{t('Program')}</dt><dd>{verification.data.programName}</dd></div>
          <div><dt>{t('Issue date')}</dt><dd>{fmtDate(verification.data.issuedAt)}</dd></div>
          <div><dt>{t('Certificate code')}</dt><dd>{verification.data.certificateCode}</dd></div>
          {verification.data.status === 'revoked' && verification.data.revokedAt && <div><dt>{t('Revoked on')}</dt><dd>{fmtDate(verification.data.revokedAt)}</dd></div>}
        </dl>
      </div>}
      {verification.isError && errorStatus === 400 && <div className="certificate-verification-result is-invalid" role="alert" data-testid="certificate-verification-invalid">{t('This certificate code is invalid. Check the code and try again.')}</div>}
      {verification.isError && errorStatus === 404 && <div className="certificate-verification-result is-invalid" role="alert" data-testid="certificate-verification-not-found">{t('No certificate was found for this code.')}</div>}
      {verification.isError && errorStatus !== 400 && errorStatus !== 404 && <div className="certificate-verification-result is-invalid" role="alert">{t('Certificate verification is temporarily unavailable. Please try again.')}</div>}
      <small className="certificate-verification-privacy">{t('Only certificate details needed to confirm issuance are shown.')}</small>
    </section>
  </main>;
}

function ProgramProgress({ program, onToggle, savingModule }: { program: ParticipantLearningProgram; onToggle: (module: CourseProgressModule) => void; savingModule: number | null }) {
  return <article className="lp-program" data-learning-program-id={program.programId} data-testid={`card-learning-program-${program.programId}`}>
    <header className="lp-program-head"><div><span className="lp-program-label"><BookOpen size={14} />{t('PROGRAM LEARNING')}</span><h3>{program.programName}</h3></div><div className="lp-time"><Clock3 size={15} /><span>{fmtTime(program.activeSeconds)}<small>{t('active learning')}</small></span></div></header>
    <div className="lp-summary">
      <div className="lp-progress-copy"><strong data-testid={`text-course-completion-${program.programId}`}>{Math.round(program.completionPercent)}%</strong><span>{program.completedRequiredModules} {t('of')} {program.totalRequiredModules} {t('required modules')}</span></div>
      <div className="lp-progress-track" role="progressbar" aria-label={t('Course completion')} aria-valuenow={program.completionPercent} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${Math.max(0, Math.min(100, program.completionPercent))}%` }} /></div>
      <small>{t('Last active')} · {fmtDateTime(program.lastActivityAt)}</small>
    </div>
    <div className="lp-modules">{program.modules.map((module, index) => <ModuleProgressCard key={module.moduleId} module={module} index={index} onToggle={onToggle} pending={savingModule === module.moduleId} />)}</div>
    <div className="lp-lower">
       <section className="lp-quiz-section"><div className="lp-section-title"><div><span className="lp-eyebrow">{t('ASSESSMENT')}</span><h4>{t('Quiz results')}</h4></div><span>{program.quizzes.length}</span></div>
         {program.quizzes.length ? <>{hasCourseAssessment(program.quizzes) && <AssessmentComparison quizzes={program.quizzes} testId={`assessment-comparison-participant-${program.programId}`} />}{program.quizzes.map(quiz => <div className="lp-quiz-row" key={quiz.quizId} data-testid={`row-course-quiz-${quiz.quizId}`}><div><b>{quiz.title}</b><small>{assessmentText(quiz.assessmentType)} · {gradingText(quiz.gradingFormat)} · {quiz.attempts} {t('attempts')} · {fmtDate(quiz.latestSubmittedAt)}</small></div><strong>{formattedQuizGrade(quiz, quiz.bestScore)}</strong></div>)}</> : <p className="lp-no-quiz">{t('Quiz results will appear here after submission.')}</p>}
      </section>
      {program.certificate ? <CertificateCard certificate={program.certificate} /> : <div className="lp-certificate-pending"><span><Medal size={18} /></span><div><b>{t('Certificate pathway')}</b><p>{program.totalRequiredModules > 0 && program.completedRequiredModules >= program.totalRequiredModules ? t('Your required modules are complete. Your coordinator will review and issue your certificate.') : `${program.completedRequiredModules} ${t('of')} ${program.totalRequiredModules} ${t('required modules complete')}.`}</p></div></div>}
    </div>
  </article>;
}

function ParticipantRow({ participant, onIssue, pending, onRevoke, revoking }: {
  participant: LearningProgressParticipant;
  onIssue: (participant: LearningProgressParticipant) => void;
  pending: boolean;
  onRevoke: (certificateId: number, reason: string, onSuccess: () => void) => void;
  revoking: boolean;
}) {
  const [showRevokeForm, setShowRevokeForm] = useState(false);
  const [revokeReason, setRevokeReason] = useState('');
  const certReady = participant.completedRequiredModules >= participant.totalRequiredModules && participant.totalRequiredModules > 0;
  const certificate = participant.certificate;
  const handleRevoke = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reason = revokeReason.trim();
    if (!certificate || !reason || revoking) return;
    onRevoke(certificate.id, reason, () => {
      setShowRevokeForm(false);
      setRevokeReason('');
    });
  };
  return <details className="lp-participant" data-testid={`row-learning-participant-${participant.applicationId}`}>
    <summary><span className="lp-person"><i>{participant.founderName.slice(0, 1).toUpperCase()}</i><span><b>{participant.founderName}</b><small>{participant.businessName} · {participant.email}</small></span></span><span className="lp-participant-progress"><b>{Math.round(participant.completionPercent)}%</b><i><span style={{ width: `${Math.max(0, Math.min(100, participant.completionPercent))}%` }} /></i></span><span className="lp-participant-time">{fmtTime(participant.activeSeconds)}</span><span className={`lp-status ${certificate ? certificate.revokedAt ? 'not_started' : 'completed' : certReady ? 'in_progress' : 'not_started'}`}>{certificate ? t(certificate.revokedAt ? 'Revoked' : 'Issued') : certReady ? t('Ready for review') : t('In progress')}</span><span className="lp-detail-chevron">+</span></summary>
    <div className="lp-participant-detail">
       <div className="lp-detail-facts"><span>{t('Required modules')} <b>{participant.completedRequiredModules}/{participant.totalRequiredModules}</b></span><span>{t('Last activity')} <b>{fmtDateTime(participant.lastActivityAt)}</b></span><span>{t('Best quiz results')} <b>{participant.quizzes.length ? participant.quizzes.map(quiz => formattedQuizGrade(quiz, quiz.bestScore)).join(' · ') : '—'}</b></span></div>
        {hasCourseAssessment(participant.quizzes) && <AssessmentComparison quizzes={participant.quizzes} testId={`assessment-comparison-coordinator-${participant.applicationId}`} />}
      {participant.modules.length > 0 && <div className="lp-coordinator-modules">{participant.modules.map(module => <span key={module.moduleId} className={module.completionStatus === 'completed' ? 'is-done' : ''}><i />{module.title}{module.isRequired ? ` · ${t('Required')}` : ` · ${t('Optional')}`}</span>)}</div>}
      {certificate ? <><div className="lp-issued"><FileCheck2 size={15} />{t('Certificate')} <b>{certificate.certificateCode}</b> · {fmtDate(certificate.issuedAt)} · {t('Issued by')} {certificate.issuedByName}</div>
        {certificate.revokedAt ? <div className="lp-revocation-details" role="status" data-testid={`certificate-revocation-details-${certificate.id}`}>
          <b>{t('Certificate revoked')}</b>
          <span>{t('Reason')}: {certificate.revocationReason}</span>
          <small>{t('Revoked')} {fmtTimestamp(certificate.revokedAt)} · {t('By')} {certificate.revokedByName}</small>
        </div> : <>
          <CertificateDownload certificate={certificate} testIdPrefix="coordinator" />
          {showRevokeForm ? <form className="lp-certificate-revoke-form" onSubmit={handleRevoke}>
            <label htmlFor={`certificate-revocation-reason-${certificate.id}`}>{t('Reason for revocation')}
              <textarea id={`certificate-revocation-reason-${certificate.id}`} value={revokeReason} onChange={event => setRevokeReason(event.target.value)} maxLength={1000} required data-testid={`input-certificate-revocation-reason-${certificate.id}`} />
            </label>
            <small>{t('Revoking a certificate cannot be undone.')}</small>
            <div><button className="lp-button lp-button-outline" type="button" onClick={() => { setShowRevokeForm(false); setRevokeReason(''); }} disabled={revoking}>{t('Cancel')}</button>
              <button className="lp-button lp-button-danger" type="submit" disabled={revoking || !revokeReason.trim()} data-testid={`button-confirm-revoke-certificate-${certificate.id}`}>{revoking ? t('Revoking…') : t('Confirm revocation')}</button></div>
          </form> : <button type="button" className="lp-button lp-button-outline lp-certificate-revoke-trigger" onClick={() => setShowRevokeForm(true)} data-testid={`button-revoke-certificate-${certificate.id}`}>{t('Revoke certificate')}</button>}
        </>}
      </>
        : <button type="button" className="lp-button lp-button-primary" onClick={() => onIssue(participant)} disabled={!certReady || pending} data-testid={`button-issue-certificate-${participant.applicationId}`}>{pending ? t('Issuing…') : <><Award size={14} />{t('Issue certificate')}</>}</button>}
    </div>
  </details>;
}

function ReminderDeliveryPanel({ program, retryingId, onRetry }: {
  program: LearningProgressProgram;
  retryingId: number | null;
  onRetry: (delivery: CourseReminderFailure) => void;
}) {
  const reminders = program.reminders;
  return <section className="lp-reminders" data-testid={`panel-course-reminders-${program.programId}`}>
    <header className="lp-reminders-heading"><div><span className="lp-eyebrow">{t('COHORT EMAILS')}</span><h4>{t('Course reminder emails')}</h4></div><small>{t('Delivery status for this cohort')}</small></header>
    <div className="lp-reminder-counts">
      <div><span>{t('Pending')}</span><b data-testid={`text-reminders-pending-${program.programId}`}>{reminders.pending}</b></div>
      <div><span>{t('Sent')}</span><b data-testid={`text-reminders-sent-${program.programId}`}>{reminders.sent}</b></div>
      <div className={reminders.failed ? 'has-failures' : ''}><span>{t('Failed')}</span><b data-testid={`text-reminders-failed-${program.programId}`}>{reminders.failed}</b></div>
    </div>
    {reminders.latestError && <div className="lp-reminder-latest-error" data-testid={`text-reminders-latest-error-${program.programId}`}>
      <CircleAlert size={15} /><div><b>{t('Latest delivery error')}</b><span>{reminders.latestError.message}</span><small>{fmtTimestamp(reminders.latestError.failedAt)}</small></div>
    </div>}
    {reminders.failedDeliveries.length > 0 && <div className="lp-reminder-failures">
      <b>{t('Failed reminders')}</b>
      {reminders.failedDeliveries.map(delivery => <article key={delivery.id} data-testid={`row-failed-reminder-${delivery.id}`}>
        <div><strong>{delivery.founderName}</strong><span>{delivery.businessName} · {delivery.moduleTitle}</span><small>{delivery.lastError} · {fmtTimestamp(delivery.failedAt)}</small></div>
        <button type="button" className="lp-button lp-button-outline" onClick={() => onRetry(delivery)} disabled={retryingId !== null} data-testid={`button-retry-reminder-${delivery.id}`}>
          <RefreshCw size={13} />{retryingId === delivery.id ? t('Queuing…') : t('Retry email')}
        </button>
      </article>)}
      {reminders.failed > reminders.failedDeliveries.length && <small className="lp-reminder-more">{t('Showing the 20 most recent failed reminders.')}</small>}
    </div>}
    {reminders.failed === 0 && <p className="lp-reminder-clear">{t('No failed reminders for this cohort.')}</p>}
  </section>;
}

function CohortAssessmentGainPanel({
  programId,
  summary,
}: {
  programId: number;
  summary: LearningProgressProgram['assessmentGain'];
}) {
  const score = (value: number | null) => value == null ? '—' : `${value.toFixed(1)}%`;
  const gain = summary.averageGainPercentagePoints;
  const gainLabel = gain == null ? '—' : `${gain > 0 ? '+' : ''}${gain.toFixed(1)} ${t('pp')}`;
  return <section className="lp-cohort-assessment" data-testid={`panel-cohort-assessment-${programId}`}>
    <header><div><span className="lp-eyebrow">{t('COHORT ASSESSMENT')}</span><h4>{t('Assessment gains')}</h4><p>{t('First-attempt averages use participants with an eligible result for each assessment. Missing results are not counted as zero.')}</p></div></header>
    <div className="lp-assessment-comparison">
      <div><span>{t('Pre-course average')}</span><b data-testid={`text-assessment-gain-pre-${programId}`}>{score(summary.preAveragePercent)}</b></div>
      <div><span>{t('Post-course average')}</span><b data-testid={`text-assessment-gain-post-${programId}`}>{score(summary.postAveragePercent)}</b></div>
      <div className={gain == null ? '' : gain > 0 ? 'is-gain' : gain < 0 ? 'is-loss' : ''}>
        <span>{t('Average change')}</span><b data-testid={`text-assessment-gain-change-${programId}`}>{gainLabel}</b>
      </div>
    </div>
    <div className="lp-assessment-coverage" aria-label={t('Assessment participation counts')}>
      <div><b data-testid={`text-assessment-pre-count-${programId}`}>{summary.participantsWithPre} / {summary.eligibleParticipants}</b><span>{t('eligible for the pre-course average')}</span></div>
      <div><b data-testid={`text-assessment-post-count-${programId}`}>{summary.participantsWithPost} / {summary.eligibleParticipants}</b><span>{t('eligible for the post-course average')}</span></div>
      <div><b data-testid={`text-assessment-paired-count-${programId}`}>{summary.pairedParticipants} / {summary.eligibleParticipants}</b><span>{t('with both results')}</span></div>
    </div>
    {(summary.preAveragePercent === null || summary.postAveragePercent === null) && <p className="lp-assessment-no-pairs">{t('A change is shown only when both assessments have eligible first-attempt results.')}</p>}
  </section>;
}

function CohortAssessmentHistory({
  programs,
  selectedProgramIds,
  onToggleProgram,
}: {
  programs: LearningProgressProgram[];
  selectedProgramIds: number[] | null;
  onToggleProgram: (programId: number) => void;
}) {
  const selectedPrograms = programs
    .filter(program => selectedProgramIds === null || selectedProgramIds.includes(program.programId))
    .sort((left, right) => {
      if (left.startDate && right.startDate) return left.startDate.localeCompare(right.startDate) || left.programId - right.programId;
      if (left.startDate) return -1;
      if (right.startDate) return 1;
      return left.programId - right.programId;
    });
  const score = (value: number | null) => value == null ? '—' : `${value.toFixed(1)}%`;
  const change = (program: LearningProgressProgram) => {
    const { preAveragePercent, postAveragePercent, averageGainPercentagePoints } = program.assessmentGain;
    if (preAveragePercent === null || postAveragePercent === null || averageGainPercentagePoints === null) return '—';
    return `${averageGainPercentagePoints > 0 ? '+' : ''}${averageGainPercentagePoints.toFixed(1)} ${t('pp')}`;
  };

  return <section className="lp-assessment-history" data-testid="panel-assessment-history">
    <header>
      <div><span className="lp-eyebrow">{t('HISTORICAL LEARNING')}</span><h3>{t('Assessment results across program runs')}</h3>
        <p>{t('Compare first-attempt pre-course and post-course averages. Each average includes only participants with an eligible result.')}</p>
      </div>
    </header>
    <fieldset className="lp-history-select">
      <legend>{t('SELECT PROGRAM RUNS')}</legend>
      <div>{programs.map(program => {
        const checked = selectedProgramIds === null || selectedProgramIds.includes(program.programId);
        return <label key={program.programId}>
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggleProgram(program.programId)}
            data-testid={`checkbox-assessment-history-program-${program.programId}`}
          />
          <span>{program.programName}</span>
        </label>;
      })}</div>
    </fieldset>
    {selectedPrograms.length ? <div className="lp-history-table-wrap">
      <table className="lp-history-table">
        <thead><tr>
          <th>{t('Program run')}</th>
          <th>{t('Pre-course average')}</th>
          <th>{t('Post-course average')}</th>
          <th>{t('Average change')}</th>
        </tr></thead>
        <tbody>{selectedPrograms.map(program => {
          const summary = program.assessmentGain;
          const delta = summary.averageGainPercentagePoints;
          return <tr key={program.programId} data-testid={`row-assessment-history-${program.programId}`}>
            <th scope="row"><strong>{program.programName}</strong><small>{fmtDate(program.startDate)}</small></th>
            <td><strong>{score(summary.preAveragePercent)}</strong><small>{summary.participantsWithPre} / {summary.eligibleParticipants} {t('participants')}</small></td>
            <td><strong>{score(summary.postAveragePercent)}</strong><small>{summary.participantsWithPost} / {summary.eligibleParticipants} {t('participants')}</small></td>
            <td className={delta == null ? '' : delta > 0 ? 'is-gain' : delta < 0 ? 'is-loss' : ''}><strong>{change(program)}</strong></td>
          </tr>;
        })}</tbody>
      </table>
    </div> : <p className="lp-history-empty">{t('Select at least one program run to compare assessment results.')}</p>}
    <p className="lp-history-footnote">{t('Change is omitted when either average has no eligible results. Missing assessments are not treated as zero.')}</p>
  </section>;
}

export function LearningProgressAnalytics() {
  useAppLanguage();
  const client = useQueryClient();
  const [selected, setSelected] = useState('');
  const [selectedHistoryPrograms, setSelectedHistoryPrograms] = useState<number[] | null>(null);
  const query = useGetLearningProgressAnalytics(undefined, { query: { queryKey: getGetLearningProgressAnalyticsQueryKey(), refetchOnWindowFocus: true, refetchInterval: 30_000 } });
  const issue = useIssueCourseCertificate();
  const revoke = useRevokeCourseCertificate();
  const retryReminder = useRetryCourseReminder();
  const programs = query.data?.programs || [];
  const programCatalogRef = useRef(programs);
  if (programs.length) {
    const merged = new Map([...programCatalogRef.current, ...programs].map(program => [program.programId, program]));
    programCatalogRef.current = [...merged.values()];
  }
  const programCatalog = programCatalogRef.current;
  const visiblePrograms = selected ? programs.filter(program => String(program.programId) === selected) : programs;
  const toggleHistoryProgram = (programId: number) => {
    const currentlySelected = selectedHistoryPrograms ?? programs.map(program => program.programId);
    setSelectedHistoryPrograms(currentlySelected.includes(programId)
      ? currentlySelected.filter(id => id !== programId)
      : [...currentlySelected, programId]);
  };
  const [issuing, setIssuing] = useState<number | null>(null);
  const [revokingCertificateId, setRevokingCertificateId] = useState<number | null>(null);
  const [retryingReminder, setRetryingReminder] = useState<number | null>(null);
  const issueCertificate = (person: LearningProgressParticipant) => {
    setIssuing(person.applicationId);
    issue.mutate({ id: person.applicationId }, {
      onSuccess: () => void client.invalidateQueries({ queryKey: getGetLearningProgressAnalyticsQueryKey() }),
      onError: () => undefined,
      onSettled: () => setIssuing(null),
    });
  };
  const revokeCertificate = (certificateId: number, reason: string, onSuccess: () => void) => {
    revoke.reset();
    setRevokingCertificateId(certificateId);
    revoke.mutate({ id: certificateId, data: { reason } }, {
      onSuccess: () => {
        void client.invalidateQueries({ queryKey: getGetLearningProgressAnalyticsQueryKey() });
        onSuccess();
      },
      onSettled: () => setRevokingCertificateId(null),
    });
  };
  const allParticipants = visiblePrograms.flatMap(program => program.participants);
  const retryFailedReminder = (delivery: CourseReminderFailure) => {
    retryReminder.reset();
    setRetryingReminder(delivery.id);
    retryReminder.mutate({ id: delivery.id }, {
      onSuccess: () => void client.invalidateQueries({ queryKey: getGetLearningProgressAnalyticsQueryKey() }),
      onSettled: () => setRetryingReminder(null),
    });
  };
  const completion = allParticipants.length ? allParticipants.reduce((sum, person) => sum + person.completionPercent, 0) / allParticipants.length : 0;
  const totalTime = allParticipants.reduce((sum, person) => sum + person.activeSeconds, 0);
  const certs = visiblePrograms.reduce((sum, program) => sum + program.certificatesIssued, 0);
  return <section className="learning-space lp-analytics" data-testid="learning-progress-analytics">
    <header className="lp-heading lp-analytics-heading"><div><span className="lp-eyebrow">{t('COHORT OVERSIGHT / COORDINATOR')}</span><h2>{t('Learning progress, at a glance.')}</h2><p>{t('Review completion, active learning time and certificate readiness across cohorts.')}</p></div><label className="lp-program-filter"><span>{t('PROGRAM')}</span><select value={selected} onChange={event => setSelected(event.target.value)} data-testid="select-learning-analytics-program"><option value="">{t('All programs')}</option>{programCatalog.map(program => <option key={program.programId} value={program.programId}>{program.programName}</option>)}</select></label></header>
    {query.isLoading ? <div className="lp-skeleton-stack"><div /><div /><div /></div>
      : query.isError ? <div className="lp-state lp-error"><CircleAlert size={20} /><div><b>{t('Learning analytics could not load.')}</b><span>{t('Retry to reconnect to coordinator learning records.')}</span></div><button className="lp-button lp-button-outline" onClick={() => void query.refetch()} data-testid="button-retry-learning-analytics"><RefreshCw size={14} />{t('Retry')}</button></div>
      : !programs.length ? <div className="lp-state"><Activity size={20} /><div><b>{t('No learning records yet.')}</b><span>{t('Progress appears after a cohort has published learning modules.')}</span></div></div>
      : <>
        <div className="lp-metrics"><article><span><Activity size={15} />{t('PARTICIPANTS')}</span><b data-testid="text-learning-participant-count">{allParticipants.length}</b><small>{t('Across selected programs')}</small></article><article><span><Check size={15} />{t('AVERAGE COMPLETION')}</span><b>{completion.toFixed(1)}%</b><small>{t('Required learning pathway')}</small></article><article><span><Hourglass size={15} />{t('ACTIVE LEARNING')}</span><b>{fmtTime(totalTime)}</b><small>{t('Combined recorded time')}</small></article><article><span><Award size={15} />{t('CERTIFICATES')}</span><b>{certs}</b><small>{t('Issued by coordinators')}</small></article></div>
         <CohortAssessmentHistory programs={programs} selectedProgramIds={selectedHistoryPrograms} onToggleProgram={toggleHistoryProgram} />
        {issue.isError && <div className="lp-mutation-error" role="alert" data-testid="error-issue-certificate">{t('Certificate could not be issued. Confirm eligibility and try again.')}</div>}
        {revoke.isError && <div className="lp-mutation-error" role="alert" data-testid="error-revoke-certificate">{t('Certificate could not be revoked. Refresh the record and try again.')}</div>}
         {retryReminder.isError && <div className="lp-mutation-error" role="alert" data-testid="error-retry-course-reminder">{t('Reminder could not be queued. Refresh the cohort status and try again.')}</div>}
        {visiblePrograms.map(program => <article className="lp-analytics-program" key={program.programId} data-testid={`card-learning-analytics-program-${program.programId}`}>
          <header><div><span className="lp-eyebrow">{t('COHORT LEARNING')}</span><h3>{program.programName}</h3></div><div className="lp-program-stats"><span><b>{program.completedParticipants}</b> / {program.participantCount} {t('completed')}</span><span><b>{program.averageCompletionPercent.toFixed(1)}%</b> {t('average progress')}</span><span><b>{fmtTime(program.averageActiveSeconds)}</b> {t('average active time')}</span><span><b>{program.averageQuizPercent == null ? '—' : `${program.averageQuizPercent.toFixed(1)}%`}</b> {t('quiz average')}</span><span><b>{program.certificatesIssued}</b> {t('certificates')}</span></div></header>
           <CohortAssessmentGainPanel programId={program.programId} summary={program.assessmentGain} />
           <ReminderDeliveryPanel program={program} retryingId={retryingReminder} onRetry={retryFailedReminder} />
          <div className="lp-roster-head"><span>{t('PARTICIPANT / BUSINESS')}</span><span>{t('COURSE COMPLETION')}</span><span>{t('ACTIVE TIME')}</span><span>{t('CERTIFICATE STATE')}</span></div>
          {program.participants.length ? program.participants.map(person => <ParticipantRow key={person.applicationId} participant={person} onIssue={issueCertificate} pending={issuing === person.applicationId} onRevoke={revokeCertificate} revoking={revokingCertificateId === person.certificate?.id} />) : <div className="lp-empty-roster">{t('No participants are enrolled in this learning cohort yet.')}</div>}
        </article>)}
      </>}
  </section>;
}
