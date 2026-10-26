---
name: Global translation state
description: Timing constraint for the module-level translation helper used with React language context.
---

When descendants use the module-level `t()` helper, synchronize its active locale before rendering those descendants. Updating it only in a layout effect can briefly render the old-language text after a language switch even when the document direction has changed.

**Why:** The global helper does not read React context, so it can otherwise lag behind the provider's newly selected language.

**How to apply:** If the language provider or translation helper changes, verify in a rendered browser test that the translated text, `lang`, and `dir` update together on the same toggle.

After a deferred translation import fails, retry it through a fresh document load rather than calling `import()` again in the same module graph. The browser can retain the failed module import, so an identical in-page import may not fetch it again. Preserve the Arabic retry intent in a temporary URL parameter so retries also work when local storage is unavailable, then remove that parameter once a language is ready.

**Why:** The browser test showed that retrying the same dynamic import after an aborted chunk request did not recover; a fresh navigation successfully issued a new request.

**How to apply:** Use a fresh page load for retries of failed deferred chunks, and verify both that a new request occurs and that temporary retry state is removed after success or fallback.
