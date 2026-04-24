# Supabase Frontend Setup

This is the next frontend step after the Phase 1 schema work.

## Files added

- `app-config.js`
- `app-config.example.js`
- `supabase-browser-adapter.js`
- `auth-client.js`
- `storage-adapter.js`

## Current behavior

The app still runs in `demo-local` mode by default.

That means:

- browser storage is still the live data source
- demo accounts still work
- the UI now knows whether it is running in demo mode or preparing for Supabase mode

## To move toward Supabase mode

1. Copy `app-config.example.js` over `app-config.js`.
2. Fill in:
   - Supabase project URL
   - Supabase anon key
   - optional project label
   - optional admin function name if you rename `admin-user-management`
3. Keep the built-in browser SDK script in `index.html` so `window.supabase` is available before `supabase-browser-adapter.js`.
4. Apply `backend/supabase/schema.sql`, including the transition table `app_runtime_snapshots`.
5. Deploy `backend/supabase/functions/admin-user-management`.
6. Switch `app-config.js` to `runtimeMode: "supabase"`.
7. Keep `storage-adapter.js` only as a fallback or offline cache if desired.

## Why this matters

This setup gives the frontend a clear runtime switch:

- `demo-local`
- `supabase`

That reduces the amount of churn when the app is converted from local browser state to a secure hosted backend.

## Current bridge behavior

The app now has an async backend client contract. In `supabase` mode it is prepared to load and save the whole app snapshot through `app_runtime_snapshots` while the relational API migration is still in progress.

Relational reads are now the preferred source in `supabase` mode for:

- `wards`
- `profiles`
- `goals`
- `goal_checklist_items`
- `goal_checklist_units`
- `goal_templates`
- `template_checklist_items`

Snapshot saving still remains in place as a transition bridge for write operations until the full CRUD migration is complete.

In `supabase` mode, the frontend now starts from an empty production state instead of injecting the demo first-run accounts and goals into local browser storage.

## Auth bridge status

The app now also has an auth client layer:

- demo mode signs in and signs up against the current local app state
- Supabase mode is prepared to call `signInWithPassword`, `signUp`, `signOut`, and `getSession`
- Supabase mode now also looks up real profile rows from `profiles` and `wards`
- the UI no longer needs to know whether auth is local or Supabase-backed

## Privileged admin actions

The frontend now expects a secure Supabase edge function for privileged user-management actions:

- `create_managed_youth_account`
- `approve_youth_leader`

Those actions now go through `supabase.functions.invoke(...)` instead of trying to create or approve accounts only from browser-side table writes.

## Self-signup guardrails

In Supabase mode, self-service signup is now limited to:

- `youth`
- `youth_leader`
- `bishop`

The frontend now allows bishop self-signup in Supabase mode, and `schema.sql` keeps the `profiles` self-insert policy aligned so youth, Youth leader, and bishop profile creation can be created by the authenticated user with the expected organization and approval state.

## Row-level security updates

`schema.sql` now also includes policies for:

- `goal_checklist_items`
- `goal_checklist_units`
- `template_checklist_items`

That matters because relational goal/template reads and writes depend on those child tables once the site is hosted against live Supabase data.
