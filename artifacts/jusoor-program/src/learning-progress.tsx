import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CertificatePdfPage, createCertificatePdf, renderCertificatePdf } from './certificate-pdf';
import {
  getGetLearningProgressAnalyticsQueryKey,
  getGetParticipantLearningProgressQueryKey,
  useGetLearningProgressAnalytics,
  useGetParticipantLearningProgress,
  useIssueCourseCertificate,
  useRetryCourseReminder,
  useRecordParticipantCourseActivity,
  useRecordParticipantModuleProgress,
} from '@workspace/api-client-react';
import type { CourseProgressModule, CourseProgressQuiz, CourseReminderFailure, LearningProgressParticipant, LearningProgressProgram, ParticipantLearningProgram } from '@workspace/api-client-react';
import {
  Activity, Award, BookOpen, CalendarClock, Check, CircleAlert, Clock3,
  Download, FileCheck2, Hourglass, Medal, RefreshCw, Sparkles,
} from 'lucide-react';
import { currentLanguage, t, useAppLanguage } from './language';
import './learning-progress.css';

const fmtDate = (value?: string | null) => value ? new Date(value).toLocaleDateString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : t('Not set');
const fmtDateTime = (value?: string | null) => value ? new Date(value).toLocaleString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : t('No activity yet');
const fmtTimestamp = (value: string) => new Date(value).toLocaleString(currentLanguage() === 'ar' ? 'ar-JO' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
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
function firstAssessmentAverage(quizzes: CourseProgressQuiz[], type: 'pre_course' | 'post_course'): number | null {
  const percentages = quizzes.filter(quiz => quiz.assessmentType === type && quiz.firstScore != null && quiz.totalQuestions > 0)
    .map(quiz => quiz.firstScore! / quiz.totalQuestions * 100);
  return percentages.length ? percentages.reduce((sum, value) => sum + value, 0) / percentages.length : null;
}
function AssessmentComparison({ quizzes, testId }: { quizzes: CourseProgressQuiz[]; testId: string }) {
  const pre = firstAssessmentAverage(quizzes, 'pre_course');
  const post = firstAssessmentAverage(quizzes, 'post_course');
  const delta = pre == null || post == null ? null : post - pre;
  const score = (value: number | null) => value == null ? '—' : `${value.toFixed(1)}%`;
  return <div className="lp-assessment-comparison" data-testid={testId}>
    <div><span>{t('Pre-course first score')}</span><b data-testid={`${testId}-pre`}>{score(pre)}</b></div>
    <div><span>{t('Post-course first score')}</span><b data-testid={`${testId}-post`}>{score(post)}</b></div>
    <div className={delta == null ? '' : delta > 0 ? 'is-gain' : delta < 0 ? 'is-loss' : ''}><span>{t('Percentage-point change')}</span><b data-testid={`${testId}-change`}>{delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)} ${t('pp')}`}</b></div>
  </div>;
}

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
  const certificateRef = useRef<HTMLElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const downloadCertificate = async () => {
    const certificateElement = certificateRef.current;
    if (!certificateElement || downloading) return;
    setDownloading(true);
    setDownloadFailed(false);
    try {
      const canvas = await renderCertificatePdf(certificateElement);
      const pdf = createCertificatePdf(canvas);
      pdf.save(`Jusoor-Certificate-${certificate.certificateCode}.pdf`);
    } catch (error) {
      console.error('Could not generate the certificate PDF.', error);
      setDownloadFailed(true);
    } finally {
      setDownloading(false);
    }
  };
  return <article className="learning-certificate" data-testid={`card-certificate-${certificate.id}`}>
    <div className="certificate-seal"><Award size={21} /></div>
    <div className="certificate-copy"><span className="lp-eyebrow">{t('CERTIFICATE ISSUED')}</span><h3>{certificate.programName}</h3><p>{t('Awarded to')} <b>{certificate.participantName}</b>{certificate.businessName ? ` · ${certificate.businessName}` : ''}</p><div className="certificate-meta"><span>{t('CODE')} <b data-testid={`text-certificate-code-${certificate.id}`}>{certificate.certificateCode}</b></span><span>{t('ISSUED')} {fmtDate(certificate.issuedAt)}</span><span>{t('BY')} {certificate.issuedByName}</span></div></div>
    <button type="button" className="lp-button lp-button-outline print-hide" onClick={downloadCertificate} disabled={downloading} data-testid={`button-download-certificate-${certificate.id}`}><Download size={15} />{downloading ? t('Preparing PDF…') : t('Download PDF')}</button>
    {downloadFailed && <p className="certificate-download-error" role="alert">{t('Certificate PDF could not be downloaded. Please try again.')}</p>}
    <CertificatePdfPage
      ref={certificateRef}
      certificate={certificate}
      issuedDateEnglish={fmtDate(certificate.issuedAt)}
      issuedDateArabic={new Date(certificate.issuedAt).toLocaleDateString('ar-JO', { day: 'numeric', month: 'long', year: 'numeric' })}
    />
  </article>;
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

function ParticipantRow({ participant, onIssue, pending }: { participant: LearningProgressParticipant; onIssue: (participant: LearningProgressParticipant) => void; pending: boolean }) {
  const certReady = participant.completedRequiredModules >= participant.totalRequiredModules && participant.totalRequiredModules > 0;
  return <details className="lp-participant" data-testid={`row-learning-participant-${participant.applicationId}`}>
    <summary><span className="lp-person"><i>{participant.founderName.slice(0, 1).toUpperCase()}</i><span><b>{participant.founderName}</b><small>{participant.businessName} · {participant.email}</small></span></span><span className="lp-participant-progress"><b>{Math.round(participant.completionPercent)}%</b><i><span style={{ width: `${Math.max(0, Math.min(100, participant.completionPercent))}%` }} /></i></span><span className="lp-participant-time">{fmtTime(participant.activeSeconds)}</span><span className={`lp-status ${participant.certificate ? 'completed' : certReady ? 'in_progress' : 'not_started'}`}>{participant.certificate ? t('Issued') : certReady ? t('Ready for review') : t('In progress')}</span><span className="lp-detail-chevron">+</span></summary>
    <div className="lp-participant-detail">
       <div className="lp-detail-facts"><span>{t('Required modules')} <b>{participant.completedRequiredModules}/{participant.totalRequiredModules}</b></span><span>{t('Last activity')} <b>{fmtDateTime(participant.lastActivityAt)}</b></span><span>{t('Best quiz results')} <b>{participant.quizzes.length ? participant.quizzes.map(quiz => formattedQuizGrade(quiz, quiz.bestScore)).join(' · ') : '—'}</b></span></div>
        {hasCourseAssessment(participant.quizzes) && <AssessmentComparison quizzes={participant.quizzes} testId={`assessment-comparison-coordinator-${participant.applicationId}`} />}
      {participant.modules.length > 0 && <div className="lp-coordinator-modules">{participant.modules.map(module => <span key={module.moduleId} className={module.completionStatus === 'completed' ? 'is-done' : ''}><i />{module.title}{module.isRequired ? ` · ${t('Required')}` : ` · ${t('Optional')}`}</span>)}</div>}
      {participant.certificate ? <div className="lp-issued"><FileCheck2 size={15} />{t('Certificate')} <b>{participant.certificate.certificateCode}</b> · {fmtDate(participant.certificate.issuedAt)}</div>
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

export function LearningProgressAnalytics() {
  useAppLanguage();
  const client = useQueryClient();
  const [selected, setSelected] = useState('');
  const params = useMemo(() => selected ? { programId: Number(selected) } : undefined, [selected]);
  const query = useGetLearningProgressAnalytics(params, { query: { queryKey: getGetLearningProgressAnalyticsQueryKey(params), refetchOnWindowFocus: true, refetchInterval: 30_000 } });
  const issue = useIssueCourseCertificate();
  const retryReminder = useRetryCourseReminder();
  const programs = query.data?.programs || [];
  const programCatalogRef = useRef(programs);
  if (programs.length) {
    const merged = new Map([...programCatalogRef.current, ...programs].map(program => [program.programId, program]));
    programCatalogRef.current = [...merged.values()];
  }
  const programCatalog = programCatalogRef.current;
  const visiblePrograms = selected ? programs.filter(program => String(program.programId) === selected) : programs;
  const [issuing, setIssuing] = useState<number | null>(null);
  const [retryingReminder, setRetryingReminder] = useState<number | null>(null);
  const issueCertificate = (person: LearningProgressParticipant) => {
    setIssuing(person.applicationId);
    issue.mutate({ id: person.applicationId }, {
      onSuccess: () => void client.invalidateQueries({ queryKey: getGetLearningProgressAnalyticsQueryKey(params) }),
      onError: () => undefined,
      onSettled: () => setIssuing(null),
    });
  };
  const allParticipants = visiblePrograms.flatMap(program => program.participants);
  const retryFailedReminder = (delivery: CourseReminderFailure) => {
    retryReminder.reset();
    setRetryingReminder(delivery.id);
    retryReminder.mutate({ id: delivery.id }, {
      onSuccess: () => void client.invalidateQueries({ queryKey: getGetLearningProgressAnalyticsQueryKey(params) }),
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
        {issue.isError && <div className="lp-mutation-error" role="alert" data-testid="error-issue-certificate">{t('Certificate could not be issued. Confirm eligibility and try again.')}</div>}
         {retryReminder.isError && <div className="lp-mutation-error" role="alert" data-testid="error-retry-course-reminder">{t('Reminder could not be queued. Refresh the cohort status and try again.')}</div>}
        {visiblePrograms.map(program => <article className="lp-analytics-program" key={program.programId} data-testid={`card-learning-analytics-program-${program.programId}`}>
          <header><div><span className="lp-eyebrow">{t('COHORT LEARNING')}</span><h3>{program.programName}</h3></div><div className="lp-program-stats"><span><b>{program.completedParticipants}</b> / {program.participantCount} {t('completed')}</span><span><b>{program.averageCompletionPercent.toFixed(1)}%</b> {t('average progress')}</span><span><b>{fmtTime(program.averageActiveSeconds)}</b> {t('average active time')}</span><span><b>{program.averageQuizPercent == null ? '—' : `${program.averageQuizPercent.toFixed(1)}%`}</b> {t('quiz average')}</span><span><b>{program.certificatesIssued}</b> {t('certificates')}</span></div></header>
           <ReminderDeliveryPanel program={program} retryingId={retryingReminder} onRetry={retryFailedReminder} />
          <div className="lp-roster-head"><span>{t('PARTICIPANT / BUSINESS')}</span><span>{t('COURSE COMPLETION')}</span><span>{t('ACTIVE TIME')}</span><span>{t('CERTIFICATE STATE')}</span></div>
          {program.participants.length ? program.participants.map(person => <ParticipantRow key={person.applicationId} participant={person} onIssue={issueCertificate} pending={issuing === person.applicationId} />) : <div className="lp-empty-roster">{t('No participants are enrolled in this learning cohort yet.')}</div>}
        </article>)}
      </>}
  </section>;
}
