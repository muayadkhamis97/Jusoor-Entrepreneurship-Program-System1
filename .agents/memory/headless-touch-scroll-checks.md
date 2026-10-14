---
name: Headless touch-scroll checks
description: A limitation encountered while checking horizontal mobile navigation in the project’s Chromium browser tests.
---

In the headless Chromium browser fixture, CDP-synthesized touch gestures did not change the horizontal scroll position of the mobile navigation, even though its overflow and keyboard scrolling worked. The fixture can still verify a touch-capable browser, `overflow-x: auto`, and that setting the scroll position reaches the final destination in both LTR and RTL.

**Why:** Repeated touch-event and synthesized-gesture attempts produced no scroll movement, so treating that as a product failure would give a misleading result.

**How to apply:** For similar mobile horizontal scrollers, verify real destination visibility through the scroll range and confirm touch-capable browser context plus overflow behavior. Do not infer a product defect solely from this headless gesture limitation.
