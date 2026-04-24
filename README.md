# Bishop Goal Tracker

This is a no-build static website for tracking youth goals, checklist sub-goals, Youth leader approval, bishop ward approval, and Young Men/Young Women access rules.

## What it does

- Lets youth create an account with email, ward, and password
- Lets Youth leaders create an account with email, ward, password, and Young Men/Young Women assignment
- Lets bishops sign in for ward administration
- Lets Youth leaders create youth accounts in their ward
- Provides separate youth, Youth leader, and bishop logins
- Lets youth be categorized as Young Men or Young Women
- Lets each goal contain multiple checklist items
- Requires each goal to have a deadline
- Supports repeated checklist counts through separate checklist description and quantity fields
- Calculates the main goal progress bar from all completed checkboxes across the goal
- Allows Youth leaders to approve a goal only when every sub-goal is complete
- Closes overdue goals and lets Youth leaders or bishops approve deadline extensions
- Requires bishop approval before a new Youth leader can sign in
- Limits Youth leader access to youth in the same ward and assigned organization
- Gives bishops access to all youth in the ward across both Young Men and Young Women
- Lets Youth leaders create reusable goal templates and copy them to specific youth
- Lets bishops and Youth leaders create goals directly for youth
- Lets bishops and Youth leaders copy any goal to another youth, save any goal as a template, and edit existing goals and templates
- Stores demo data in the browser with `localStorage`
- Includes a saved first-run baseline in `first-run-state.json`
- Includes a Phase 1 backend foundation in `backend/supabase/`
- Uses `storage-adapter.js` so the frontend can move from demo local storage to a real API
- Includes `app-config.js` and `supabase-browser-adapter.js` for runtime backend selection
- Includes `backend-client.js` so app state can load and save through an async backend contract
- Includes `auth-client.js` so sign-in and account creation can move from demo auth to Supabase auth
- Loads the Supabase browser SDK directly in `index.html` for hosted `supabase` mode
- Supabase mode now prefers relational reads from the real tables while writes still use the transition bridge
- Supabase mode now expects a secure edge function for bishop approval and youth account provisioning
- Supabase mode supports bishop self-signup alongside youth and Youth leader signup

## How to use it

1. Open `index.html` in a browser.
2. Sign in with one of the demo accounts shown on the page, or create a new youth, Youth leader, or bishop account.
3. As a youth, check off checklist items as they are completed.
4. For repeating habits, add a checklist description and set the quantity to create that many checkboxes.
5. Give each goal a deadline. Once the date passes, the goal closes until a Youth leader or bishop approves an extension.
6. As a Youth leader, manage the youth in your ward and assigned organization, and create, copy, template, edit, review, extend, and approve goals for them.
7. As a bishop, manage all youth in the ward across both organizations, create youth accounts in either organization, extend overdue goals, and approve pending Youth leaders in the ward.

## Host it on this machine

1. Open PowerShell in this project folder.
2. Start the local web server:
   `powershell -ExecutionPolicy Bypass -File .\hosting\start-site.ps1`
3. Open:
   `http://localhost:8080/`
4. Stop the server later with:
   `powershell -ExecutionPolicy Bypass -File .\hosting\stop-site.ps1`

More local-hosting notes are in `hosting/README.md`.

## Demo accounts

- Youth: `josh@example.com` / `goal123`
- Youth: `maria@example.com` / `growth456`
- Youth leader: `leader.one@example.com` / `approve789`
- Youth leader: `leader.two@example.com` / `hearts456`
- Bishop: `ward.bishop@example.com` / `steward123`

## Notes

- This version uses front-end demo authentication only.
- A fresh browser load starts from the saved first-run state, and the reset button returns to that same baseline.
- Phase 1 backend scaffolding now lives in `backend/supabase/schema.sql` and `docs/phase-1-architecture.md`.
- Frontend Supabase runtime setup guidance lives in `docs/supabase-frontend-setup.md`.
- The privileged account-management edge function scaffold lives in `backend/supabase/functions/admin-user-management`.
- The official Church website verification for bishop identity is not automated in this browser-only version because Meetinghouse Locator data is not exposed through a stable public API for this use.
- In `supabase` mode the app now boots from an empty production state instead of seeding demo accounts into browser storage.
- Before production launch, you still need to provision a real Supabase project, apply `backend/supabase/schema.sql`, deploy the `admin-user-management` edge function, and fill in `app-config.js`.
