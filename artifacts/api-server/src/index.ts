import app from "./app";
import { logger } from "./lib/logger";
import { startZoomAttendanceSyncWorker } from "./lib/zoom-attendance";
import { startCourseReminderWorker } from "./lib/course-reminders";
import { startGoogleCalendarSyncWorker } from "./lib/googleCalendarSync";
import { startMentorFollowUpDigestWorker } from "./lib/mentor-follow-up-digests";
import { startAnnouncementEmailWorker } from "./lib/announcement-email";
import { startGoogleSheetsSyncWorker } from "./lib/googleSheetsSync";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startZoomAttendanceSyncWorker();
  startCourseReminderWorker();
  startGoogleCalendarSyncWorker();
  startMentorFollowUpDigestWorker();
  startAnnouncementEmailWorker();
  startGoogleSheetsSyncWorker();
});
