-- Idempotent repair for account-scoped CGPA sync metadata and owner access.
-- Rollback note: forward-only for production data. To roll back, first stop
-- clients and take a backup; drop the RPCs/triggers/indexes and added columns
-- only after preserving revision/conflict/tombstone data. Do not remove RLS.

create table if not exists public.cgpa_records (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users(id),
  record_type text not null,
  payload jsonb not null,
  synced boolean not null default true,
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false,
  revision bigint not null default 1,
  deleted_at timestamptz,
  constraint cgpa_records_record_type_check
    check (record_type in ('semester', 'course', 'settings')),
  constraint cgpa_records_payload_object_check
    check (pg_catalog.jsonb_typeof(payload) = 'object')
);

alter table public.cgpa_records
  add column if not exists user_id uuid default auth.uid() references auth.users(id),
  add column if not exists record_type text,
  add column if not exists payload jsonb,
  add column if not exists synced boolean not null default true,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists is_deleted boolean not null default false,
  add column if not exists revision bigint not null default 1,
  add column if not exists deleted_at timestamptz;

do $$
declare
  v_primary_key_name text;
  v_primary_key_definition text;
begin
  if exists (select 1 from public.cgpa_records where user_id is null) then
    raise exception
      'Cannot require cgpa_records.user_id: existing rows have no owner. Assign those rows to their verified owners, then retry.';
  end if;

  alter table public.cgpa_records
    alter column user_id set not null,
    alter column revision set default 1,
    alter column revision set not null;

  select constraint_row.conname, pg_catalog.pg_get_constraintdef(constraint_row.oid)
    into v_primary_key_name, v_primary_key_definition
  from pg_catalog.pg_constraint as constraint_row
  where constraint_row.conrelid = 'public.cgpa_records'::regclass
    and constraint_row.contype = 'p';

  if v_primary_key_name is not null
    and pg_catalog.regexp_replace(pg_catalog.upper(v_primary_key_definition), '\s', '', 'g')
      <> 'PRIMARYKEY(USER_ID,ID)' then
    execute pg_catalog.format(
      'alter table public.cgpa_records drop constraint %I',
      v_primary_key_name
    );
    v_primary_key_name := null;
  end if;

  if v_primary_key_name is null then
    alter table public.cgpa_records
      add constraint cgpa_records_pkey primary key (user_id, id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.cgpa_records'::regclass
      and conname = 'cgpa_records_record_type_check'
  ) then
    alter table public.cgpa_records
      add constraint cgpa_records_record_type_check
      check (record_type in ('semester', 'course', 'settings')) not valid;
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.cgpa_records'::regclass
      and conname = 'cgpa_records_payload_object_check'
  ) then
    alter table public.cgpa_records
      add constraint cgpa_records_payload_object_check
      check (pg_catalog.jsonb_typeof(payload) = 'object') not valid;
  end if;
end
$$;

alter table public.cgpa_records
  validate constraint cgpa_records_record_type_check;
alter table public.cgpa_records
  validate constraint cgpa_records_payload_object_check;

update public.cgpa_records
set deleted_at = updated_at
where is_deleted and deleted_at is null;

update public.cgpa_records
set deleted_at = null
where not is_deleted and deleted_at is not null;

create or replace function public.set_cgpa_record_sync_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  if new.is_deleted then
    new.deleted_at := coalesce(new.deleted_at, pg_catalog.now());
  else
    new.deleted_at := null;
  end if;
  return new;
end
$$;

drop trigger if exists set_cgpa_record_sync_timestamps on public.cgpa_records;
create trigger set_cgpa_record_sync_timestamps
  before insert or update on public.cgpa_records
  for each row execute function public.set_cgpa_record_sync_timestamps();

create index if not exists cgpa_records_user_updated_at_idx
  on public.cgpa_records (user_id, updated_at desc);
create index if not exists cgpa_records_user_deleted_at_idx
  on public.cgpa_records (user_id, deleted_at)
  where deleted_at is not null;

create table if not exists public.cgpa_record_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id text not null,
  record_type text not null
    check (record_type in ('semester', 'course', 'settings')),
  expected_revision bigint not null check (expected_revision >= 0),
  server_revision bigint not null check (server_revision >= 0),
  local_payload jsonb not null
    check (pg_catalog.jsonb_typeof(local_payload) = 'object'),
  local_is_deleted boolean not null,
  server_payload jsonb
    check (server_payload is null or pg_catalog.jsonb_typeof(server_payload) = 'object'),
  server_is_deleted boolean,
  status text not null default 'open'
    check (status in ('open', 'resolved', 'superseded')),
  resolution text
    check (resolution in ('keep_local', 'keep_server')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  resolved_at timestamptz,
  constraint cgpa_record_conflicts_resolution_state_check check (
    (status = 'open' and resolution is null and resolved_at is null)
    or (status = 'resolved' and resolution is not null and resolved_at is not null)
    or (status = 'superseded' and resolution is null and resolved_at is not null)
  )
);

alter table public.cgpa_record_conflicts
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create or replace function public.set_cgpa_conflict_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end
$$;

drop trigger if exists set_cgpa_conflict_updated_at on public.cgpa_record_conflicts;
create trigger set_cgpa_conflict_updated_at
  before update on public.cgpa_record_conflicts
  for each row execute function public.set_cgpa_conflict_updated_at();

create index if not exists cgpa_record_conflicts_user_open_idx
  on public.cgpa_record_conflicts (user_id, created_at desc)
  where status = 'open';
create index if not exists cgpa_record_conflicts_user_updated_at_idx
  on public.cgpa_record_conflicts (user_id, updated_at desc);

alter table public.cgpa_records enable row level security;
alter table public.cgpa_record_conflicts enable row level security;

do $$
declare
  v_policy record;
begin
  for v_policy in
    select tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in ('cgpa_records', 'cgpa_record_conflicts')
  loop
    if v_policy.tablename = 'cgpa_records' then
      execute pg_catalog.format('drop policy %I on public.cgpa_records', v_policy.policyname);
    else
      execute pg_catalog.format('drop policy %I on public.cgpa_record_conflicts', v_policy.policyname);
    end if;
  end loop;
end
$$;

create policy "CGP owners can read their records"
  on public.cgpa_records
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "CGP owners can read their conflicts"
  on public.cgpa_record_conflicts
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.cgpa_records from public, anon, authenticated;
grant select on table public.cgpa_records to authenticated;
revoke all on table public.cgpa_record_conflicts from public, anon, authenticated;
grant select on table public.cgpa_record_conflicts to authenticated;

create or replace function public.save_cgpa_record(
  p_id text,
  p_record_type text,
  p_payload jsonb,
  p_is_deleted boolean,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_record public.cgpa_records%rowtype;
  v_revision bigint;
  v_conflict_id uuid;
  v_record_found boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if p_id is null or pg_catalog.length(pg_catalog.btrim(p_id)) = 0 or pg_catalog.length(p_id) > 250 then
    raise exception using errcode = '22023', message = 'A valid CGPA record id is required.';
  end if;
  if p_record_type is null or p_record_type not in ('semester', 'course', 'settings') then
    raise exception using errcode = '22023', message = 'Unsupported CGPA record type.';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'CGPA record payload must be a JSON object.';
  end if;
  if p_is_deleted is null or p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'A deletion flag and non-negative expected revision are required.';
  end if;

  if p_expected_revision = 0 then
    insert into public.cgpa_records (
      user_id, id, record_type, payload, synced, updated_at, is_deleted, deleted_at, revision
    )
    values (
      v_user_id, p_id, p_record_type, p_payload, true,
      pg_catalog.now(), p_is_deleted,
      case when p_is_deleted then pg_catalog.now() else null end, 1
    )
    on conflict (user_id, id) do nothing
    returning revision into v_revision;

    if found then
      return pg_catalog.jsonb_build_object('status', 'saved', 'revision', v_revision);
    end if;
  end if;

  select record_row.*
    into v_record
  from public.cgpa_records as record_row
  where record_row.user_id = v_user_id
    and record_row.id = p_id
  for update;
  v_record_found := found;

  if not v_record_found or v_record.revision <> p_expected_revision then
    insert into public.cgpa_record_conflicts (
      user_id, record_id, record_type, expected_revision, server_revision,
      local_payload, local_is_deleted, server_payload, server_is_deleted
    )
    values (
      v_user_id, p_id, p_record_type, p_expected_revision,
      case when v_record_found then v_record.revision else 0 end,
      p_payload, p_is_deleted,
      case when v_record_found then v_record.payload else null end,
      case when v_record_found then v_record.is_deleted else null end
    )
    returning id into v_conflict_id;

    return pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'conflict_id', v_conflict_id,
      'revision', case when v_record_found then v_record.revision else 0 end
    );
  end if;

  update public.cgpa_records
  set record_type = p_record_type,
      payload = p_payload,
      synced = true,
      updated_at = pg_catalog.now(),
      is_deleted = p_is_deleted,
      deleted_at = case when p_is_deleted then pg_catalog.now() else null end,
      revision = v_record.revision + 1
  where user_id = v_user_id
    and id = p_id
  returning revision into v_revision;

  return pg_catalog.jsonb_build_object('status', 'saved', 'revision', v_revision);
end
$$;

create or replace function public.resolve_cgpa_record_conflict(
  p_conflict_id uuid,
  p_resolution text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_conflict public.cgpa_record_conflicts%rowtype;
  v_save_result jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if p_resolution is null or p_resolution not in ('keep_local', 'keep_server') then
    raise exception using errcode = '22023', message = 'Resolution must be keep_local or keep_server.';
  end if;

  select conflict_row.*
    into v_conflict
  from public.cgpa_record_conflicts as conflict_row
  where conflict_row.id = p_conflict_id
    and conflict_row.user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'CGPA record conflict not found.';
  end if;
  if v_conflict.status <> 'open' then
    return pg_catalog.jsonb_build_object(
      'status', 'already_resolved',
      'conflict_status', v_conflict.status,
      'resolution', v_conflict.resolution
    );
  end if;

  if p_resolution = 'keep_local' then
    v_save_result := public.save_cgpa_record(
      v_conflict.record_id,
      v_conflict.record_type,
      v_conflict.local_payload,
      v_conflict.local_is_deleted,
      v_conflict.server_revision
    );
    if v_save_result ->> 'status' <> 'saved' then
      if v_save_result ->> 'status' = 'conflict' then
        update public.cgpa_record_conflicts
        set status = 'superseded', resolved_at = pg_catalog.now()
        where id = v_conflict.id and user_id = v_user_id;
      end if;
      return v_save_result;
    end if;
  end if;

  update public.cgpa_record_conflicts
  set status = 'resolved',
      resolution = p_resolution,
      resolved_at = pg_catalog.now()
  where id = v_conflict.id
    and user_id = v_user_id;

  return pg_catalog.jsonb_build_object(
    'status', 'resolved',
    'resolution', p_resolution,
    'revision', v_save_result -> 'revision'
  );
end
$$;

revoke all on function public.save_cgpa_record(text, text, jsonb, boolean, bigint)
  from public, anon, authenticated;
grant execute on function public.save_cgpa_record(text, text, jsonb, boolean, bigint)
  to authenticated;
revoke all on function public.resolve_cgpa_record_conflict(uuid, text)
  from public, anon, authenticated;
grant execute on function public.resolve_cgpa_record_conflict(uuid, text)
  to authenticated;
