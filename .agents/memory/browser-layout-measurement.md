---
name: Browser layout measurement
description: Avoid false clipping failures when measuring native button content in Chromium.
---

Use text Range rectangles and icon bounds to judge vertical button clipping;
do not treat `scrollHeight > clientHeight` alone as proof of hidden text.

**Why:** Chromium reported a 32px scroll height for 30px client-height bordered
buttons whose painted labels and icons were fully inside their bounds. A strict
scroll-height assertion incorrectly rejected every compact directory action.

**How to apply:** For browser layout regressions, measure painted text and icon
rectangles against button and clipping-ancestor bounds. Keep horizontal overflow
checks, and include deliberate broken-layout controls to prove the assertions
still detect clipped labels and separated icons.

For computed-style checks over several selector families, include each matched
element's stable identity with its measurements; do not infer the failing control
from array position alone.

**Why:** A browser locator returned controls in an order that differed from the
selector list, initially attributing a text-size mismatch to the wrong action.

**How to apply:** Return a test ID or class with every computed-style record and
assert results by control identity.
