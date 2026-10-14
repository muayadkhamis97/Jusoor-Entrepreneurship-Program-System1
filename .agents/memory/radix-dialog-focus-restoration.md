---
name: Radix dialog focus restoration
description: Focus-return behavior when dialog roots are conditionally mounted and removed with application state.
---

For dialogs rendered only while their application state is open, keep a reference to the focused opener and verify that focus returns after the dialog has fully unmounted. In this pattern, schedule the fallback restoration after the unmount; the normal dialog close-focus callback alone may not run when the root disappears with its content.

**Why:** In the Jusoor UI, focus trapping and Escape dismissal worked, but Escape left focus on the document body until focus restoration was tested after the unmount.

**How to apply:** Prefer a controlled dialog root that remains mounted where practical. If existing flows conditionally mount the root, test Escape and explicit close actions in a real browser and restore focus only if the opener remains connected.
