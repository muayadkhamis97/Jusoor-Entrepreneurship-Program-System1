---
name: Browser error diagnostics
description: Preserving useful error details in the development console log transport.
---

Do not infer that a browser exception has no message when the collected console logs show `{}`.

**Why:** The development log transport serialized logged JavaScript Error objects as empty objects, concealing a failed module download that the error boundary visibly displayed.

**How to apply:** For diagnostics, log an explicit error message string in development rather than relying only on an Error object. Keep detailed internal messages out of production UI. Correlate the browser error with API and asset requests before changing authorization or database schema.
