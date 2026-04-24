# Phase 1 Architecture

## Checkpoint saved

The current browser-only app has been preserved as the pre-backend checkpoint in:

- `checkpoints/2026-04-10-pre-phase1/README.md`
- `checkpoints/2026-04-10-pre-phase1/first-run-state.json`

## Phase 1 objective

Move from demo-only browser storage to a secure backend while preserving the current product behavior:

- youth, Youth leader, and bishop roles
- ward access rules
- Young Men / Young Women scoping
- bishop approval for Youth leaders
- templates, copied goals, and editable goals
- repeated checklist units with completion dates
- deadlines and extension approval

## Recommended stack

- Frontend: existing app, gradually migrated from browser storage to API calls
- Auth + database: Supabase
- Database: PostgreSQL with row-level security
- Hosting later: Vercel, Netlify, or Supabase-hosted frontend
- Mobile later: React Native + Expo using the same backend

## Phase 1 deliverables started here

1. Backend schema in `backend/supabase/schema.sql`
2. Frontend storage abstraction in `storage-adapter.js`
3. App code prepared to depend on a storage adapter instead of raw `localStorage`
4. Written migration guidance for the next implementation steps

## Immediate next implementation steps

1. Create a Supabase project.
2. Run `backend/supabase/schema.sql`.
3. Add Supabase anon URL and key to the frontend.
4. Replace demo account creation and login with Supabase Auth.
5. Replace local state loads and saves with queries/mutations.
6. Move permission enforcement to database policies and server-side checks.

## Important note

The current app still runs in demo mode today. This Phase 1 work creates the production foundation, but does not yet switch live behavior away from browser storage because the runtime and deployment toolchain are not available in this shell.
