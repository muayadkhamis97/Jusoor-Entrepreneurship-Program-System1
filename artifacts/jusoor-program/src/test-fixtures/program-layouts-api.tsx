// Resolved only by the program-layout browser test. No API requests or writes.
export * from '@workspace/api-client-react';

const result = <T,>(data: T) => ({
  data,
  isLoading: false,
  isError: false,
  dataUpdatedAt: 1,
  refetch: async () => ({ data }),
});
const mutation = () => ({
  isPending: false,
  isError: false,
  mutate: () => {},
  mutateAsync: async () => undefined,
  reset: () => {},
});

const programName = 'Regional founders and community enterprise development';
const moduleRecord = {
  id: 31,
  programId: 4,
  title: 'اختبار الافتراضات وبناء نموذج عمل مستدام',
  description: 'A practical guide for testing customer assumptions and documenting a sustainable business model.',
  position: 1,
  releaseAt: '2026-10-14T12:00:00.000Z',
  dueAt: null,
  isRequired: true,
  isPublished: true,
  materials: [{
    id: 32,
    moduleId: 31,
    title: 'Customer interview guide and field notes',
    description: null,
    kind: 'document',
    language: 'ar',
    packageFormat: null,
    externalUrl: null,
    objectPath: 'fixture/interview-guide.pdf',
    fileName: 'customer-interview-guide.pdf',
    contentType: 'application/pdf',
    fileSize: 8192,
    allowedRoles: ['participant', 'trainer', 'coordinator'],
    position: 1,
  }],
};

export const useListPrograms = () => result([{ id: 4, name: programName, status: 'active', createdAt: '2026-01-01T00:00:00.000Z' }]);
export const useGetProgramAnalytics = () => result({
  programs: [{ id: 4, name: programName }],
  selectedProgramId: 4,
  from: '2026-07-01',
  to: '2026-10-14',
  summary: {
    applications: 18, acceptedApplications: 12, activeBusinesses: 10, businesses: 12,
    attendanceRate: 82, present: 41, attendanceMarks: 50, assignmentCompletionRate: 70,
    submissions: 14, assignments: 20, sessionsInRange: 8, completedSupport: 7,
    unansweredQuestions: 2, grantsAwarded: 3, grantAmount: 12000,
  },
  stageCounts: [],
  attendanceTrend: [],
  engagement: [],
  sessions: [{
    id: 52,
    title: 'Founder onboarding and planning session',
    scheduledDate: '2026-10-10',
    status: 'completed',
    attendanceMarks: 1,
    present: 1,
  }],
});
export const useGetProgramSessionInteractionAnalytics = () => result({ from: '2026-07-01', to: '2026-10-14', activities: [], trend: [] });
export const useListProgramImpactKpis = () => result([]);
export const useListProgramAnalyticsReportLayouts = () => result([]);
export const useGetSessionAttendanceRegister = () => result({
  session: {
    id: 52,
    programId: 4,
    title: 'Founder onboarding and planning session',
    scheduledDate: '2026-10-10',
    zoomMeetingId: 'fixture-zoom-meeting',
  },
  roster: [
    {
      participantId: 71,
      participantName: 'ليلى حسن',
      participantEmail: 'layla@example.test',
      businessId: 81,
      businessName: 'مشروع مجتمعي طويل الاسم — Regional Sustainable Food and Community Enterprise',
      status: 'present',
      notes: null,
      markedAt: null,
      source: 'zoom',
      attendedSeconds: 3120,
      firstJoinedAt: null,
      lastLeftAt: null,
    },
    {
      participantId: 72,
      participantName: 'Omar Haddad',
      participantEmail: 'omar@example.test',
      businessId: 82,
      businessName: 'Community Food Cooperative',
      status: null,
      notes: null,
      markedAt: null,
      source: null,
      attendedSeconds: null,
      firstJoinedAt: null,
      lastLeftAt: null,
    },
  ],
  zoomSync: {
    status: 'completed',
    attempts: 1,
    participantCount: 3,
    matchedCount: 1,
    unmatchedCount: 1,
    lastAttemptAt: null,
    syncedAt: null,
    lastError: null,
  },
  unmatchedParticipants: [{
    id: 91,
    displayName: 'Guest participant with a long display name',
    email: 'guest.participant@example.test',
    joinTime: null,
    leaveTime: null,
    durationSeconds: 1800,
    matchedParticipantId: null,
    matchedParticipantName: null,
    ignoredAt: null,
  }],
});
export const useSaveSessionAttendance = mutation;
export const useQueueZoomAttendanceSync = mutation;
export const useResolveZoomAttendanceParticipant = mutation;
export const useCreateProgramImpactKpi = mutation;
export const useUpdateProgramImpactKpi = mutation;
export const useDeleteProgramImpactKpi = mutation;
export const useSaveProgramImpactKpiValues = mutation;
export const useCreateProgramAnalyticsReportLayout = mutation;
export const useUpdateProgramAnalyticsReportLayout = mutation;
export const useDeleteProgramAnalyticsReportLayout = mutation;

export const useGetCourseManagement = () => result({ programs: [{ id: 4, name: programName, modules: [moduleRecord] }] });
export const useCreateCourseMaterial = mutation;
export const useCreateCourseModule = mutation;
export const useDeleteCourseMaterial = mutation;
export const useDeleteCourseModule = mutation;
export const useRequestCourseUploadUrl = mutation;
export const useUpdateCourseMaterial = mutation;
export const useUpdateCourseModule = mutation;
export const useGetCourseModuleQuizzes = () => result({ quizzes: [] });
export const useGetCourseQuizAttempts = () => result({ attempts: [] });
export const useGetParticipantCourseModuleQuizzes = () => result({ quizzes: [] });
export const useCreateCourseQuiz = mutation;
export const useSubmitParticipantCourseQuizAttempt = mutation;
export const useUpdateCourseQuiz = mutation;
export const useGetCourseDiscussions = () => result({ moduleTitle: 'Discussion', posts: [] });
export const useGetParticipantCourseDiscussions = () => result({ moduleTitle: 'Discussion', posts: [] });
export const useCreateCourseDiscussionPost = mutation;
export const useCreateParticipantCourseDiscussionPost = mutation;

export const useListGrantAwards = () => result([{
  pitchId: 81,
  businessId: 64,
  businessName: 'مشروع مجتمعي طويل الاسم — Regional Sustainable Food and Community Enterprise',
  founderName: 'ليلى حسن',
  programName,
  eventType: 'demo_day',
  eventDate: '2026-10-10',
  grantAmount: 5000,
  totalReceived: 1800,
  remainingAmount: 3200,
  status: 'partially_received',
  receipts: [],
}]);
export const useCreateGrantReceipt = mutation;
