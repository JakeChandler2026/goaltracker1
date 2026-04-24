create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'app_role') then
    create type public.app_role as enum ('youth', 'youth_leader', 'bishop');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'organization_type') then
    create type public.organization_type as enum ('young_men', 'young_women', 'all');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'approval_state') then
    create type public.approval_state as enum ('pending', 'approved', 'verified', 'rejected');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'goal_state') then
    create type public.goal_state as enum ('active', 'approved', 'overdue');
  end if;
end
$$;

create table if not exists public.wards (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  bishop_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role public.app_role not null,
  ward_id uuid not null references public.wards(id) on delete restrict,
  organization public.organization_type not null default 'young_men',
  approval_status public.approval_state not null default 'verified',
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bishop_org_all check (
    (role = 'bishop' and organization = 'all')
    or (role <> 'bishop' and organization <> 'all')
  )
);

create table if not exists public.goal_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  points integer not null default 0 check (points >= 0),
  created_by uuid not null references public.profiles(id) on delete restrict,
  ward_id uuid references public.wards(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.template_checklist_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.goal_templates(id) on delete cascade,
  title text not null,
  repeat_count integer not null check (repeat_count > 0),
  sort_order integer not null default 0
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  youth_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  source_template_id uuid references public.goal_templates(id) on delete set null,
  source_goal_id uuid references public.goals(id) on delete set null,
  title text not null,
  summary text not null,
  points integer not null default 0 check (points >= 0),
  goal_approved boolean not null default false,
  goal_approved_by uuid references public.profiles(id) on delete set null,
  goal_approved_at timestamptz,
  deadline date not null,
  state public.goal_state not null default 'active',
  leader_approved boolean not null default false,
  leader_approved_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  extension_approved_by uuid references public.profiles(id) on delete set null,
  extension_approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goal_checklist_items (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  title text not null,
  repeat_count integer not null check (repeat_count > 0),
  sort_order integer not null default 0
);

create table if not exists public.goal_checklist_units (
  id uuid primary key default gen_random_uuid(),
  checklist_item_id uuid not null references public.goal_checklist_items(id) on delete cascade,
  unit_index integer not null check (unit_index >= 0),
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  unique (checklist_item_id, unit_index)
);

create table if not exists public.app_runtime_snapshots (
  scope text primary key,
  state_json jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_ward_role on public.profiles(ward_id, role, organization);
create index if not exists idx_goals_youth_id on public.goals(youth_id);
create index if not exists idx_goals_deadline on public.goals(deadline, state);
create index if not exists idx_templates_ward on public.goal_templates(ward_id);

alter table if exists public.goal_templates
  add column if not exists points integer not null default 0;

alter table if exists public.goals
  add column if not exists points integer not null default 0;

alter table if exists public.goals
  add column if not exists goal_approved boolean not null default false;

alter table if exists public.goals
  add column if not exists goal_approved_by uuid references public.profiles(id) on delete set null;

alter table if exists public.goals
  add column if not exists goal_approved_at timestamptz;

update public.goals
set goal_approved = true
where goal_approved = false
  and (points > 0 or leader_approved = true);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
  where id = auth.uid()
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
  where id = auth.uid()
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
  where id = auth.uid()
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
  where id = auth.uid()
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
  where id = auth.uid()
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
  where id = auth.uid()
$$;

create or replace function public.can_manage_youth(target_youth_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with actor as (
    select * from public.profiles where id = auth.uid()
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

create or replace function public.is_allowed_self_signup_role(requested_role public.app_role)
returns boolean
language sql
immutable
as $$
  select requested_role in ('youth', 'youth_leader', 'bishop');
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
        youth_id = auth.uid()
        or public.can_manage_youth(youth_id)
      )
  );
$$;

create or replace function public.can_edit_goal(goal_uuid uuid)
returns boolean
language sql
stable
as $$
  select public.can_access_goal(goal_uuid);
$$;

create or replace function public.can_access_template(template_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.goal_templates
    where id = template_uuid
      and (
        ward_id is null
        or ward_id = public.current_user_ward_id()
      )
  );
$$;

create or replace function public.can_edit_template(template_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.goal_templates
    where id = template_uuid
      and public.current_user_role() in ('youth_leader', 'bishop')
  );
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists set_goal_templates_updated_at on public.goal_templates;
create trigger set_goal_templates_updated_at
before update on public.goal_templates
for each row
execute function public.set_updated_at();

drop trigger if exists set_goals_updated_at on public.goals;
create trigger set_goals_updated_at
before update on public.goals
for each row
execute function public.set_updated_at();

alter table public.wards enable row level security;
alter table public.profiles enable row level security;
alter table public.goal_templates enable row level security;
alter table public.template_checklist_items enable row level security;
alter table public.goals enable row level security;
alter table public.goal_checklist_items enable row level security;
alter table public.goal_checklist_units enable row level security;
alter table public.app_runtime_snapshots enable row level security;

drop policy if exists "wards_authenticated_read" on public.wards;
create policy "wards_authenticated_read"
on public.wards
for select
using (auth.uid() is not null);

drop policy if exists "wards_authenticated_insert" on public.wards;
create policy "wards_authenticated_insert"
on public.wards
for insert
with check (auth.uid() is not null);

drop policy if exists "profiles_self_or_managed_read" on public.profiles;
create policy "profiles_self_or_managed_read"
on public.profiles
for select
using (
  id = auth.uid()
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
using (id = auth.uid())
with check (
  id = auth.uid()
  and role = public.current_user_role()
  and ward_id = public.current_user_ward_id()
  and organization = public.current_user_organization()
  and approval_status = public.current_user_approval_status()
  and approved_by is not distinct from public.current_user_approved_by()
  and approved_at is not distinct from public.current_user_approved_at()
);

drop policy if exists "goals_read_for_owner_or_manager" on public.goals;
create policy "goals_read_for_owner_or_manager"
on public.goals
for select
using (
  youth_id = auth.uid()
  or public.can_manage_youth(youth_id)
);

drop policy if exists "goals_insert_for_manager" on public.goals;
create policy "goals_insert_for_manager"
on public.goals
for insert
with check (
  youth_id = auth.uid()
  or public.can_manage_youth(youth_id)
);

drop policy if exists "goals_update_for_owner_or_manager" on public.goals;
create policy "goals_update_for_owner_or_manager"
on public.goals
for update
using (
  youth_id = auth.uid()
  or public.can_manage_youth(youth_id)
)
with check (
  youth_id = auth.uid()
  or public.can_manage_youth(youth_id)
);

drop policy if exists "goal_checklist_items_read_for_goal_access" on public.goal_checklist_items;
create policy "goal_checklist_items_read_for_goal_access"
on public.goal_checklist_items
for select
using (public.can_access_goal(goal_id));

drop policy if exists "goal_checklist_items_write_for_goal_access" on public.goal_checklist_items;
create policy "goal_checklist_items_write_for_goal_access"
on public.goal_checklist_items
for all
using (public.can_edit_goal(goal_id))
with check (public.can_edit_goal(goal_id));

drop policy if exists "goal_checklist_units_read_for_goal_access" on public.goal_checklist_units;
create policy "goal_checklist_units_read_for_goal_access"
on public.goal_checklist_units
for select
using (
  exists (
    select 1
    from public.goal_checklist_items
    where id = checklist_item_id
      and public.can_access_goal(goal_id)
  )
);

drop policy if exists "goal_checklist_units_write_for_goal_access" on public.goal_checklist_units;
create policy "goal_checklist_units_write_for_goal_access"
on public.goal_checklist_units
for all
using (
  exists (
    select 1
    from public.goal_checklist_items
    where id = checklist_item_id
      and public.can_edit_goal(goal_id)
  )
)
with check (
  exists (
    select 1
    from public.goal_checklist_items
    where id = checklist_item_id
      and public.can_edit_goal(goal_id)
  )
);

drop policy if exists "templates_read_by_ward" on public.goal_templates;
create policy "templates_read_by_ward"
on public.goal_templates
for select
using (
  ward_id is null
  or ward_id = (select ward_id from public.profiles where id = auth.uid())
);

drop policy if exists "templates_write_by_admin" on public.goal_templates;
create policy "templates_write_by_admin"
on public.goal_templates
for all
using (
  public.current_user_role() in ('youth_leader', 'bishop')
)
with check (
  public.current_user_role() in ('youth_leader', 'bishop')
);

drop policy if exists "template_checklist_items_read_by_template_access" on public.template_checklist_items;
create policy "template_checklist_items_read_by_template_access"
on public.template_checklist_items
for select
using (public.can_access_template(template_id));

drop policy if exists "template_checklist_items_write_by_template_access" on public.template_checklist_items;
create policy "template_checklist_items_write_by_template_access"
on public.template_checklist_items
for all
using (public.can_edit_template(template_id))
with check (public.can_edit_template(template_id));

comment on table public.profiles is 'App profile rows linked to Supabase auth.users.';
comment on table public.goals is 'Youth goals with deadline, approval, and extension state.';
comment on table public.goal_checklist_units is 'Each checkbox unit stores its own completion timestamp.';
comment on table public.app_runtime_snapshots is 'Transition table for the browser app while it moves from local state to fully relational API calls.';

drop policy if exists "runtime_snapshots_authenticated_read" on public.app_runtime_snapshots;
create policy "runtime_snapshots_authenticated_read"
on public.app_runtime_snapshots
for select
using (auth.uid() is not null);

drop policy if exists "runtime_snapshots_authenticated_write" on public.app_runtime_snapshots;
create policy "runtime_snapshots_authenticated_write"
on public.app_runtime_snapshots
for all
using (auth.uid() is not null)
with check (auth.uid() is not null);
