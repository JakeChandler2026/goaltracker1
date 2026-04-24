# Supabase Edge Functions

This folder contains the secure admin layer for privileged actions that should not run directly from a browser session.

## Included function

- `admin-user-management`

## What it handles

- bishop approval of pending Youth leaders
- bishop or approved Youth leader creation of youth accounts in the same ward

## Why this function exists

Creating someone else's auth account or approving another profile should not rely on browser-only table writes with the public anon key.

This function runs with the Supabase service role so it can:

- create real `auth.users` records
- upsert matching `profiles` rows
- enforce ward and organization rules server-side

## Deploy

1. Make sure your Supabase project has:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
2. Deploy the function:
   - `supabase functions deploy admin-user-management`
3. Keep `app-config.js` aligned with the function name:
   - `adminUserManagementFunction: "admin-user-management"`

## Current contract

The frontend calls this function with one of these actions:

- `create_managed_youth_account`
- `approve_youth_leader`
