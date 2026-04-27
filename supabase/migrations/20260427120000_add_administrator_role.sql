do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.app_role'::regtype
      and enumlabel = 'administrator'
  ) then
    alter type public.app_role add value 'administrator';
  end if;
end
$$;
