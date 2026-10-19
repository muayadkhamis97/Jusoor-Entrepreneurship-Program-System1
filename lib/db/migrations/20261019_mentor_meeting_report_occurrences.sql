ALTER TABLE jusoor_mentor_meeting_reports
  ADD COLUMN calendly_meeting_id integer
    REFERENCES jusoor_calendly_meetings(id) ON DELETE SET NULL,
  ADD COLUMN google_calendar_meeting_id integer
    REFERENCES jusoor_google_calendar_meetings(id) ON DELETE SET NULL,
  ADD CONSTRAINT jusoor_mentor_meeting_reports_one_occurrence_check
    CHECK (num_nonnulls(calendly_meeting_id, google_calendar_meeting_id) <= 1);

CREATE UNIQUE INDEX jusoor_mentor_meeting_reports_calendly_meeting_unique
  ON jusoor_mentor_meeting_reports(calendly_meeting_id)
  WHERE calendly_meeting_id IS NOT NULL;

CREATE UNIQUE INDEX jusoor_mentor_meeting_reports_google_meeting_unique
  ON jusoor_mentor_meeting_reports(google_calendar_meeting_id)
  WHERE google_calendar_meeting_id IS NOT NULL;
