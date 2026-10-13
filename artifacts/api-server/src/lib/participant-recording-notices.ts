import { isGoogleDriveRecordingUrl } from "./zoom-recording-alerts";

export type RecordingNoticeReference = {
  sessionId: number | null;
  programId: number | null;
  recordingVersion: number | null;
};

export type RecordingSessionState = {
  id: number;
  programId: number | null;
  recordingVersion: number;
  recordingUrl: string | null;
};

export function getRecordingLinkTransition(
  currentUrl: string | null,
  nextUrl: string | null,
  currentVersion: number,
): { shouldCreateNotice: boolean; recordingVersion: number } {
  const shouldCreateNotice =
    nextUrl !== currentUrl && isGoogleDriveRecordingUrl(nextUrl);
  return {
    shouldCreateNotice,
    recordingVersion: currentVersion + (shouldCreateNotice ? 1 : 0),
  };
}

export function isCurrentRecordingNotice(
  notice: RecordingNoticeReference,
  session: RecordingSessionState | null | undefined,
): boolean {
  return Boolean(
    session &&
      notice.sessionId === session.id &&
      notice.programId !== null &&
      notice.programId === session.programId &&
      notice.recordingVersion !== null &&
      notice.recordingVersion === session.recordingVersion &&
      isGoogleDriveRecordingUrl(session.recordingUrl),
  );
}

export function canParticipantAccessRecordingNotice(
  notice: RecordingNoticeReference,
  acceptedProgramIds: ReadonlySet<number>,
): boolean {
  return notice.programId !== null && acceptedProgramIds.has(notice.programId);
}
