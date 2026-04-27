create or replace function public.is_parent_of_youth(target_youth_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.parent_youth_links
    where parent_id = public.current_profile_id()
      and youth_id = target_youth_id
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
        or public.is_parent_of_youth(youth_id)
      )
  );
$$;

create or replace function public.can_edit_goal(goal_uuid uuid)
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
  or public.can_manage_youth(youth_id)
  or public.is_parent_of_youth(youth_id)
);
