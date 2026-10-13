import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canParticipantAccessRecordingNotice,
  getRecordingLinkTransition,
  isCurrentRecordingNotice,
} from "../src/lib/participant-recording-notices";

const firstRecording = "https://drive.google.com/file/d/recording_one/view";
const replacementRecording = "https://drive.google.com/file/d/recording_two/view";
const zoomRecording = "https://zoom.us/rec/share/not-a-drive-recording";

test("a first Drive link and a replacement create distinct recording versions", () => {
  assert.deepEqual(getRecordingLinkTransition(null, firstRecording, 0), {
    shouldCreateNotice: true,
    recordingVersion: 1,
  });
  assert.deepEqual(getRecordingLinkTransition(firstRecording, replacementRecording, 1), {
    shouldCreateNotice: true,
    recordingVersion: 2,
  });
});

test("repeated saves, unrelated edits, removals, and non-Drive links do not create notices", () => {
  assert.deepEqual(getRecordingLinkTransition(firstRecording, firstRecording, 1), {
    shouldCreateNotice: false,
    recordingVersion: 1,
  });
  assert.deepEqual(getRecordingLinkTransition(firstRecording, null, 1), {
    shouldCreateNotice: false,
    recordingVersion: 1,
  });
  assert.deepEqual(getRecordingLinkTransition(firstRecording, zoomRecording, 1), {
    shouldCreateNotice: false,
    recordingVersion: 1,
  });
  assert.deepEqual(getRecordingLinkTransition(null, zoomRecording, 0), {
    shouldCreateNotice: false,
    recordingVersion: 0,
  });
});

test("only the current recording version for the same cohort remains active", () => {
  const notice = { sessionId: 71, programId: 8, recordingVersion: 1 };
  assert.equal(isCurrentRecordingNotice(notice, {
    id: 71,
    programId: 8,
    recordingVersion: 1,
    recordingUrl: firstRecording,
  }), true);
  assert.equal(isCurrentRecordingNotice(notice, {
    id: 71,
    programId: 8,
    recordingVersion: 2,
    recordingUrl: replacementRecording,
  }), false);
  assert.equal(isCurrentRecordingNotice(notice, {
    id: 71,
    programId: 8,
    recordingVersion: 1,
    recordingUrl: null,
  }), false);
  assert.equal(isCurrentRecordingNotice(notice, {
    id: 71,
    programId: 9,
    recordingVersion: 1,
    recordingUrl: firstRecording,
  }), false);
});

test("recording notices can only be read by participants accepted into their cohort", () => {
  const notice = { sessionId: 71, programId: 8, recordingVersion: 1 };
  assert.equal(canParticipantAccessRecordingNotice(notice, new Set([8])), true);
  assert.equal(canParticipantAccessRecordingNotice(notice, new Set([9])), false);
  assert.equal(canParticipantAccessRecordingNotice(notice, new Set()), false);
  assert.equal(
    canParticipantAccessRecordingNotice({ ...notice, programId: null }, new Set([8])),
    false,
  );
});
