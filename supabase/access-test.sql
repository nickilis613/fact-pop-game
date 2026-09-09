-- Run in the SQL Editor. All fixtures are rolled back, including Auth users.
begin;
insert into auth.users(id,email) values ('11111111-1111-4111-8111-111111111111','fact-pop-test-a@example.invalid'),('22222222-2222-4222-8222-222222222222','fact-pop-test-b@example.invalid');
insert into public.fact_pop_students(id,nickname,progress) values ('33333333-3333-4333-8333-333333333333','TEST ONLY','{"version":2}');
insert into public.fact_pop_parent_access values ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111');
do $$
declare n integer;
begin
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
  execute 'set local role authenticated';
  select count(*) into n from public.fact_pop_students where id='33333333-3333-4333-8333-333333333333';
  if n<>1 then raise exception 'Linked parent cannot read'; end if;
  perform public.fact_pop_save_progress('33333333-3333-4333-8333-333333333333',0,'{"version":2}');
  begin
    perform public.fact_pop_save_progress('33333333-3333-4333-8333-333333333333',0,'{"version":2}');
    raise exception 'Stale save accepted';
  exception when serialization_failure then null; end;
  begin
    perform public.fact_pop_create_student('Forbidden','{"version":2}','44444444-4444-4444-8444-444444444444');
    raise exception 'Parent created student';
  exception when insufficient_privilege then null; end;
  begin
    update public.fact_pop_students set revision=100;
    raise exception 'Direct write allowed';
  exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
  select count(*) into n from public.fact_pop_students;
  if n<>0 then raise exception 'Unrelated parent read records'; end if;
  begin
    perform public.fact_pop_save_progress('33333333-3333-4333-8333-333333333333',1,'{"version":2}');
    raise exception 'Unrelated parent saved';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  delete from public.fact_pop_parent_access where parent_id='11111111-1111-4111-8111-111111111111';
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
  execute 'set local role authenticated';
  select count(*) into n from public.fact_pop_students;
  if n<>0 then raise exception 'Revoked parent read records'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.sub',(select user_id::text from fact_pop_private.teacher),true);
  execute 'set local role authenticated';
  if not public.fact_pop_is_teacher() then raise exception 'Teacher role missing'; end if;
  perform public.fact_pop_create_student('Teacher test','{"version":2}','44444444-4444-4444-8444-444444444444');
  execute 'reset role';
  perform set_config('request.jwt.claim.sub','',true);
  execute 'set local role anon';
  begin
    perform 1 from public.fact_pop_students;
    raise exception 'Anonymous read allowed';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
end $$;
select 'PASS: teacher, parent isolation, revocation, anonymous denial, direct-write denial, stale-write protection' as result;
rollback;
