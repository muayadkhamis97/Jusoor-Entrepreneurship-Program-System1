BEGIN;
CREATE TABLE "jusoor_program_google_sheets_connections" (
  "program_id" integer PRIMARY KEY NOT NULL REFERENCES "jusoor_programs"("id") ON DELETE cascade,
  "spreadsheet_id" text NOT NULL,
  "spreadsheet_url" text NOT NULL,
  "spreadsheet_title" text NOT NULL,
  "next_application_row" integer DEFAULT 2 NOT NULL,
  "next_judging_response_row" integer DEFAULT 2 NOT NULL,
  "connected_by_staff_id" integer REFERENCES "jusoor_staff_members"("id") ON DELETE set null,
  "connected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_synced_at" timestamp with time zone,
  "last_error" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "jusoor_program_google_sheets_rows_check" CHECK ("next_application_row" >= 2 AND "next_judging_response_row" >= 2)
);
CREATE UNIQUE INDEX "jusoor_program_google_sheets_spreadsheet_uq" ON "jusoor_program_google_sheets_connections" USING btree ("spreadsheet_id");
CREATE TABLE "jusoor_program_google_sheets_sync_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "program_id" integer NOT NULL REFERENCES "jusoor_programs"("id") ON DELETE cascade,
  "source_type" text NOT NULL,
  "source_id" integer NOT NULL,
  "sheet_row" integer NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
  "claimed_at" timestamp with time zone,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "jusoor_program_google_sheets_event_source_check" CHECK ("source_type" IN ('application', 'judging_response')),
  CONSTRAINT "jusoor_program_google_sheets_event_status_check" CHECK ("status" IN ('pending', 'processing', 'synced', 'failed', 'skipped')),
  CONSTRAINT "jusoor_program_google_sheets_event_row_check" CHECK ("sheet_row" >= 2 AND "revision" >= 1 AND "attempts" >= 0)
);
CREATE UNIQUE INDEX "jusoor_program_google_sheets_event_source_uq" ON "jusoor_program_google_sheets_sync_events" USING btree ("program_id","source_type","source_id");
CREATE INDEX "jusoor_program_google_sheets_event_queue_idx" ON "jusoor_program_google_sheets_sync_events" USING btree ("status","next_attempt_at","id");
CREATE INDEX "jusoor_program_google_sheets_event_program_idx" ON "jusoor_program_google_sheets_sync_events" USING btree ("program_id","status");
COMMIT;
