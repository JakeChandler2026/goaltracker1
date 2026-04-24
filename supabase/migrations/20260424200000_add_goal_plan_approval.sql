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
