alter table if exists public.profiles
  drop constraint if exists bishop_org_all;

alter table if exists public.profiles
  add constraint bishop_org_all check (
    (role in ('bishop', 'parent', 'administrator') and organization = 'all')
    or (role not in ('bishop', 'parent', 'administrator') and organization <> 'all')
  );

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
        or public.is_parent_of_youth(youth_id)
        or public.current_user_role() = 'administrator'
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
        or public.current_user_role() = 'administrator'
      )
  );
$$;

drop policy if exists "profiles_self_or_managed_read" on public.profiles;
create policy "profiles_self_or_managed_read"
on public.profiles
for select
using (
  id = public.current_profile_id()
  or public.current_user_role() = 'administrator'
  or public.can_manage_youth(id)
  or public.is_parent_of_youth(id)
  or (
    public.current_user_role() = 'bishop'
    and ward_id = public.current_user_ward_id()
  )
);

drop policy if exists "goals_read_for_owner_or_manager" on public.goals;
create policy "goals_read_for_owner_or_manager"
on public.goals
for select
using (
  youth_id = public.current_profile_id()
  or public.current_user_role() = 'administrator'
  or public.can_manage_youth(youth_id)
  or public.is_parent_of_youth(youth_id)
);

drop policy if exists "templates_read_by_ward" on public.goal_templates;
create policy "templates_read_by_ward"
on public.goal_templates
for select
using (
  ward_id is null
  or public.current_user_role() = 'administrator'
  or ward_id = public.current_user_ward_id()
);

drop policy if exists "parent_links_read_for_managed_youth" on public.parent_youth_links;
create policy "parent_links_read_for_managed_youth"
on public.parent_youth_links
for select
using (
  parent_id = public.current_profile_id()
  or public.current_user_role() = 'administrator'
  or youth_id = public.current_profile_id()
  or public.can_manage_youth(youth_id)
);
