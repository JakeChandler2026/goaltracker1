alter table if exists public.goals
  add column if not exists priority_order integer not null default 0;
