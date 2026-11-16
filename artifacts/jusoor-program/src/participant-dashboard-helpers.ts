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

function localDateTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
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
      href: '#participant-program-progress',
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
      href: `#participant-assignment-${assignment.id}`,
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
    .map(session => ({ session, startsAt: localDateTime(session.scheduledDate, session.startTime || '') }))
    .filter(({ startsAt }) => startsAt.getTime() >= now.getTime() && startsAt.getTime() <= now.getTime() + 24 * 60 * 60 * 1000)
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())[0];
  if (nextSession) {
    return {
      href: `#participant-session-${nextSession.session.id}`,
      titleKey: 'Prepare for your upcoming session',
      buttonLabelKey: 'View session',
      descriptionKey: 'Your next cohort session starts within 24 hours:',
      detail: nextSession.session.title,
      date: nextSession.session.scheduledDate,
      dateLabelKey: 'Starts',
      time: nextSession.session.startTime || undefined,
    };
  }

  const updateNeedingReply = [...(announcements || [])]
    .filter(announcement => announcement.needsReply && !announcement.readAt)
    .sort((left, right) => right.scheduledFor.localeCompare(left.scheduledFor))[0];
  if (updateNeedingReply) {
    return {
      href: `#participant-announcement-${updateNeedingReply.id}`,
      titleKey: 'Reply to a program update',
      buttonLabelKey: 'Open update',
      descriptionKey: 'Your reply is needed for this unread update:',
      detail: updateNeedingReply.title,
    };
  }

  if (!courses || !learningProgress || !ideaWorkbooks || !businessPlans) return null;

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
      href: `#participant-course-module-${nextModule.id}`,
      titleKey: 'Continue your next learning module',
      buttonLabelKey: 'Open learning module',
      descriptionKey: 'Your next available module is:',
      detail: nextModule.title,
      date: nextModule.dueAt || undefined,
      dateLabelKey: 'Due',
    };
  }

  const unfinishedIdea = ideaWorkbooks.map(workbook => ({
    workbook,
    firstUnstarted: ideaStepKeys.findIndex(key => !workbook[key].trim()),
  })).find(item => item.firstUnstarted >= 0);
  if (unfinishedIdea) {
    const stepNumber = unfinishedIdea.firstUnstarted + 1;
    return {
      href: `#participant-founder-workbook-${unfinishedIdea.workbook.applicationId}`,
      titleKey: stepNumber === 1 ? 'Start step 1 of your workbook' : 'Continue your founder workbook',
      buttonLabelKey: stepNumber === 1 ? 'Start workbook step' : 'Continue workbook',
      descriptionKey: 'Continue with your founder workbook:',
      stepKey: `Step ${stepNumber} of 6`,
    };
  }

  const unfinishedPlan = businessPlans.map(plan => ({
    plan,
    firstUnstarted: planStepKeys.findIndex(key => !plan[key].trim()),
  })).find(item => item.firstUnstarted >= 0);
  if (unfinishedPlan) {
    const stepNumber = unfinishedPlan.firstUnstarted + 1;
    return {
      href: `#participant-business-plan-workbook-${unfinishedPlan.plan.applicationId}`,
      titleKey: stepNumber === 1 ? 'Start step 1 of your business plan' : 'Continue your business plan',
      buttonLabelKey: stepNumber === 1 ? 'Start business plan step' : 'Continue workbook',
      descriptionKey: 'Continue with your business plan:',
      stepKey: `Step ${stepNumber} of 4`,
    };
  }

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
