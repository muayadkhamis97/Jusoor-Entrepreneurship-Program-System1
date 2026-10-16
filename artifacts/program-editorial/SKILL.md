# Program Editorial

Read `docs/AGENTS.md` before consuming or editing the system.

## Extracted visual rules

- Deep teal anchors the primary action; terracotta emphasizes the editorial phrase and small section markers.
- Use Fraunces for the primary message and section/dialog titles, DM Sans for UI/body, IBM Plex Mono for short structural labels.
- Pair an oversized, tight serif headline with a restrained-width body paragraph.
- Prefer open paper and thin divider rules for supporting regions. Reserve framed panels and shadows for the overlay rather than filling every region with cards.
- Primary buttons use alternating 3px/14px corners; the language utility uses a capsule.
- Source content uses generous desktop gutters and collapses the three-column action rail at760px.
- Motion is restrained: 2px hover lift/200ms and short entry rises. The source explicitly reduces animation when reduced motion is requested.

These observations come from the selected mockup's CSS/structure, not written brand guidelines.

## Adaptations and limits

All dark colors, semantic roles, chart slots and sidebar roles are derived extensions. The native modal implementation with explicit Tab boundary wrap, stronger interactive input boundary and focus rings are accessibility adaptations. Muted text is slightly darkened from the source to remain readable on paper2; the accent foreground is adjusted, and small accent labels/text-action hover blend with foreground rather than using the raw large-heading accent. Arabic tracking is reset when `lang="ar"`; no dedicated Arabic font or full translation set was provided. No authentic standalone logo asset was present, so the guide uses a text heading.

The source-backed catalog is complete at five families. This is not yet a complete admin dashboard kit. Do not substitute it for app inputs/tables/navigation that it does not supply, or delete those local primitives during a partial migration.

The user requested extraction first and approval before any existing mockup or application screen is changed. Do not apply it without that approval.
