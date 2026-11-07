-- Structured, owner-scoped profile projection for first-run onboarding.
-- Do not apply to a live database until reviewed and explicitly approved.

create table if not exists public.cgpa_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  university text,
  programme text,
  year_of_study smallint,
  current_semester smallint,
  academic_year text,
  setup_completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.cgpa_profiles
  add column if not exists university text,
  add column if not exists programme text,
  add column if not exists year_of_study smallint,
  add column if not exists current_semester smallint,
  add column if not exists academic_year text,
  add column if not exists setup_completed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.cgpa_profiles'::regclass
      and conname = 'cgpa_profiles_year_of_study_check'
  ) then
    alter table public.cgpa_profiles
      add constraint cgpa_profiles_year_of_study_check
      check (year_of_study is null or year_of_study between 1 and 6) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.cgpa_profiles'::regclass
      and conname = 'cgpa_profiles_current_semester_check'
  ) then
    alter table public.cgpa_profiles
      add constraint cgpa_profiles_current_semester_check
      check (current_semester is null or current_semester between 1 and 2) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.cgpa_profiles'::regclass
      and conname = 'cgpa_profiles_university_length_check'
  ) then
    alter table public.cgpa_profiles
      add constraint cgpa_profiles_university_length_check
      check (university is null or pg_catalog.length(university) <= 120) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.cgpa_profiles'::regclass
      and conname = 'cgpa_profiles_programme_length_check'
  ) then
    alter table public.cgpa_profiles
      add constraint cgpa_profiles_programme_length_check
      check (programme is null or pg_catalog.length(programme) <= 120) not valid;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.cgpa_profiles'::regclass
      and conname = 'cgpa_profiles_academic_year_length_check'
  ) then
    alter table public.cgpa_profiles
      add constraint cgpa_profiles_academic_year_length_check
      check (academic_year is null or pg_catalog.length(academic_year) <= 20) not valid;
  end if;
end
$$;

alter table public.cgpa_profiles
  validate constraint cgpa_profiles_year_of_study_check;
alter table public.cgpa_profiles
  validate constraint cgpa_profiles_current_semester_check;
alter table public.cgpa_profiles
  validate constraint cgpa_profiles_university_length_check;
alter table public.cgpa_profiles
  validate constraint cgpa_profiles_programme_length_check;
alter table public.cgpa_profiles
  validate constraint cgpa_profiles_academic_year_length_check;

create or replace function public.set_cgpa_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end
$$;

drop trigger if exists set_cgpa_profile_updated_at on public.cgpa_profiles;
create trigger set_cgpa_profile_updated_at
  before update on public.cgpa_profiles
  for each row execute function public.set_cgpa_profile_updated_at();

create index if not exists cgpa_profiles_updated_at_idx
  on public.cgpa_profiles (updated_at desc);

alter table public.cgpa_profiles enable row level security;

drop policy if exists "CGP owners can read their profile" on public.cgpa_profiles;
create policy "CGP owners can read their profile"
  on public.cgpa_profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "CGP owners can insert their profile" on public.cgpa_profiles;
create policy "CGP owners can insert their profile"
  on public.cgpa_profiles
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "CGP owners can update their profile" on public.cgpa_profiles;
create policy "CGP owners can update their profile"
  on public.cgpa_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on table public.cgpa_profiles from public, anon, authenticated;
grant select, insert, update on table public.cgpa_profiles to authenticated;
