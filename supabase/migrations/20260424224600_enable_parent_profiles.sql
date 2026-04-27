alter table if exists public.profiles
  drop constraint if exists bishop_org_all;

alter table if exists public.profiles
  add constraint bishop_org_all check (
    (role in ('bishop', 'parent') and organization = 'all')
    or (role not in ('bishop', 'parent') and organization <> 'all')
  );

create or replace function public.is_allowed_self_signup_role(requested_role public.app_role)
returns boolean
language sql
immutable
as $$
  select requested_role in ('youth', 'youth_leader', 'bishop', 'parent');
$$;

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
    or (role = 'parent' and approval_status = 'verified' and organization = 'all')
  )
);
