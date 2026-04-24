# Phase 1 Backend Foundation

This folder starts Phase 1 of the production migration.

## Chosen direction

- Backend: `Supabase`
- Database: `PostgreSQL`
- Auth: `Supabase Auth`
- Frontend next step: replace browser demo auth/state with API-backed auth and row-level security

## Why this stack

- It fits the current role model well: youth, Youth leader, bishop
- It gives us hosted auth and a relational database quickly
- It supports row-level security so ward and organization access rules can be enforced on the server
- It works well later with web, Android, and iOS clients

## Included in this folder

- `schema.sql`: database tables, enums, indexes, helper functions, and starter row-level security policies
- `functions/admin-user-management`: secure edge function scaffold for privileged user-management actions

The schema now includes child-table RLS policies for goal checklist items, checklist units, and template checklist items, plus stricter self-profile update rules so users cannot promote or approve themselves through direct table updates.

## Phase 1 goal

Move the app from browser-only state into a secure backend with:

- real user accounts
- ward-based authorization
- organization scoping for Youth leaders
- bishop approval workflow for Youth leaders
- persistent goals, templates, deadlines, extensions, and checklist history

## Not finished yet

- Supabase project provisioning
- environment variables
- deployment of the `admin-user-management` edge function
- deployed hosting
