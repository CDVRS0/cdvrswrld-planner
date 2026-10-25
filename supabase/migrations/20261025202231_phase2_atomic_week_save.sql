-- Additive: existing Planner clients/tables/RLS remain compatible.
create or replace function public.save_planner_week_v2(
  p_week_start date,
  p_expected_version timestamptz,
  p_week jsonb,
  p_tasks jsonb,
  p_nature jsonb,
  p_previous_ids uuid[] default '{}'::uuid[]
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  previous public.planner_reflections%rowtype;
  new_notes text;
  saved_version timestamptz;
  task_ids uuid[];
begin
  if owner_id is null then raise insufficient_privilege using message='Sign in to save your Planner'; end if;
  if p_week_start is null or extract(isodow from p_week_start) <> 1 then raise exception 'Invalid week start'; end if;
  if jsonb_typeof(p_week->'days') is distinct from 'object' or jsonb_typeof(p_week->'weeklySections') is distinct from 'array'
     or jsonb_typeof(p_tasks) is distinct from 'array' or jsonb_typeof(p_nature) is distinct from 'array'
     or octet_length(p_week::text) > 2000000 or jsonb_array_length(p_tasks) > 2000 or jsonb_array_length(p_nature) > 7 then
    raise exception 'Invalid Planner week';
  end if;
  if exists (select 1 from jsonb_object_keys(p_week->'days') d where d::date < p_week_start or d::date > p_week_start+6) then
    raise exception 'A day belongs to a different week';
  end if;
  if exists (select 1 from jsonb_array_elements(p_tasks) t where (t->>'user_id')::uuid is distinct from owner_id
    or (t->>'scheduled_date')::date not between p_week_start and p_week_start+6
    or t->>'scheduled_date' is null or t->>'source' is distinct from 'migration'
    or t->>'status' not in ('todo','done') or nullif(btrim(t->>'title'),'') is null) then
    raise insufficient_privilege using message='Invalid task owner or week';
  end if;
  if exists (select 1 from jsonb_array_elements(p_nature) n where (n->>'user_id')::uuid is distinct from owner_id
    or (n->>'entry_date')::date not between p_week_start and p_week_start+6 or n->>'entry_date' is null) then
    raise insufficient_privilege using message='Invalid Nature owner or week';
  end if;
  new_notes := jsonb_build_object('format','cdvrs-planner-v5','week',p_week)::text;
  select * into previous from public.planner_reflections
    where user_id=owner_id and period='weekly' and period_start=p_week_start for update;
  if found then
    -- An identical retry is safe after a response was lost: all indexes committed together.
    if previous.notes::jsonb = new_notes::jsonb then return jsonb_build_object('version',previous.updated_at); end if;
    if p_expected_version is null or previous.updated_at is distinct from p_expected_version then
      raise exception 'Planner changed on another device' using errcode='P0001';
    end if;
    update public.planner_reflections set notes=new_notes,updated_at=clock_timestamp()
      where id=previous.id and user_id=owner_id returning updated_at into saved_version;
  else
    if p_expected_version is not null then raise exception 'Planner changed on another device' using errcode='P0001'; end if;
    insert into public.planner_reflections(user_id,period,period_start,notes)
      values(owner_id,'weekly',p_week_start,new_notes) returning updated_at into saved_version;
  end if;
  select coalesce(array_agg((t->>'id')::uuid),'{}'::uuid[]) into task_ids from jsonb_array_elements(p_tasks) t;
  -- UUID conflicts belonging to another user remain blocked by existing RLS.
  insert into public.planner_tasks as saved(id,user_id,title,description,category,status,scheduled_date,source)
    select t.id,owner_id,t.title,t.description,t.category,t.status,t.scheduled_date,'migration'
      from jsonb_to_recordset(p_tasks) t(id uuid,title text,description text,category text,status text,scheduled_date date)
    on conflict(id) do update set title=excluded.title,description=excluded.description,category=excluded.category,
      status=excluded.status,scheduled_date=excluded.scheduled_date,updated_at=clock_timestamp()
      where saved.user_id=owner_id and saved.source='migration' and
        (saved.title,saved.description,saved.category,saved.status,saved.scheduled_date) is distinct from
        (excluded.title,excluded.description,excluded.category,excluded.status,excluded.scheduled_date);
  if (select count(*) from public.planner_tasks where user_id=owner_id and source='migration' and id=any(task_ids)
      and scheduled_date between p_week_start and p_week_start+6) <> jsonb_array_length(p_tasks) then
    raise insufficient_privilege using message='A task identifier belongs to a different record';
  end if;
  update public.planner_tasks set status='cancelled',updated_at=clock_timestamp()
    where user_id=owner_id and source='migration' and scheduled_date between p_week_start and p_week_start+6
      and id=any(p_previous_ids) and not (id=any(task_ids)) and status<>'cancelled';
  insert into public.planner_nature_entries as saved(user_id,entry_date,feeling,energy,mind,physical,intention,notes)
    select owner_id,n.entry_date,n.feeling,n.energy,n.mind,n.physical,n.intention,n.notes
      from jsonb_to_recordset(p_nature) n(entry_date date,feeling text,energy text,mind text,physical text,intention text,notes text)
    on conflict(user_id,entry_date) do update set feeling=excluded.feeling,energy=excluded.energy,mind=excluded.mind,
      physical=excluded.physical,intention=excluded.intention,notes=excluded.notes,updated_at=clock_timestamp()
      where (saved.feeling,saved.energy,saved.mind,saved.physical,saved.intention,saved.notes) is distinct from
        (excluded.feeling,excluded.energy,excluded.mind,excluded.physical,excluded.intention,excluded.notes);
  return jsonb_build_object('version',saved_version);
end;
$$;
revoke all on function public.save_planner_week_v2(date,timestamptz,jsonb,jsonb,jsonb,uuid[]) from public,anon;
grant execute on function public.save_planner_week_v2(date,timestamptz,jsonb,jsonb,jsonb,uuid[]) to authenticated;

-- Existing owner-only RLS also filters these change notifications.
do $$
declare table_name text;
begin
  foreach table_name in array array['planner_reflections','planner_tasks','planner_projects'] loop
    if not exists(select 1 from pg_publication_tables p where p.pubname='supabase_realtime' and p.schemaname='public' and p.tablename=table_name) then
      execute format('alter publication supabase_realtime add table public.%I',table_name);
    end if;
  end loop;
end $$;
