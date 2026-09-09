-- Teacher-only revocation by email for the classroom UI.
begin;
create function public.fact_pop_unlink_parent_email(p_student_id uuid,p_email text) returns void
language plpgsql security definer set search_path='' as $$
begin
  if not public.fact_pop_is_teacher() then raise exception 'Teacher access required' using errcode='42501'; end if;
  delete from public.fact_pop_parent_access where student_id=p_student_id and parent_id in (select id from auth.users where lower(email)=lower(trim(p_email)));
end $$;
revoke all on function public.fact_pop_unlink_parent_email(uuid,text) from public,anon;
grant execute on function public.fact_pop_unlink_parent_email(uuid,text) to authenticated;
commit;
