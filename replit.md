# Jusoor Entrepreneurship Program Hub

An operations and learning platform for Jusoor entrepreneurship cohorts, from application intake through incubation, mentoring, pitch day, and demo-day grants.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional env: `REPLIT_APP_URL` — published app URL used in participant invitation links

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Product feature reference: `attached_assets/Features_for_Entrepreneurship_Program_System___ENT_(Dec_2024)_1791802478905.docx`
- API contract: `lib/api-spec/openapi.yaml`
- Database schema: `lib/db/src/schema`
- Program web app: `artifacts/jusoor-program`
- API server: `artifacts/api-server`

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

The platform supports program applications, participant and staff role-specific views, cohort sessions and recordings, training assignments and questions, mentor and expert support, and pitch-day/demo-day grant decisions.

## Feature reference and scope

Use the attached December 2024 feature specification as the reference for future platform features. It covers program operations, mentoring, analytics and reporting, grants, integrations, accessibility, and LMS capabilities.

Skip requirements in the document's Security and Compliance sections, except for role-based permissions that restrict access to course materials according to a user's role.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
