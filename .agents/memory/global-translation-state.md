---
name: Global translation state
description: Timing constraint for the module-level translation helper used with React language context.
---

When descendants use the module-level `t()` helper, synchronize its active locale before rendering those descendants. Updating it only in a layout effect can briefly render the old-language text after a language switch even when the document direction has changed.

**Why:** The global helper does not read React context, so it can otherwise lag behind the provider's newly selected language.

**How to apply:** If the language provider or translation helper changes, verify in a rendered browser test that the translated text, `lang`, and `dir` update together on the same toggle.
