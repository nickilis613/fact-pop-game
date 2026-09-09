-- Fact Pop: one teacher, parent accounts, no student accounts.
-- Run once in a NEW dedicated Supabase project. No existing progress is imported.
begin;

create schema if not exists fact_pop_private;
revoke all on schema fact_pop_private from public, anon, authenticated;

create table fact_pop_private.teacher (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id)
);

create function public.fact_pop_is_teacher() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from fact_pop_private.teacher where user_id = auth.uid());
$$;
revoke all on function public.fact_pop_is_teacher() from public, anon;
grant execute on function public.fact_pop_is_teacher() to authenticated;

create table public.fact_pop_students (
  id uuid primary key default gen_random_uuid(),
  nickname text not null check (length(trim(nickname)) between 1 and 100),
  progress jsonb not null check (
    jsonb_typeof(progress) = 'object' and
    progress @> '{"version":2}'::jsonb and
    octet_length(progress::text) <= 200000
  ),
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

-- Access is attached to an authenticated parent's ID, never a browser-selected role.
create table public.fact_pop_parent_access (
  student_id uuid not null references public.fact_pop_students(id) on delete cascade,
  parent_id uuid not null references auth.users(id) on delete cascade,
  primary key (student_id, parent_id)
);
create index fact_pop_parent_lookup on public.fact_pop_parent_access(parent_id);

alter table public.fact_pop_students enable row level security;
alter table public.fact_pop_parent_access enable row level security;
revoke all on public.fact_pop_students, public.fact_pop_parent_access from public, anon, authenticated;
grant select on public.fact_pop_students, public.fact_pop_parent_access to authenticated;

create policy "teacher or linked parent reads progress" on public.fact_pop_students
for select to authenticated using (
  public.fact_pop_is_teacher() or exists (
    select 1 from public.fact_pop_parent_access a
    where a.student_id = fact_pop_students.id and a.parent_id = auth.uid()
  )
);
create policy "teacher or parent reads own links" on public.fact_pop_parent_access
for select to authenticated using (public.fact_pop_is_teacher() or parent_id = auth.uid());

-- All writes go through narrowly scoped functions; direct table mutations are denied.
create function public.fact_pop_create_student(p_nickname text, p_progress jsonb, p_id uuid)
returns public.fact_pop_students
language plpgsql security definer set search_path = '' as $$
declare result public.fact_pop_students;
begin
  if not public.fact_pop_is_teacher() then raise exception 'Teacher access required' using errcode = '42501'; end if;
  insert into public.fact_pop_students(id, nickname, progress)
    values (p_id, trim(p_nickname), p_progress) returning * into result;
  return result;
end;
$$;

create function public.fact_pop_save_progress(p_student_id uuid, p_revision bigint, p_progress jsonb)
returns public.fact_pop_students
language plpgsql security definer set search_path = '' as $$
declare result public.fact_pop_students;
begin
  if auth.uid() is null or not (public.fact_pop_is_teacher() or exists (
    select 1 from public.fact_pop_parent_access where student_id = p_student_id and parent_id = auth.uid()
  )) then raise exception 'Student access required' using errcode = '42501'; end if;
  -- Compare-and-swap prevents a home session silently replacing newer school progress.
  update public.fact_pop_students set progress = p_progress, revision = revision + 1, updated_at = now()
    where id = p_student_id and revision = p_revision returning * into result;
  if not found then raise exception 'Progress changed on another device. Reload before saving.' using errcode = '40001'; end if;
  return result;
end;
$$;

create function public.fact_pop_link_parent(p_student_id uuid, p_email text)
returns void
language plpgsql security definer set search_path = '' as $$
declare parent uuid;
begin
  if not public.fact_pop_is_teacher() then raise exception 'Teacher access required' using errcode = '42501'; end if;
  select id into parent from auth.users
    where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null;
  if parent is null then raise exception 'Parent needs a confirmed account first.'; end if;
  insert into public.fact_pop_parent_access(student_id, parent_id) values(p_student_id, parent)
    on conflict do nothing;
end;
$$;

create function public.fact_pop_unlink_parent(p_student_id uuid, p_parent_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.fact_pop_is_teacher() then raise exception 'Teacher access required' using errcode = '42501'; end if;
  delete from public.fact_pop_parent_access where student_id = p_student_id and parent_id = p_parent_id;
end;
$$;

revoke all on function public.fact_pop_create_student(text,jsonb,uuid) from public, anon;
revoke all on function public.fact_pop_save_progress(uuid,bigint,jsonb) from public, anon;
revoke all on function public.fact_pop_link_parent(uuid,text) from public, anon;
revoke all on function public.fact_pop_unlink_parent(uuid,uuid) from public, anon;
grant execute on function public.fact_pop_create_student(text,jsonb,uuid) to authenticated;
grant execute on function public.fact_pop_save_progress(uuid,bigint,jsonb) to authenticated;
grant execute on function public.fact_pop_link_parent(uuid,text) to authenticated;
grant execute on function public.fact_pop_unlink_parent(uuid,uuid) to authenticated;
commit;
