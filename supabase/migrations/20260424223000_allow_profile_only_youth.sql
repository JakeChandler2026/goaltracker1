alter table if exists public.profiles
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'profiles_id_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles drop constraint profiles_id_fkey;
  end if;
end
$$;

alter table if exists public.profiles
  alter column id set default gen_random_uuid();

alter table if exists public.profiles
  alter column email drop not null;

create unique index if not exists profiles_auth_user_id_key
on public.profiles(auth_user_id);

create index if not exists idx_profiles_auth_user_id
on public.profiles(auth_user_id);

update public.profiles
set auth_user_id = id
where auth_user_id is null
  and exists (select 1 from auth.users where auth.users.id = profiles.id);

create or replace function public.current_profile()
returns public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.profiles
  where id = auth.uid()
     or auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.profiles
  where id = auth.uid()
     or auth_user_id = auth.uid()
  limit 1
$$;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = public.current_profile_id()
$$;

create or replace function public.current_user_ward_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ward_id
  from public.profiles
  where id = public.current_profile_id()
$$;

create or replace function public.current_user_organization()
returns public.organization_type
language sql
stable
security definer
set search_path = public
as $$
  select organization
  from public.profiles
  where id = public.current_profile_id()
$$;

create or replace function public.current_user_approval_status()
returns public.approval_state
language sql
stable
security definer
set search_path = public
as $$
  select approval_status
  from public.profiles
  where id = public.current_profile_id()
$$;

create or replace function public.current_user_approved_by()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select approved_by
  from public.profiles
  where id = public.current_profile_id()
$$;

create or replace function public.current_user_approved_at()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select approved_at
  from public.profiles
  where id = public.current_profile_id()
$$;

create or replace function public.can_manage_youth(target_youth_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with actor as (
    select * from public.profiles where id = public.current_profile_id()
  ),
  target as (
    select * from public.profiles where id = target_youth_id
  )
  select exists (
    select 1
    from actor, target
    where target.role = 'youth'
      and actor.ward_id = target.ward_id
      and (
        actor.role = 'bishop'
        or (actor.role = 'youth_leader' and actor.organization = target.organization and actor.approval_status = 'approved')
      )
  );
$$;

create or replace function public.can_access_goal(goal_uuid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.goals
    where id = goal_uuid
      and (
        youth_id = public.current_profile_id()
        or public.can_manage_youth(youth_id)
      )
  );
$$;

drop policy if exists "profiles_self_or_managed_read" on public.profiles;
create policy "profiles_self_or_managed_read"
on public.profiles
for select
using (
  id = public.current_profile_id()
  or public.can_manage_youth(id)
  or (
    public.current_user_role() = 'bishop'
    and ward_id = public.current_user_ward_id()
  )
);

drop policy if exists "profiles_self_insert" on public.profiles;
create policy "profiles_self_insert"
on public.profiles
for insert
with check (
  id = auth.uid()
  and auth_user_id = auth.uid()
  and public.is_allowed_self_signup_role(role)
  and (
    (role = 'youth' and approval_status = 'verified' and organization in ('young_men', 'young_women'))
    or (role = 'youth_leader' and approval_status = 'pending' and organization in ('young_men', 'young_women'))
    or (role = 'bishop' and approval_status = 'verified' and organization = 'all')
  )
);

drop policy if exists "profiles_self_update" on public.profiles;
create policy "profiles_self_update"
on public.profiles
for update
using (id = public.current_profile_id())
with check (
  id = public.current_profile_id()
  and role = public.current_user_role()
  and ward_id = public.current_user_ward_id()
  and organization = public.current_user_organization()
  and approval_status = public.current_user_approval_status()
);

drop policy if exists "goals_read_for_owner_or_manager" on public.goals;
create policy "goals_read_for_owner_or_manager"
on public.goals
for select
using (
  youth_id = public.current_profile_id()
  or public.can_manage_youth(youth_id)
);

drop policy if exists "goals_insert_for_manager" on public.goals;
create policy "goals_insert_for_manager"
on public.goals
for insert
with check (
  youth_id = public.current_profile_id()
  or public.can_manage_youth(youth_id)
);

drop policy if exists "goals_update_for_owner_or_manager" on public.goals;
create policy "goals_update_for_owner_or_manager"
on public.goals
for update
using (
  youth_id = public.current_profile_id()
  or public.can_manage_youth(youth_id)
)
with check (
  youth_id = public.current_profile_id()
  or public.can_manage_youth(youth_id)
);

drop policy if exists "templates_read_by_ward" on public.goal_templates;
create policy "templates_read_by_ward"
on public.goal_templates
for select
using (
  ward_id is null
  or ward_id = public.current_user_ward_id()
);
