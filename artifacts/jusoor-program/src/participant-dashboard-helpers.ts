import type {
  ParticipantBusinessPlan,
  ParticipantCourses,
  ParticipantEnrollment,
  ParticipantIdeaValidationWorkbook,
  ParticipantLearningProgress,
  ParticipantAnnouncement,
} from '@workspace/api-client-react';

export interface ParticipantNextAction {
  href: string | null;
  titleKey: string;
  buttonLabelKey: string | null;
  descriptionKey: string;
  detail?: string;
  stepKey?: string;
  date?: string;
  dateLabelKey?: string;
  time?: string;
}

const ideaStepKeys = [
  'customerSegment',
  'problemStatement',
  'riskiestAssumption',
  'mvpExperiment',
  'successSignal',
  'evidenceAndNextStep',
] as const;
const planStepKeys = ['acquisitionChannels', 'outreachActions', 'fulfillmentSteps', 'reviewSignals'] as const;

function sessionDateTime(date: string, time: string, timeZone: string): Date {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!dateMatch || !timeMatch) return new Date(Number.NaN);

  const target = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: 0,
  };
  const targetAsUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
  );
  const normalizedTarget = new Date(targetAsUtc);
  if (
    normalizedTarget.getUTCFullYear() !== target.year
    || normalizedTarget.getUTCMonth() + 1 !== target.month
    || normalizedTarget.getUTCDate() !== target.day
  ) return new Date(Number.NaN);

  const formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const partsAt = (instant: number) => Object.fromEntries(
    formatter.formatToParts(new Date(instant))
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)]),
  );
  const sameWallTime = (parts: Record<string, number>) =>
    parts.year === target.year
    && parts.month === target.month
    && parts.day === target.day
    && parts.hour === target.hour
    && parts.minute === target.minute
    && parts.second === target.second;

  // Sample both sides of the target to capture either offset when DST changes.
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = targetAsUtc + hours * 60 * 60 * 1000;
    const parts = partsAt(sample);
    const representedAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    offsets.add(representedAsUtc - sample);
  }

  const candidates = [...offsets]
    .map(offset => targetAsUtc - offset)
    .filter(instant => sameWallTime(partsAt(instant)))
    .sort((left, right) => left - right);
  // A missing wall time during the spring-forward gap has no matching instant.
  // For the repeated fall-back hour, choose the earlier occurrence.
  return new Date(candidates[0] ?? Number.NaN);
}

export function getParticipantNextAction({
  enrollments,
  courses,
  learningProgress,
  ideaWorkbooks,
  businessPlans,
  announcements,
  now = new Date(),
}: {
  enrollments: ParticipantEnrollment[];
  courses?: ParticipantCourses;
  learningProgress?: ParticipantLearningProgress;
  ideaWorkbooks?: ParticipantIdeaValidationWorkbook[];
  businessPlans?: ParticipantBusinessPlan[];
  announcements?: ParticipantAnnouncement[];
  now?: Date;
}): ParticipantNextAction | null {
  const accepted = enrollments.filter(enrollment => enrollment.applicationStatus === 'accepted');
  if (!accepted.length) {
    return enrollments.length > 0 ? {
      href: '/participant#participant-program-progress',
      titleKey: 'Check your application progress',
      buttonLabelKey: 'View application status',
      descriptionKey: 'Your application status is shown in your cohort section.',
    } : null;
  }

  const assignment = accepted
    .flatMap(enrollment => enrollment.assignments)
    .filter(item => !item.submittedAt && item.status !== 'submitted' && item.status !== 'reviewed' && item.dueDate)
    .sort((left, right) => (left.dueDate || '').localeCompare(right.dueDate || ''))[0];
  if (assignment) {
    return {
      href: `/participant/learning#participant-assignment-${assignment.id}`,
      titleKey: 'Complete your next assignment',
      buttonLabelKey: 'Open assignment',
      descriptionKey: 'Your earliest outstanding assignment:',
      detail: assignment.title,
      date: assignment.dueDate || undefined,
      dateLabelKey: 'Due',
    };
  }

  const nextSession = accepted
    .flatMap(enrollment => enrollment.sessions)
    .filter(session => session.status === 'scheduled' && session.startTime)
    .map(session => ({
      session,
      startsAt: sessionDateTime(session.scheduledDate, session.startTime || '', session.timeZone),
    }))
    .filter(({ startsAt }) => startsAt.getTime() >= now.getTime() && startsAt.getTime() <= now.getTime() + 24 * 60 * 60 * 1000)
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())[0];
  if (nextSession) {
    return {
      href: `/participant/schedule#participant-session-${nextSession.session.id}`,
      titleKey: 'Prepare for your upcoming session',
      buttonLabelKey: 'View session',
      descriptionKey: 'Your next cohort session starts within 24 hours:',
      detail: nextSession.session.title,
      date: nextSession.session.scheduledDate,
      dateLabelKey: 'Starts',
      time: nextSession.session.startTime || undefined,
    };
  }

  const updateNeedingReply = [...((announcements || []) as (ParticipantAnnouncement & { needsReply: boolean })[])]
    .filter(announcement => announcement.needsReply && !announcement.readAt)
    .sort((left, right) => right.scheduledFor.localeCompare(left.scheduledFor))[0];
  if (updateNeedingReply) {
    return {
      href: `/participant/updates#participant-announcement-${updateNeedingReply.id}`,
      titleKey: 'Reply to a program update',
      buttonLabelKey: 'Open update',
      descriptionKey: 'Your reply is needed for this unread update:',
      detail: updateNeedingReply.title,
    };
  }

  if (courses && learningProgress) {
    const completedModules = new Set(learningProgress.programs.flatMap(program => program.modules)
      .filter(module => module.completionStatus === 'completed')
      .map(module => module.moduleId));
    const availableModules = courses.programs.flatMap((program, programIndex) => program.modules.map(module => ({
      ...module,
      programIndex,
    })))
      .filter(module => !module.releaseAt || new Date(module.releaseAt).getTime() <= now.getTime())
      .filter(module => !completedModules.has(module.id))
      .sort((left, right) => left.programIndex - right.programIndex || left.position - right.position);
    const nextModule = availableModules[0];
    if (nextModule) {
      return {
        href: `/participant/learning#participant-course-module-${nextModule.id}`,
        titleKey: 'Continue your next learning module',
        buttonLabelKey: 'Open learning module',
        descriptionKey: 'Your next available module is:',
        detail: nextModule.title,
        date: nextModule.dueAt || undefined,
        dateLabelKey: 'Due',
      };
    }
  }

  const unfinishedIdea = (ideaWorkbooks || []).map(workbook => ({
    workbook,
    firstUnstarted: ideaStepKeys.findIndex(key => !workbook[key].trim()),
  })).find(item => item.firstUnstarted >= 0);
  if (unfinishedIdea) {
    const stepNumber = unfinishedIdea.firstUnstarted + 1;
    return {
      href: `/participant/workbooks/idea#participant-founder-workbook-${unfinishedIdea.workbook.applicationId}`,
      titleKey: stepNumber === 1 ? 'Start step 1 of your workbook' : 'Continue your founder workbook',
      buttonLabelKey: stepNumber === 1 ? 'Start workbook step' : 'Continue workbook',
      descriptionKey: 'Continue with your founder workbook:',
      stepKey: `Step ${stepNumber} of 6`,
    };
  }

  const unfinishedPlan = (businessPlans || []).map(plan => ({
    plan,
    firstUnstarted: planStepKeys.findIndex(key => !plan[key].trim()),
  })).find(item => item.firstUnstarted >= 0);
  if (unfinishedPlan) {
    const stepNumber = unfinishedPlan.firstUnstarted + 1;
    return {
      href: `/participant/workbooks/plan#participant-business-plan-workbook-${unfinishedPlan.plan.applicationId}`,
      titleKey: stepNumber === 1 ? 'Start step 1 of your business plan' : 'Continue your business plan',
      buttonLabelKey: stepNumber === 1 ? 'Start business plan step' : 'Continue workbook',
      descriptionKey: 'Continue with your business plan:',
      stepKey: `Step ${stepNumber} of 4`,
    };
  }

  if (!ideaWorkbooks || !businessPlans) return null;
  return {
    href: null,
    titleKey: 'You’re all caught up',
    buttonLabelKey: null,
    descriptionKey: 'There are no due assignments, upcoming sessions, unread updates needing a reply, released modules, or unfinished workbook steps right now.',
  };
}

export function participantSignInInstructions(email: string, expiresAt: Date): string {
  const expiry = expiresAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
  return `An invitation email was sent to ${email}. Create an account or sign in to the Program Hub using this verified email by ${expiry} to access the assigned program and business.`;
}
