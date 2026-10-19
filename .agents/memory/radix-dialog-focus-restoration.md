---
name: Radix dialog lifecycle
description: Preserve modal safeguards across dialog unmount, focus restoration, and scroll-lock edge cases.
---

For dialogs rendered only while their application state is open, keep a reference to the focused opener and verify that focus returns after the dialog has fully unmounted. In this pattern, schedule the fallback restoration after the unmount; the normal dialog close-focus callback alone may not run when the root disappears with its content.

**Why:** In the Jusoor UI, focus trapping and Escape dismissal worked, but Escape left focus on the document body until focus restoration was tested after the unmount.

**How to apply:** Prefer a controlled dialog root that remains mounted where practical. If existing flows conditionally mount the root, test Escape and explicit close actions in a real browser and restore focus only if the opener remains connected.

## Scroll-lock safeguards

Keep modal semantics intact when fixing dependency lifecycle failures. Prefer a narrow, tracked dependency guard over disabling modal behavior or replacing a browser API globally.

**Why:** A scroll-lock handler can receive a cleared boundary ref during lifecycle transitions. Disabling modal behavior would avoid the handler at the cost of focus and background-scroll protections.

**How to apply:** Keep missing-boundary and normal-scroll regression coverage, plus browser focus/dismissal checks, when upgrading or removing a dependency workaround.
