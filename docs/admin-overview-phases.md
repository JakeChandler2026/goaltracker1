# Administrator Overview Phases

This checklist tracks the administrator role work. Check items off as each phase lands and passes the browser harness.

## Phase 1 - Administrator Foundation

- [x] Add an administrator role/profile type.
- [x] Add administrator sign-in access.
- [x] Add a read-only administrator overview grouped by ward.
- [x] Show each ward's bishops, youth leaders, parent count, youth count, and goal count.
- [x] Add demo coverage for administrator login and overview visibility.

## Phase 2 - Leader Access Controls

- [x] Phase 2A: Let bishops review Youth leader and parent access in their own ward.
- [x] Phase 2A: Let bishops approve/re-enable or disable Youth leader and parent access.
- [x] Phase 2A: Block disabled Youth leader and parent accounts at sign-in.
- [ ] Add administrator actions to enable or disable Youth leader access.
- [ ] Track disabled leader status separately from pending bishop approval.
- [ ] Add audit-friendly status text for who changed access and when.
- [ ] Add tests for disabling and re-enabling leader access.

## Phase 3 - Ward And Bishop Management

- [x] Let administrators create and view ward records.
- [x] Let administrators create bishop profiles.
- [x] Let administrators assign bishops to wards.
- [x] Prevent duplicate wards caused by naming differences like "Pocatello Creek" versus "Pocatello Creek Ward".
- [x] Add tests for bishop reassignment and ward normalization.

## Phase 4 - Parent And Youth Assignment

- [ ] Let administrators view parent profiles across wards.
- [ ] Let administrators link or unlink parents and youth.
- [ ] Let administrators move youth between wards.
- [ ] Add tests for parent linking and youth ward reassignment.

## Phase 5 - Production Hardening

- [ ] Add Supabase policies/functions for administrator read and write permissions.
- [ ] Restrict administrator creation to controlled provisioning.
- [ ] Add deployment notes for creating the first administrator profile.
- [ ] Add regression tests for administrator access boundaries.
