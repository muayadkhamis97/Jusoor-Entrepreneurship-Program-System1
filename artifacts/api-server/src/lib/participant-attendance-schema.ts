import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export async function isParticipantAttendanceSchemaReady(): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT
      to_regclass('public.jusoor_session_participant_attendance') IS NOT NULL AS attendance_table_ready,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'jusoor_session_participant_attendance'
          AND column_name = 'program_id'
      ) AS attendance_program_scope_ready,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'jusoor_zoom_attendance_participants'
          AND column_name = 'matched_application_id'
      ) AS zoom_participant_match_ready`,
  );
  return Boolean(
    result.rows[0]?.attendance_table_ready &&
    result.rows[0]?.attendance_program_scope_ready &&
    result.rows[0]?.zoom_participant_match_ready
  );
}
