-- Idempotent, owner-scoped setup sharing. Only the one-time token is returned;
-- only its SHA-256 hash is stored.
-- Rollback note: forward-only if links have been created. To roll back, first
-- revoke all links and preserve any required audit data, then remove the RPCs,
-- triggers, policies, tables, and private rate-limit state in a reviewed down
-- migration. Never restore raw share tokens from logs or backups.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.is_plain_setup_text(p_value text, p_max_length integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_value is not null
    and p_max_length between 1 and 500
    and pg_catalog.length(pg_catalog.btrim(p_value)) between 1 and p_max_length
    and p_value !~ '[[:cntrl:]]'
    and p_value !~ '<[^>]*>'
    and p_value !~* '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[A-Z]{2,}'
    and p_value !~ '\m[0-9]{3}[- .()][0-9]{3,}[- .()][0-9]{3,}\M'
    and p_value !~* '\m(student|registration|reg)\s*(id|number|no\.?)';
$$;

create or replace function private.shared_setup_payload_is_valid(
  p_payload jsonb,
  p_include_assessments boolean,
  p_include_topics boolean
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_semester jsonb;
  v_course jsonb;
  v_assessment jsonb;
  v_topic jsonb;
  v_semester_count integer;
  v_course_count integer := 0;
  v_assessment_count integer;
  v_topic_count integer;
  v_number numeric;
begin
  if p_payload is null
     or p_include_assessments is null
     or p_include_topics is null
     or pg_catalog.octet_length(p_payload::text) > 262144
     or pg_catalog.jsonb_typeof(p_payload) <> 'object'
     or not (p_payload ?& array['version', 'semesters'])
     or p_payload - array['version', 'semesters'] <> '{}'::jsonb
     or p_payload->>'version' <> '1'
     or pg_catalog.jsonb_typeof(p_payload->'semesters') <> 'array' then
    return false;
  end if;

  v_semester_count := pg_catalog.jsonb_array_length(p_payload->'semesters');
  if v_semester_count < 1 or v_semester_count > 20 then return false; end if;

  for v_semester in
    select value from pg_catalog.jsonb_array_elements(p_payload->'semesters')
  loop
    if pg_catalog.jsonb_typeof(v_semester) <> 'object'
       or not (v_semester ?& array['academicYear', 'semesterNumber', 'courses'])
       or v_semester - array['academicYear', 'semesterNumber', 'courses'] <> '{}'::jsonb
       or not private.is_plain_setup_text(v_semester->>'academicYear', 20)
       or pg_catalog.jsonb_typeof(v_semester->'semesterNumber') <> 'number'
       or pg_catalog.jsonb_typeof(v_semester->'courses') <> 'array' then
      return false;
    end if;

    v_number := (v_semester->>'semesterNumber')::numeric;
    if v_number <> pg_catalog.trunc(v_number)
       or v_number < 1 or v_number > 3
       or pg_catalog.jsonb_array_length(v_semester->'courses') > 50 then
      return false;
    end if;

    for v_course in
      select value from pg_catalog.jsonb_array_elements(v_semester->'courses')
    loop
      v_course_count := v_course_count + 1;
      if v_course_count > 200
         or pg_catalog.jsonb_typeof(v_course) <> 'object'
         or not (v_course ?& array['name', 'creditUnits'])
         or v_course - array[
           'name', 'code', 'creditUnits', 'targetGradePoint', 'assessments', 'topics'
         ] <> '{}'::jsonb
         or not private.is_plain_setup_text(v_course->>'name', 120)
         or pg_catalog.jsonb_typeof(v_course->'creditUnits') <> 'number' then
        return false;
      end if;

      if v_course ? 'code' then
        if pg_catalog.jsonb_typeof(v_course->'code') <> 'string'
           or (v_course->>'code' <> ''
               and not private.is_plain_setup_text(v_course->>'code', 40)) then
          return false;
        end if;
      end if;

      v_number := (v_course->>'creditUnits')::numeric;
      if v_number <> pg_catalog.trunc(v_number) or v_number < 1 or v_number > 6 then
        return false;
      end if;

      if v_course ? 'targetGradePoint' then
        if pg_catalog.jsonb_typeof(v_course->'targetGradePoint') <> 'number' then
          return false;
        end if;
        v_number := (v_course->>'targetGradePoint')::numeric;
        if v_number < 0 or v_number > 5 then return false; end if;
      end if;

      if p_include_assessments then
        if pg_catalog.jsonb_typeof(v_course->'assessments') <> 'array'
           or pg_catalog.jsonb_array_length(v_course->'assessments') > 12 then
          return false;
        end if;
        v_assessment_count := 0;
        for v_assessment in
          select value from pg_catalog.jsonb_array_elements(v_course->'assessments')
        loop
          v_assessment_count := v_assessment_count + 1;
          if pg_catalog.jsonb_typeof(v_assessment) <> 'object'
             or not (v_assessment ?& array['name', 'weight', 'total'])
             or v_assessment - array['name', 'weight', 'total'] <> '{}'::jsonb
             or not private.is_plain_setup_text(v_assessment->>'name', 80)
             or pg_catalog.jsonb_typeof(v_assessment->'weight') <> 'number'
             or pg_catalog.jsonb_typeof(v_assessment->'total') <> 'number' then
            return false;
          end if;
          if (v_assessment->>'weight')::numeric < 0
             or (v_assessment->>'weight')::numeric > 100
             or (v_assessment->>'total')::numeric <= 0
             or (v_assessment->>'total')::numeric > 1000000 then
            return false;
          end if;
        end loop;
      elsif v_course ? 'assessments' then
        return false;
      end if;

      if p_include_topics then
        if pg_catalog.jsonb_typeof(v_course->'topics') <> 'array'
           or pg_catalog.jsonb_array_length(v_course->'topics') > 50 then
          return false;
        end if;
        v_topic_count := 0;
        for v_topic in
          select value from pg_catalog.jsonb_array_elements(v_course->'topics')
        loop
          v_topic_count := v_topic_count + 1;
          if pg_catalog.jsonb_typeof(v_topic) <> 'object'
             or not (v_topic ? 'title')
             or v_topic - array['title'] <> '{}'::jsonb
             or not private.is_plain_setup_text(v_topic->>'title', 120) then
            return false;
          end if;
        end loop;
      elsif v_course ? 'topics' then
        return false;
      end if;
    end loop;
  end loop;

  return true;
exception
  when others then return false;
end
$$;

create table if not exists public.shared_setups (
  id uuid primary key default extensions.gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token_hash bytea not null unique check (pg_catalog.octet_length(token_hash) = 32),
  title text not null check (private.is_plain_setup_text(title, 100)),
  payload jsonb not null,
  include_assessments boolean not null default false,
  include_topics boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  import_count integer not null default 0 check (import_count >= 0),
  constraint shared_setups_expiry_limit check (
    expires_at > created_at and expires_at <= created_at + interval '30 days'
  ),
  constraint shared_setups_payload_valid check (
    private.shared_setup_payload_is_valid(payload, include_assessments, include_topics)
  ),
  constraint shared_setups_deleted_at_consistency check (
    deleted_at is null or revoked_at is not null
  )
);

alter table public.shared_setups
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

update public.shared_setups
set deleted_at = revoked_at
where revoked_at is not null and deleted_at is null;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.shared_setups'::regclass
      and conname = 'shared_setups_expiry_limit'
  ) then
    alter table public.shared_setups
      add constraint shared_setups_expiry_limit
      check (expires_at > created_at and expires_at <= created_at + interval '30 days')
      not valid;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.shared_setups'::regclass
      and conname = 'shared_setups_payload_valid'
  ) then
    alter table public.shared_setups
      add constraint shared_setups_payload_valid
      check (private.shared_setup_payload_is_valid(payload, include_assessments, include_topics))
      not valid;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.shared_setups'::regclass
      and conname = 'shared_setups_deleted_at_consistency'
  ) then
    alter table public.shared_setups
      add constraint shared_setups_deleted_at_consistency
      check (deleted_at is null or revoked_at is not null)
      not valid;
  end if;
end
$$;

alter table public.shared_setups
  validate constraint shared_setups_expiry_limit;
alter table public.shared_setups
  validate constraint shared_setups_payload_valid;
alter table public.shared_setups
  validate constraint shared_setups_deleted_at_consistency;

create index if not exists shared_setups_owner_created_idx
  on public.shared_setups (owner_id, created_at desc);
create index if not exists shared_setups_owner_updated_idx
  on public.shared_setups (owner_id, updated_at desc);
create index if not exists shared_setups_expiry_idx
  on public.shared_setups (expires_at)
  where revoked_at is null;

alter table public.shared_setups enable row level security;

do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'shared_setups'
  loop
    execute pg_catalog.format('drop policy %I on public.shared_setups', v_policy.policyname);
  end loop;
end
$$;

create policy "Shared setups are readable by their owner"
  on public.shared_setups for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "Shared setups are insertable by their owner"
  on public.shared_setups for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "Shared setups are updatable by their owner"
  on public.shared_setups for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on table public.shared_setups from public, anon, authenticated;
grant select on table public.shared_setups to authenticated;

create or replace function private.protect_shared_setup_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at then
    raise exception 'A revoked setup link cannot be reactivated.';
  end if;
  if new.owner_id is distinct from old.owner_id
     or new.payload is distinct from old.payload
     or new.title is distinct from old.title
     or new.include_assessments is distinct from old.include_assessments
     or new.include_topics is distinct from old.include_topics
     or new.created_at is distinct from old.created_at
     or new.expires_at is distinct from old.expires_at
     or (new.import_count is distinct from old.import_count
         and new.import_count <> old.import_count + 1)
     or (new.token_hash is distinct from old.token_hash
         and (old.revoked_at is not null or old.expires_at <= pg_catalog.now()
              or new.revoked_at is distinct from old.revoked_at)) then
    raise exception 'Only token rotation, one import-count increment, or link revocation is allowed.';
  end if;

  if old.revoked_at is null and new.revoked_at is not null then
    new.deleted_at := pg_catalog.now();
  elsif new.revoked_at is null then
    new.deleted_at := null;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end
$$;

drop trigger if exists protect_shared_setup_update on public.shared_setups;
create trigger protect_shared_setup_update
  before update on public.shared_setups
  for each row execute function private.protect_shared_setup_update();

create table if not exists public.setup_imports (
  setup_id uuid not null references public.shared_setups(id) on delete cascade,
  importer_id uuid not null references auth.users(id) on delete cascade,
  imported_at timestamptz not null default now(),
  primary key (setup_id, importer_id)
);

alter table public.setup_imports enable row level security;
do $$
declare
  v_policy record;
begin
  for v_policy in
    select policyname
    from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'setup_imports'
  loop
    execute pg_catalog.format('drop policy %I on public.setup_imports', v_policy.policyname);
  end loop;
end
$$;

create policy "Setup imports are readable by their importer"
  on public.setup_imports for select to authenticated
  using (importer_id = (select auth.uid()));
revoke all on table public.setup_imports from public, anon, authenticated;

create table if not exists private.shared_setup_lookup_limits (
  ip_hash bytea primary key,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now()
);
create table if not exists private.shared_setup_owner_limits (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now()
);

alter table private.shared_setup_lookup_limits enable row level security;
alter table private.shared_setup_owner_limits enable row level security;
revoke all on table private.shared_setup_lookup_limits from public, anon, authenticated;
revoke all on table private.shared_setup_owner_limits from public, anon, authenticated;

create or replace function private.consume_shared_setup_owner_limit(p_owner_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed boolean := false;
begin
  if p_owner_id is null or p_owner_id <> auth.uid() then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  insert into private.shared_setup_owner_limits (owner_id, window_started_at, request_count)
  values (p_owner_id, pg_catalog.now(), 1)
  on conflict (owner_id) do update
    set window_started_at = case
          when private.shared_setup_owner_limits.window_started_at <= pg_catalog.now() - interval '10 minutes'
            then pg_catalog.now()
          else private.shared_setup_owner_limits.window_started_at
        end,
        request_count = case
          when private.shared_setup_owner_limits.window_started_at <= pg_catalog.now() - interval '10 minutes'
            then 1
          else private.shared_setup_owner_limits.request_count + 1
        end,
        updated_at = pg_catalog.now()
  where private.shared_setup_owner_limits.window_started_at <= pg_catalog.now() - interval '10 minutes'
     or private.shared_setup_owner_limits.request_count < 10
  returning true into v_allowed;

  return coalesce(v_allowed, false);
end
$$;

create or replace function public.create_shared_setup(
  p_title text,
  p_payload jsonb,
  p_include_assessments boolean,
  p_include_topics boolean,
  p_expiry_days integer
)
returns table (setup_id uuid, share_token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_expiry_days not in (1, 7, 30)
     or p_include_assessments is null
     or p_include_topics is null
     or not private.is_plain_setup_text(p_title, 100)
     or not private.shared_setup_payload_is_valid(
       p_payload, p_include_assessments, p_include_topics
     ) then
    raise exception 'Invalid shared setup.' using errcode = '22023';
  end if;
  if not private.consume_shared_setup_owner_limit(auth.uid()) then
    raise exception 'Setup-link creation limit reached. Try again later.' using errcode = 'P0001';
  end if;

  v_token := pg_catalog.translate(
    pg_catalog.rtrim(pg_catalog.encode(extensions.gen_random_bytes(16), 'base64'), '='),
    '+/', '-_'
  );
  insert into public.shared_setups (
    owner_id, token_hash, title, payload, include_assessments, include_topics,
    expires_at
  )
  values (
    auth.uid(),
    extensions.digest(pg_catalog.convert_to(v_token, 'UTF8'), 'sha256'),
    pg_catalog.btrim(p_title),
    p_payload,
    p_include_assessments,
    p_include_topics,
    pg_catalog.now() + pg_catalog.make_interval(days => p_expiry_days)
  )
  returning id into v_id;

  return query select v_id, v_token;
end
$$;

create or replace function public.rotate_shared_setup_token(p_setup_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if not private.consume_shared_setup_owner_limit(auth.uid()) then
    raise exception 'Setup-link creation limit reached. Try again later.' using errcode = 'P0001';
  end if;

  v_token := pg_catalog.translate(
    pg_catalog.rtrim(pg_catalog.encode(extensions.gen_random_bytes(16), 'base64'), '='),
    '+/', '-_'
  );
  update public.shared_setups
  set token_hash = extensions.digest(pg_catalog.convert_to(v_token, 'UTF8'), 'sha256')
  where id = p_setup_id
    and owner_id = auth.uid()
    and revoked_at is null
    and expires_at > pg_catalog.now();
  if not found then
    raise exception 'Shared setup is unavailable.' using errcode = 'P0002';
  end if;
  return v_token;
end
$$;

create or replace function public.revoke_shared_setup(p_setup_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  update public.shared_setups
  set revoked_at = pg_catalog.now()
  where id = p_setup_id and owner_id = auth.uid() and revoked_at is null;
  return found;
end
$$;

create or replace function public.get_shared_setup(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers jsonb;
  v_ip text;
  v_ip_hash bytea;
  v_request_count integer;
  v_result jsonb;
begin
  v_headers := coalesce(
    nullif(pg_catalog.current_setting('request.headers', true), '')::jsonb,
    '{}'::jsonb
  );
  v_ip := pg_catalog.split_part(
    coalesce(v_headers->>'cf-connecting-ip', v_headers->>'x-real-ip',
      v_headers->>'x-forwarded-for', 'unavailable'),
    ',', 1
  );
  v_ip_hash := extensions.digest(pg_catalog.convert_to(pg_catalog.btrim(v_ip), 'UTF8'), 'sha256');

  insert into private.shared_setup_lookup_limits (ip_hash, window_started_at, request_count)
  values (v_ip_hash, pg_catalog.now(), 1)
  on conflict (ip_hash) do update
    set window_started_at = case
          when private.shared_setup_lookup_limits.window_started_at <= pg_catalog.now() - interval '10 minutes'
            then pg_catalog.now()
          else private.shared_setup_lookup_limits.window_started_at
        end,
        request_count = case
          when private.shared_setup_lookup_limits.window_started_at <= pg_catalog.now() - interval '10 minutes'
            then 1
          else private.shared_setup_lookup_limits.request_count + 1
        end,
        updated_at = pg_catalog.now()
  where private.shared_setup_lookup_limits.window_started_at <= pg_catalog.now() - interval '10 minutes'
     or private.shared_setup_lookup_limits.request_count < 30
  returning request_count into v_request_count;

  if not found then
    raise exception 'Request limit reached.' using errcode = 'P0001';
  end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{22}$' then return null; end if;

  select pg_catalog.jsonb_build_object(
    'id', id,
    'title', title,
    'payload', payload,
    'include_assessments', include_assessments,
    'include_topics', include_topics,
    'expires_at', expires_at
  )
  into v_result
  from public.shared_setups
  where token_hash = extensions.digest(pg_catalog.convert_to(p_token, 'UTF8'), 'sha256')
    and revoked_at is null
    and expires_at > pg_catalog.now();

  return v_result;
end
$$;

create or replace function public.record_shared_setup_import(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_setup_id uuid;
  v_inserted integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{22}$' then return 'unavailable'; end if;

  select id into v_setup_id
  from public.shared_setups
  where token_hash = extensions.digest(pg_catalog.convert_to(p_token, 'UTF8'), 'sha256')
    and revoked_at is null
    and expires_at > pg_catalog.now();
  if v_setup_id is null then return 'unavailable'; end if;

  insert into public.setup_imports (setup_id, importer_id)
  values (v_setup_id, auth.uid())
  on conflict (setup_id, importer_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    update public.shared_setups
    set import_count = import_count + 1
    where id = v_setup_id;
    return 'recorded';
  end if;
  return 'already_imported';
end
$$;

create or replace function public.check_shared_setup_import(p_token text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_setup_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{22}$' then return false; end if;

  select id into v_setup_id
  from public.shared_setups
  where token_hash = extensions.digest(pg_catalog.convert_to(p_token, 'UTF8'), 'sha256')
    and revoked_at is null
    and expires_at > pg_catalog.now();
  if v_setup_id is null then return false; end if;

  return exists (
    select 1 from public.setup_imports
    where setup_id = v_setup_id and importer_id = auth.uid()
  );
end
$$;

revoke all on function private.is_plain_setup_text(text, integer)
  from public, anon, authenticated;
revoke all on function private.shared_setup_payload_is_valid(jsonb, boolean, boolean)
  from public, anon, authenticated;
revoke all on function private.protect_shared_setup_update()
  from public, anon, authenticated;
revoke all on function private.consume_shared_setup_owner_limit(uuid)
  from public, anon, authenticated;
revoke all on function public.create_shared_setup(text, jsonb, boolean, boolean, integer)
  from public, anon, authenticated;
revoke all on function public.rotate_shared_setup_token(uuid)
  from public, anon, authenticated;
revoke all on function public.revoke_shared_setup(uuid)
  from public, anon, authenticated;
revoke all on function public.get_shared_setup(text)
  from public, anon, authenticated;
revoke all on function public.record_shared_setup_import(text)
  from public, anon, authenticated;
revoke all on function public.check_shared_setup_import(text)
  from public, anon, authenticated;

grant execute on function public.create_shared_setup(text, jsonb, boolean, boolean, integer)
  to authenticated;
grant execute on function public.rotate_shared_setup_token(uuid)
  to authenticated;
grant execute on function public.revoke_shared_setup(uuid)
  to authenticated;
grant execute on function public.get_shared_setup(text)
  to anon, authenticated;
grant execute on function public.record_shared_setup_import(text)
  to authenticated;
grant execute on function public.check_shared_setup_import(text)
  to authenticated;
