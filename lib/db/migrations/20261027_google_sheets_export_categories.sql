ALTER TABLE "jusoor_program_google_sheets_connections"
  ADD COLUMN "export_business_team" boolean DEFAULT true NOT NULL,
  ADD COLUMN "export_operations" boolean DEFAULT true NOT NULL,
  ADD COLUMN "export_mentoring_grants" boolean DEFAULT true NOT NULL,
  ADD COLUMN "export_chats" boolean DEFAULT true NOT NULL;
