import { asc, eq } from "drizzle-orm";
import {
  applicationsTable,
  businessesTable,
  chatMessagesTable,
  chatThreadsTable,
  db,
  grantReceiptsTable,
  mentorMeetingReportsTable,
  mentorSessionRequestsTable,
  participantBusinessMembershipsTable,
  pitchesTable,
  programsTable,
  sessionParticipantAttendanceTable,
  sessionsTable,
  staffAssignmentAuditEventsTable,
  staffMembersTable,
  staffProgramAssignmentsTable,
  staffProgramRolesTable,
  supportTable,
} from "@workspace/db";

type SheetCell = string | number;
type SnapshotSheet = {
  title: string;
  headers: readonly string[];
  rows: SheetCell[][];
};

const businessHeaders = [
  "Record type", "Record ID", "Program", "Business", "Person", "Email", "Role or stage", "Status", "Date", "Details",
] as const;
const operationsHeaders = [
  "Record type", "Record ID", "Program", "Session", "Business", "Participant", "Date", "Status", "Details",
] as const;
const mentorHeaders = [
  "Record type", "Record ID", "Program", "Business", "Mentor or contact", "Email", "Date", "Status", "Details",
] as const;
const chatHeaders = [
  "Thread ID", "Conversation type", "Program", "Business", "Participant", "Sender", "Sender role", "Message", "Sent at",
] as const;

export const PROGRAM_SNAPSHOT_SHEETS = [
  { title: "Businesses and teams", headers: businessHeaders },
  { title: "Programs sessions attendance", headers: operationsHeaders },
  { title: "Mentor support grants", headers: mentorHeaders },
  { title: "Staff and participant chats", headers: chatHeaders },
] as const;

const dateCell = (value: Date | string | null | undefined): string => {
  if (!value) return "";
  return value instanceof Date ? value.toISOString() : value;
};
const detailsCell = (value: unknown): string => JSON.stringify(value ?? {});

export async function loadProgramSnapshotSheets(programId: number): Promise<SnapshotSheet[]> {
  const [program] = await db.select({
    id: programsTable.id,
    name: programsTable.name,
    format: programsTable.format,
    status: programsTable.status,
    startDate: programsTable.startDate,
    endDate: programsTable.endDate,
    applicationDeadline: programsTable.applicationDeadline,
    mentorSessionsPerBusiness: programsTable.mentorSessionsPerBusiness,
  }).from(programsTable).where(eq(programsTable.id, programId)).limit(1);
  const programName = program?.name ?? "";

  const businesses = await db.select().from(businessesTable)
    .where(eq(businessesTable.programId, programId)).orderBy(asc(businessesTable.id));
  const businessNames = new Map(businesses.map((business) => [business.id, business.businessName]));
  const businessRows: SheetCell[][] = businesses.map((business) => [
    "Business", business.id, programName, business.businessName, business.founderName, business.email,
    business.stage, "", dateCell(business.applicationDate ?? business.createdAt),
    detailsCell({
      phone: business.phone, industry: business.industry, needs: business.needs, notes: business.notes,
    }),
  ]);

  const memberships = await db.select({
    id: participantBusinessMembershipsTable.id,
    businessId: businessesTable.id,
    businessName: businessesTable.businessName,
    founderName: applicationsTable.founderName,
    email: applicationsTable.email,
    phone: applicationsTable.phone,
    status: applicationsTable.status,
    assignedAt: participantBusinessMembershipsTable.createdAt,
  }).from(participantBusinessMembershipsTable)
    .innerJoin(applicationsTable, eq(participantBusinessMembershipsTable.applicationId, applicationsTable.id))
    .innerJoin(businessesTable, eq(participantBusinessMembershipsTable.businessId, businessesTable.id))
    .where(eq(businessesTable.programId, programId))
    .orderBy(asc(participantBusinessMembershipsTable.id));
  businessRows.push(...memberships.map((member) => [
    "Participant business membership", member.id, programName, member.businessName, member.founderName,
    member.email, "Participant", member.status, dateCell(member.assignedAt),
    detailsCell({ businessId: member.businessId, phone: member.phone }),
  ]));

  const staffAssignments = await db.select({
    id: staffProgramAssignmentsTable.id,
    staffId: staffMembersTable.id,
    email: staffMembersTable.email,
    role: staffMembersTable.role,
    createdAt: staffProgramAssignmentsTable.createdAt,
  }).from(staffProgramAssignmentsTable)
    .innerJoin(staffMembersTable, eq(staffProgramAssignmentsTable.staffId, staffMembersTable.id))
    .where(eq(staffProgramAssignmentsTable.programId, programId))
    .orderBy(asc(staffProgramAssignmentsTable.id));
  businessRows.push(...staffAssignments.map((assignment) => [
    "Program staff assignment", assignment.id, programName, "", assignment.email, assignment.email,
    assignment.role, "", dateCell(assignment.createdAt), detailsCell({ staffId: assignment.staffId }),
  ]));

  const specialistRoles = await db.select({
    id: staffProgramRolesTable.id,
    staffId: staffMembersTable.id,
    email: staffMembersTable.email,
    role: staffProgramRolesTable.role,
    createdAt: staffProgramRolesTable.createdAt,
  }).from(staffProgramRolesTable)
    .innerJoin(staffMembersTable, eq(staffProgramRolesTable.staffId, staffMembersTable.id))
    .where(eq(staffProgramRolesTable.programId, programId))
    .orderBy(asc(staffProgramRolesTable.id));
  businessRows.push(...specialistRoles.map((role) => [
    "Program specialist role", role.id, programName, "", role.email, role.email,
    role.role, "", dateCell(role.createdAt), detailsCell({ staffId: role.staffId }),
  ]));

  const assignmentHistory = await db.select().from(staffAssignmentAuditEventsTable)
    .where(eq(staffAssignmentAuditEventsTable.programId, programId))
    .orderBy(asc(staffAssignmentAuditEventsTable.id));
  businessRows.push(...assignmentHistory.map((event) => [
    "Assignment change", event.id, programName, event.affectedApplicationName ?? "", event.actorEmail,
    event.affectedAccountEmail ?? "", event.assignmentType, "", dateCell(event.createdAt),
    detailsCell({ previous: event.previousValue, next: event.newValue }),
  ]));

  const operationsRows: SheetCell[][] = [];
  if (program) {
    operationsRows.push([
      "Program", program.id, program.name, "", "", "", dateCell(program.startDate), program.status,
      detailsCell({
        format: program.format, endDate: program.endDate, applicationDeadline: program.applicationDeadline,
        mentorSessionsPerBusiness: program.mentorSessionsPerBusiness,
      }),
    ]);
  }
  const sessions = await db.select().from(sessionsTable)
    .where(eq(sessionsTable.programId, programId)).orderBy(asc(sessionsTable.id));
  operationsRows.push(...sessions.map((session) => [
    "Session", session.id, programName, session.title, "", session.facilitator ?? "",
    dateCell(session.scheduledDate), session.status,
    detailsCell({
      type: session.type, startTime: session.startTime, durationMinutes: session.durationMinutes,
      deliveryMode: session.deliveryMode, location: session.location,
    }),
  ]));

  const attendance = await db.select({
    id: sessionParticipantAttendanceTable.id,
    sessionId: sessionsTable.id,
    sessionTitle: sessionsTable.title,
    participantId: applicationsTable.id,
    participantName: applicationsTable.founderName,
    participantEmail: applicationsTable.email,
    businessId: businessesTable.id,
    businessName: businessesTable.businessName,
    status: sessionParticipantAttendanceTable.status,
    markedAt: sessionParticipantAttendanceTable.markedAt,
    notes: sessionParticipantAttendanceTable.notes,
    source: sessionParticipantAttendanceTable.source,
    attendedSeconds: sessionParticipantAttendanceTable.attendedSeconds,
  }).from(sessionParticipantAttendanceTable)
    .innerJoin(sessionsTable, eq(sessionParticipantAttendanceTable.sessionId, sessionsTable.id))
    .innerJoin(applicationsTable, eq(sessionParticipantAttendanceTable.participantId, applicationsTable.id))
    .innerJoin(businessesTable, eq(sessionParticipantAttendanceTable.businessId, businessesTable.id))
    .where(eq(sessionParticipantAttendanceTable.programId, programId))
    .orderBy(asc(sessionParticipantAttendanceTable.id));
  operationsRows.push(...attendance.map((row) => [
    "Participant attendance", row.id, programName, row.sessionTitle, row.businessName, row.participantName,
    dateCell(row.markedAt), row.status,
    detailsCell({
      sessionId: row.sessionId, participantId: row.participantId, participantEmail: row.participantEmail,
      businessId: row.businessId, source: row.source, attendedSeconds: row.attendedSeconds, notes: row.notes,
    }),
  ]));

  const supports = await db.select({
    id: supportTable.id,
    businessId: businessesTable.id,
    businessName: businessesTable.businessName,
    provider: supportTable.provider,
    mentorEmail: staffMembersTable.email,
    type: supportTable.type,
    topic: supportTable.topic,
    scheduledDate: supportTable.scheduledDate,
    status: supportTable.status,
    notes: supportTable.notes,
    createdAt: supportTable.createdAt,
  }).from(supportTable)
    .innerJoin(businessesTable, eq(supportTable.businessId, businessesTable.id))
    .leftJoin(staffMembersTable, eq(supportTable.mentorStaffId, staffMembersTable.id))
    .where(eq(businessesTable.programId, programId)).orderBy(asc(supportTable.id));
  const mentorRows: SheetCell[][] = supports.map((item) => [
    "Support engagement", item.id, programName, item.businessName, item.provider, item.mentorEmail ?? "",
    dateCell(item.scheduledDate ?? item.createdAt), item.status,
    detailsCell({ type: item.type, topic: item.topic, notes: item.notes, businessId: item.businessId }),
  ]);

  const reports = await db.select().from(mentorMeetingReportsTable)
    .innerJoin(supportTable, eq(mentorMeetingReportsTable.supportId, supportTable.id))
    .innerJoin(businessesTable, eq(supportTable.businessId, businessesTable.id))
    .where(eq(businessesTable.programId, programId)).orderBy(asc(mentorMeetingReportsTable.id));
  mentorRows.push(...reports.map(({ jusoor_mentor_meeting_reports: report, jusoor_support: support }) => [
    "Mentor meeting report", report.id, programName, report.businessName, report.coachName, report.coachEmail,
    dateCell(report.meetingDate), "Submitted",
    detailsCell({
      attendees: report.attendees, sessionSummary: report.sessionSummary, smartGrowActions: report.smartGrowActions,
      achievementsAndOpportunities: report.achievementsAndOpportunities, teamRecommendations: report.teamRecommendations,
      supportId: support.id,
    }),
  ]));

  const requests = await db.select({
    id: mentorSessionRequestsTable.id,
    businessName: businessesTable.businessName,
    mentorEmail: staffMembersTable.email,
    status: mentorSessionRequestsTable.status,
    decision: mentorSessionRequestsTable.decision,
    createdAt: mentorSessionRequestsTable.createdAt,
    resolvedAt: mentorSessionRequestsTable.resolvedAt,
    reportedSessions: mentorSessionRequestsTable.reportedSessionsAtRequest,
    target: mentorSessionRequestsTable.sessionTargetAtRequest,
    approved: mentorSessionRequestsTable.approvedAdditionalSessions,
  }).from(mentorSessionRequestsTable)
    .innerJoin(businessesTable, eq(mentorSessionRequestsTable.businessId, businessesTable.id))
    .innerJoin(staffMembersTable, eq(mentorSessionRequestsTable.mentorStaffId, staffMembersTable.id))
    .where(eq(mentorSessionRequestsTable.programId, programId)).orderBy(asc(mentorSessionRequestsTable.id));
  mentorRows.push(...requests.map((request) => [
    "Additional mentor session request", request.id, programName, request.businessName, request.mentorEmail,
    request.mentorEmail, dateCell(request.createdAt), request.decision ?? request.status,
    detailsCell({
      reportedSessions: request.reportedSessions, sessionTarget: request.target,
      approvedAdditionalSessions: request.approved, resolvedAt: dateCell(request.resolvedAt),
    }),
  ]));

  const pitches = await db.select({
    id: pitchesTable.id,
    businessId: businessesTable.id,
    businessName: businessesTable.businessName,
    eventType: pitchesTable.eventType,
    eventDate: pitchesTable.eventDate,
    judges: pitchesTable.judges,
    score: pitchesTable.score,
    grantDecision: pitchesTable.grantDecision,
    grantAmount: pitchesTable.grantAmount,
    feedback: pitchesTable.feedback,
  }).from(pitchesTable)
    .innerJoin(businessesTable, eq(pitchesTable.businessId, businessesTable.id))
    .where(eq(businessesTable.programId, programId)).orderBy(asc(pitchesTable.id));
  mentorRows.push(...pitches.map((pitch) => [
    "Pitch and grant decision", pitch.id, programName, pitch.businessName, "", "",
    dateCell(pitch.eventDate), pitch.grantDecision,
    detailsCell({
      businessId: pitch.businessId, eventType: pitch.eventType, judges: pitch.judges,
      score: pitch.score, grantAmount: pitch.grantAmount, feedback: pitch.feedback,
    }),
  ]));

  const receipts = await db.select({
    id: grantReceiptsTable.id,
    pitchId: pitchesTable.id,
    businessName: businessesTable.businessName,
    kind: grantReceiptsTable.kind,
    amount: grantReceiptsTable.amount,
    receivedOn: grantReceiptsTable.receivedOn,
    reference: grantReceiptsTable.reference,
    notes: grantReceiptsTable.notes,
  }).from(grantReceiptsTable)
    .innerJoin(pitchesTable, eq(grantReceiptsTable.pitchId, pitchesTable.id))
    .innerJoin(businessesTable, eq(pitchesTable.businessId, businessesTable.id))
    .where(eq(businessesTable.programId, programId)).orderBy(asc(grantReceiptsTable.id));
  mentorRows.push(...receipts.map((receipt) => [
    "Grant receipt", receipt.id, programName, receipt.businessName, "", "",
    dateCell(receipt.receivedOn), receipt.kind,
    detailsCell({
      pitchId: receipt.pitchId, amount: receipt.amount, reference: receipt.reference, notes: receipt.notes,
    }),
  ]));

  const chats = await db.select({
    threadId: chatThreadsTable.id,
    kind: chatThreadsTable.kind,
    programName: programsTable.name,
    businessName: businessesTable.businessName,
    participantName: applicationsTable.founderName,
    senderName: chatMessagesTable.senderName,
    senderRole: chatMessagesTable.senderRole,
    body: chatMessagesTable.body,
    createdAt: chatMessagesTable.createdAt,
  }).from(chatMessagesTable)
    .innerJoin(chatThreadsTable, eq(chatMessagesTable.threadId, chatThreadsTable.id))
    .innerJoin(programsTable, eq(chatThreadsTable.programId, programsTable.id))
    .leftJoin(businessesTable, eq(chatThreadsTable.businessId, businessesTable.id))
    .leftJoin(applicationsTable, eq(chatThreadsTable.participantId, applicationsTable.id))
    .where(eq(chatThreadsTable.programId, programId)).orderBy(asc(chatMessagesTable.id));
  const chatRows = chats.map((message) => [
    message.threadId, message.kind, message.programName, message.businessName ?? "",
    message.participantName ?? "", message.senderName, message.senderRole, message.body, dateCell(message.createdAt),
  ]);

  return [
    { title: PROGRAM_SNAPSHOT_SHEETS[0].title, headers: businessHeaders, rows: businessRows },
    { title: PROGRAM_SNAPSHOT_SHEETS[1].title, headers: operationsHeaders, rows: operationsRows },
    { title: PROGRAM_SNAPSHOT_SHEETS[2].title, headers: mentorHeaders, rows: mentorRows },
    { title: PROGRAM_SNAPSHOT_SHEETS[3].title, headers: chatHeaders, rows: chatRows },
  ];
}
