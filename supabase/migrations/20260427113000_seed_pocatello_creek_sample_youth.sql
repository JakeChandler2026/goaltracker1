do $$
declare
  pocatello_ward_id uuid;
  eli_id uuid;
  sophie_id uuid;
  eli_scripture_goal_id uuid := '11111111-1111-4111-8111-111111111111';
  eli_service_goal_id uuid := '11111111-1111-4111-8111-111111111112';
  sophie_temple_goal_id uuid := '11111111-1111-4111-8111-111111111113';
  sophie_activity_goal_id uuid := '11111111-1111-4111-8111-111111111114';
  item_id uuid;
begin
  select id
    into pocatello_ward_id
  from public.wards
  where trim(regexp_replace(regexp_replace(lower(name), '(^|[[:space:]])ward($|[[:space:]])', ' ', 'g'), '\s+', ' ', 'g')) = 'pocatello creek'
  order by created_at
  limit 1;

  if pocatello_ward_id is null then
    insert into public.wards (name)
    values ('Pocatello Creek Ward')
    returning id into pocatello_ward_id;
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    ward_id,
    organization,
    approval_status
  )
  values (
    '22222222-2222-4222-8222-222222222221',
    'eli.roberts@example.com',
    'Eli Roberts',
    'youth',
    pocatello_ward_id,
    'young_men',
    'verified'
  )
  on conflict (email) do update
  set full_name = excluded.full_name,
      role = excluded.role,
      ward_id = excluded.ward_id,
      organization = excluded.organization,
      approval_status = excluded.approval_status
  returning id into eli_id;

  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    ward_id,
    organization,
    approval_status
  )
  values (
    '22222222-2222-4222-8222-222222222222',
    'sophie.martin@example.com',
    'Sophie Martin',
    'youth',
    pocatello_ward_id,
    'young_women',
    'verified'
  )
  on conflict (email) do update
  set full_name = excluded.full_name,
      role = excluded.role,
      ward_id = excluded.ward_id,
      organization = excluded.organization,
      approval_status = excluded.approval_status
  returning id into sophie_id;

  insert into public.goals (
    id,
    youth_id,
    created_by,
    title,
    summary,
    points,
    priority_order,
    goal_approved,
    goal_approved_at,
    deadline,
    leader_approved
  )
  values
    (
      eli_scripture_goal_id,
      eli_id,
      eli_id,
      'Build a Scripture Study Habit',
      'Create a steady weekly scripture study rhythm and record personal insights.',
      50,
      100,
      true,
      '2026-04-01T00:00:00Z',
      '2026-12-31',
      false
    ),
    (
      eli_service_goal_id,
      eli_id,
      eli_id,
      'Serve a Neighbor',
      'Plan and complete a simple act of service for someone in the ward neighborhood.',
      50,
      200,
      true,
      '2026-04-01T00:00:00Z',
      '2026-12-31',
      false
    ),
    (
      sophie_temple_goal_id,
      sophie_id,
      sophie_id,
      'Prepare a Temple Name',
      'Research a family name and prepare it for temple work.',
      50,
      100,
      true,
      '2026-04-01T00:00:00Z',
      '2026-12-31',
      false
    ),
    (
      sophie_activity_goal_id,
      sophie_id,
      sophie_id,
      'Plan a Class Activity',
      'Help plan a meaningful activity that builds friendship and faith.',
      50,
      200,
      true,
      '2026-04-01T00:00:00Z',
      '2026-12-31',
      false
    )
  on conflict (id) do update
  set youth_id = excluded.youth_id,
      title = excluded.title,
      summary = excluded.summary,
      points = excluded.points,
      priority_order = excluded.priority_order,
      goal_approved = excluded.goal_approved,
      goal_approved_at = excluded.goal_approved_at,
      deadline = excluded.deadline,
      leader_approved = excluded.leader_approved;

  insert into public.goal_checklist_items (id, goal_id, title, repeat_count, sort_order)
  values
    ('33333333-3333-4333-8333-333333333331', eli_scripture_goal_id, 'Complete two weeks of study', 1, 100),
    ('33333333-3333-4333-8333-333333333332', eli_scripture_goal_id, 'Share one insight with a leader', 1, 200),
    ('33333333-3333-4333-8333-333333333333', eli_service_goal_id, 'Choose a person to serve', 1, 100),
    ('33333333-3333-4333-8333-333333333334', eli_service_goal_id, 'Finish the service visit', 1, 200),
    ('33333333-3333-4333-8333-333333333335', sophie_temple_goal_id, 'Find a family record', 1, 100),
    ('33333333-3333-4333-8333-333333333336', sophie_temple_goal_id, 'Verify and prepare the name', 1, 200),
    ('33333333-3333-4333-8333-333333333337', sophie_activity_goal_id, 'Draft the activity idea', 1, 100),
    ('33333333-3333-4333-8333-333333333338', sophie_activity_goal_id, 'Coordinate the final plan', 1, 200)
  on conflict (id) do update
  set goal_id = excluded.goal_id,
      title = excluded.title,
      repeat_count = excluded.repeat_count,
      sort_order = excluded.sort_order;

  for item_id in
    select id from public.goal_checklist_items
    where id in (
      '33333333-3333-4333-8333-333333333331',
      '33333333-3333-4333-8333-333333333333',
      '33333333-3333-4333-8333-333333333335',
      '33333333-3333-4333-8333-333333333337'
    )
  loop
    insert into public.goal_checklist_units (checklist_item_id, unit_index, completed_at, completed_by)
    values (item_id, 0, '2026-04-15T00:00:00Z', null)
    on conflict (checklist_item_id, unit_index) do update
    set completed_at = excluded.completed_at,
        completed_by = excluded.completed_by;
  end loop;

  for item_id in
    select id from public.goal_checklist_items
    where id in (
      '33333333-3333-4333-8333-333333333332',
      '33333333-3333-4333-8333-333333333334',
      '33333333-3333-4333-8333-333333333336',
      '33333333-3333-4333-8333-333333333338'
    )
  loop
    insert into public.goal_checklist_units (checklist_item_id, unit_index, completed_at, completed_by)
    values (item_id, 0, null, null)
    on conflict (checklist_item_id, unit_index) do update
    set completed_at = null,
        completed_by = null;
  end loop;
end $$;
