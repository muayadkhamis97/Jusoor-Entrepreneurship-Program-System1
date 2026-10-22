---
name: Program Google Sheets
description: Per-program spreadsheet ownership, staff visibility, and synchronization boundaries.
---

Use a separate Google spreadsheet for each program. The app's Google Sheets connection belongs to the project, while Admins can see every active program's connection and Program Staff can see only programs assigned to them. Show connection status and the workbook link in the app, but Google sharing permissions still determine who can open a workbook. Data flows one way from the platform into Sheets; edits in Sheets do not update platform records.

**Why:** the user chose separate spreadsheets per program and asked Admins and staff to see connection status and the sheet link. Workbook access is governed by Google's sharing settings.

**How to apply:** keep API responses scoped to active programs and the authenticated staff member's assignments; disclose one-way data transfer and Google sharing requirements anywhere the connection is configured.
