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
