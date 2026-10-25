begin;
insert into auth.users(id,email,aud,role) values
('9caf0010-1671-4091-b478-618001cd0002','planner-phase2-rollback@cdvrs.invalid','authenticated','authenticated'),
('9caf0010-1671-4091-b478-618001cd0003','planner-phase2-other@cdvrs.invalid','authenticated','authenticated');
insert into public.planner_tasks(id,user_id,title,scheduled_date,source) values
('9caf0010-1671-4091-b478-618001cd0209','9caf0010-1671-4091-b478-618001cd0003','Other owner','2030-01-07','migration');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"9caf0010-1671-4091-b478-618001cd0002","role":"authenticated"}',true);
do $test$
declare w jsonb := '{"days":{"2030-01-07":{"blocks":[],"record":{}}},"weeklySections":[],"notes":"original"}';
 t jsonb := '[{"id":"9caf0010-1671-4091-b478-618001cd0201","user_id":"9caf0010-1671-4091-b478-618001cd0002","title":"Atomic test","description":"","category":"work","status":"todo","scheduled_date":"2030-01-07","source":"migration"}]';
 v timestamptz;
begin
 v := (public.save_planner_week_v2('2030-01-07',null,w,t,'[]')->>'version')::timestamptz;
 if (public.save_planner_week_v2('2030-01-07',null,w,t,'[]')->>'version')::timestamptz <> v then raise exception 'Idempotency failed'; end if;
 begin
  perform public.save_planner_week_v2('2030-01-07',v,jsonb_set(w,'{notes}','"should roll back"'),jsonb_set(t,'{0,id}','"invalid-uuid"'),'[]');
  raise exception 'Expected invalid task to fail';
 exception when invalid_text_representation then null; end;
 if (select notes::jsonb->'week'->>'notes' from public.planner_reflections where user_id=auth.uid() and period_start='2030-01-07') <> 'original' then raise exception 'Atomic rollback failed'; end if;
 begin
  perform public.save_planner_week_v2('2030-01-07','2000-01-01',jsonb_set(w,'{notes}','"stale"'),t,'[]');
  raise exception 'Expected stale version to fail';
 exception when sqlstate 'P0001' then if sqlerrm <> 'Planner changed on another device' then raise; end if; end;
 begin
  perform public.save_planner_week_v2('2030-01-07',v,w,jsonb_set(t,'{0,user_id}','"9caf0010-1671-4091-b478-618001cd0003"'),'[]');
  raise exception 'Expected foreign owner to fail';
 exception when insufficient_privilege then null; end;
 begin
  perform public.save_planner_week_v2('2030-01-07',v,jsonb_set(w,'{notes}','"invalid foreign id"'),jsonb_set(t,'{0,id}','"9caf0010-1671-4091-b478-618001cd0209"'),'[]');
  raise exception 'Expected foreign identifier to fail';
 exception when insufficient_privilege then null; end;
 if (select notes::jsonb->'week'->>'notes' from public.planner_reflections where user_id=auth.uid() and period_start='2030-01-07') <> 'original' then raise exception 'Foreign ID rollback failed'; end if;
end $test$;
select count(*) as atomic_fixture_tasks from public.planner_tasks where user_id=auth.uid();
rollback;
