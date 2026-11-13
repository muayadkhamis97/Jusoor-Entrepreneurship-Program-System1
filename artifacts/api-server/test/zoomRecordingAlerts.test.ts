import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";

const {
  canRetryZoomRecordingAlertEmail,
  isGoogleDriveRecordingUrl,
  parseZoomRecordingReadyEvent,
} = await import("../src/lib/zoom-recording-alerts");

test("extracts only Zoom event identity and ignores recording file URLs", () => {
  const envelope = {
    event: "recording.completed",
    event_ts: 1_797_000_000_000,
    payload: {
      object: {
        id: 123456789,
        uuid: "meeting-uuid",
        recording_files: [
          {
            download_url: "https://zoom.example/private-download?token=secret",
            play_url: "https://zoom.example/private-player",
          },
        ],
      },
    },
  };

  const parsed = parseZoomRecordingReadyEvent(envelope);
  assert.deepEqual(parsed, {
    meetingId: "123456789",
    eventKey: "recording.completed:123456789:meeting-uuid:1797000000000",
  });
  assert.doesNotMatch(JSON.stringify(parsed), /zoom\.example|secret|download_url|play_url/);
  assert.deepEqual(parseZoomRecordingReadyEvent(envelope), parsed);
});

test("rejects malformed recording events without stable deduplication fields", () => {
  assert.equal(
    parseZoomRecordingReadyEvent({
      event: "recording.completed",
      payload: { object: { id: 123456789, uuid: "meeting-uuid" } },
    }),
    null,
  );
  assert.equal(
    parseZoomRecordingReadyEvent({
      event: "meeting.started",
      event_ts: 1,
      payload: { object: { id: 123456789, uuid: "meeting-uuid" } },
    }),
    null,
  );
});

test("only valid Google Drive file links can clear a readiness alert", () => {
  assert.equal(
    isGoogleDriveRecordingUrl("https://drive.google.com/file/d/abc_123/view"),
    true,
  );
  assert.equal(
    isGoogleDriveRecordingUrl("https://drive.google.com/open?id=abc_123"),
    true,
  );
  assert.equal(
    isGoogleDriveRecordingUrl("https://zoom.us/rec/share/private"),
    false,
  );
  assert.equal(
    isGoogleDriveRecordingUrl("https://drive.google.com.evil.example/file/d/abc/view"),
    false,
  );
});

test("only pending and definite failures can be retried", () => {
  const now = new Date("2026-10-12T12:00:00.000Z");
  assert.equal(canRetryZoomRecordingAlertEmail("failed", null, now), true);
  assert.equal(canRetryZoomRecordingAlertEmail("pending", null, now), true);
  assert.equal(
    canRetryZoomRecordingAlertEmail("sending", new Date(now.getTime() - 60_000), now),
    false,
  );
  assert.equal(
    canRetryZoomRecordingAlertEmail("sending", new Date(now.getTime() - 600_000), now),
    false,
  );
  assert.equal(canRetryZoomRecordingAlertEmail("uncertain", null, now), false);
  assert.equal(canRetryZoomRecordingAlertEmail("sent", null, now), false);
});
