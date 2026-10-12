---
name: Date-only API fields
description: Preserve calendar-day values through OpenAPI code generation and Drizzle.
---

Represent calendar dates as `YYYY-MM-DD` strings from the API boundary through storage. In this workspace, marking a string as OpenAPI `format: date` makes generated Zod validation coerce it into a JavaScript `Date`, which can change the JSON shape and lose date-only semantics.

**Why:** Database date columns use Drizzle string mode, and follow-up dates represent calendar days rather than instants.

**How to apply:** Use a date-only string schema with a `YYYY-MM-DD` pattern, then validate that the date exists before persisting it. Keep timestamps as date-time values.
