# Component inventory

Source: the selected local landing mockup, `artifacts/mockup-sandbox/src/components/mockups/landing/JusoorStack.tsx`, inspected 2026-10-16. It is project-owned workspace code; no third-party component implementation was copied. The source defines inline visual families rather than a separate library.

All five families fit in the first and only chunk. No later chunks or pending admin components are implied. Inventory order follows source reuse: action patterns, text hierarchy, surfaces, structural rules, then the overlay consuming those primitives.

| Family | Reference | Dependencies / blockers | Importance evidence | Chunk | Status |
|---|---|---|---|---|---|
| Button | [button](components/button.md) | React, cn; none | Primary, text and language actions at source lines 47–48, 66–71, 105–107, 124–129, 147 | 1 | implemented |
| Typography | [typography](components/typography.md) | React, cn; none | Hero, headings, body and labels throughout lines 45–79 | 1 | implemented |
| PaperSurface | [paper-surface](components/paper-surface.md) | React, cn; none | Main paper and dialog panel, lines 34–40, 77 | 1 | implemented |
| Rule | [rule](components/rule.md) | React, cn; none | Header, action rail, route dividers and eyebrow rules, lines 42, 52, 58, 63–64 | 1 | implemented |
| Dialog | [dialog](components/dialog.md) | Button, Typography, PaperSurface; none | Two controlled page-local dialog states, lines 4, 76–81, 140–149 | 1 | implemented |

## Boundaries

The initial stock component library and its demos were removed from this new package. It exports only these five UI families, not inputs, tables, badges, navigation, courses or application screens. No source mockup or application file was changed. Broader app migration needs an explicit scope decision and coverage of required app primitives before deleting any local implementation.
