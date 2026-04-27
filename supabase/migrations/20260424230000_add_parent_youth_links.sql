create table if not exists public.parent_youth_links (
  parent_id uuid not null references public.profiles(id) on delete cascade,
  youth_id uuid not null references public.profiles(id) on delete cascade,
  relationship text not null default 'Parent',
  created_at timestamptz not null default now(),
  primary key (parent_id, youth_id)
);

create index if not exists idx_parent_youth_links_youth_id
on public.parent_youth_links(youth_id);

alter table public.parent_youth_links enable row level security;

drop policy if exists "parent_links_read_for_managed_youth" on public.parent_youth_links;
create policy "parent_links_read_for_managed_youth"
on public.parent_youth_links
for select
using (
  parent_id = public.current_profile_id()
  or youth_id = public.current_profile_id()
  or public.can_manage_youth(youth_id)
);

drop policy if exists "parent_links_write_by_admin" on public.parent_youth_links;
create policy "parent_links_write_by_admin"
on public.parent_youth_links
for all
using (public.can_manage_youth(youth_id))
with check (public.can_manage_youth(youth_id));
