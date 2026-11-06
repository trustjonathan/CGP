-- Run in a disposable Supabase project (or SQL Editor as postgres), after all
-- migrations have been applied. Replace both UUID values with two existing
-- auth.users.id values. The test data is rolled back at the end.
--
-- The fixture for an already-expired link is inserted as the migration owner;
-- every tested app operation below runs with SET LOCAL ROLE authenticated and
-- a simulated JWT subject. No real student data is read or changed.

begin;

create temporary table cgp_verification_users (
  owner_id uuid not null,
  other_id uuid not null,
  check (owner_id <> other_id)
);
insert into cgp_verification_users (owner_id, other_id)
values (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002'
);

create temporary table cgp_verification_state (
  expired_token text not null,
  expired_setup_id uuid not null
);
grant select on cgp_verification_users, cgp_verification_state to authenticated;

do $$
declare
  v_owner uuid;
  v_expired_token text;
  v_expired_setup_id uuid;
begin
  select owner_id into v_owner from pg_temp.cgp_verification_users;
  if not exists (select 1 from auth.users where id = v_owner)
     or not exists (
       select 1 from auth.users
       where id = (select other_id from pg_temp.cgp_verification_users)
     ) then
    raise exception 'Replace the verification UUIDs with two existing auth.users.id values.';
  end if;

  v_expired_token := pg_catalog.translate(
    pg_catalog.rtrim(pg_catalog.encode(extensions.gen_random_bytes(16), 'base64'), '='),
    '+/', '-_'
  );
  v_expired_setup_id := extensions.gen_random_uuid();

  insert into public.shared_setups (
    id, owner_id, token_hash, title, payload, include_assessments,
    include_topics, created_at, updated_at, expires_at
  )
  values (
    v_expired_setup_id,
    v_owner,
    extensions.digest(pg_catalog.convert_to(v_expired_token, 'UTF8'), 'sha256'),
    'Verification expired link',
    '{"version":1,"semesters":[{"academicYear":"2026/27","semesterNumber":1,"courses":[{"name":"Sample course","creditUnits":3,"targetGradePoint":5}]}]}'::jsonb,
    false,
    false,
    pg_catalog.now() - interval '2 days',
    pg_catalog.now() - interval '2 days',
    pg_catalog.now() - interval '1 day'
  );

  insert into pg_temp.cgp_verification_state (expired_token, expired_setup_id)
  values (v_expired_token, v_expired_setup_id);
end
$$;

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  (select owner_id::text from pg_temp.cgp_verification_users),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select owner_id::text from pg_temp.cgp_verification_users),
    'role', 'authenticated'
  )::text,
  true
);
select set_config(
  'request.headers',
  jsonb_build_object(
    'x-forwarded-for',
    'phase1-verification-' || extensions.gen_random_uuid()::text
  )::text,
  true
);

do $$
declare
  v_owner uuid;
  v_other uuid;
  v_record_id text := 'phase1-verification-' || extensions.gen_random_uuid()::text;
  v_record_result jsonb;
  v_share record;
  v_public_result jsonb;
  v_rows integer;
  v_import_result text;
  v_expired_token text;
  v_expired_setup_id uuid;
begin
  select owner_id, other_id into v_owner, v_other
  from pg_temp.cgp_verification_users;
  select expired_token, expired_setup_id
    into v_expired_token, v_expired_setup_id
  from pg_temp.cgp_verification_state;

  if not (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.cgpa_records'::regclass
  ) or not (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.cgpa_record_conflicts'::regclass
  ) or not (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.shared_setups'::regclass
  ) or not (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.setup_imports'::regclass
  ) then
    raise exception 'RLS is not enabled on every account/share table.';
  end if;

  if pg_catalog.has_table_privilege(current_user, 'public.cgpa_records', 'INSERT')
     or pg_catalog.has_table_privilege(current_user, 'public.cgpa_records', 'UPDATE')
     or pg_catalog.has_table_privilege(current_user, 'public.cgpa_records', 'DELETE') then
    raise exception 'Authenticated clients must write CGPA records only through the validated RPC.';
  end if;

  v_record_result := public.save_cgpa_record(
    v_record_id, 'settings', '{"targetCGPA":4.5}'::jsonb, false, 0
  );
  if v_record_result->>'status' <> 'saved'
     or (v_record_result->>'revision')::bigint <> 1 then
    raise exception 'Owner RPC insert did not return a saved revision.';
  end if;

  select count(*) into v_rows
  from public.cgpa_records
  where user_id = v_owner and id = v_record_id;
  if v_rows <> 1 then
    raise exception 'Owner cannot SELECT the row inserted by the validated RPC.';
  end if;

  v_record_result := public.save_cgpa_record(
    v_record_id, 'settings', '{"targetCGPA":4.7}'::jsonb, false, 1
  );
  if v_record_result->>'status' <> 'saved'
     or (v_record_result->>'revision')::bigint <> 2 then
    raise exception 'Owner RPC update did not succeed.';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_other::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_other::text, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_rows
  from public.cgpa_records
  where user_id = v_owner and id = v_record_id;
  if v_rows <> 0 then
    raise exception 'A different authenticated user can read the owner record.';
  end if;

  v_record_result := public.save_cgpa_record(
    v_record_id, 'settings', '{"targetCGPA":1}'::jsonb, false, 2
  );
  if v_record_result->>'status' <> 'conflict' then
    raise exception 'A different authenticated user was able to update the owner record.';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_owner::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
    true
  );

  select count(*) into v_rows
  from public.cgpa_records
  where user_id = v_owner
    and id = v_record_id
    and payload = '{"targetCGPA":4.7}'::jsonb
    and revision = 2;
  if v_rows <> 1 then
    raise exception 'The other user changed the owner record.';
  end if;

  select * into v_share
  from public.create_shared_setup(
    'Verification template',
    '{"version":1,"semesters":[{"academicYear":"2026/27","semesterNumber":1,"courses":[{"name":"Sample course","code":"CS 101","creditUnits":3,"targetGradePoint":5}]}]}'::jsonb,
    false,
    false,
    7
  );
  if v_share.setup_id is null
     or v_share.share_token !~ '^[A-Za-z0-9_-]{22}$' then
    raise exception 'Share RPC did not return a 128-bit URL-safe token and row ID.';
  end if;

  select count(*) into v_rows
  from public.shared_setups
  where id = v_share.setup_id and owner_id = v_owner;
  if v_rows <> 1 then
    raise exception 'Owner cannot SELECT the row inserted by the share RPC.';
  end if;

  v_public_result := public.get_shared_setup(v_share.share_token);
  if v_public_result is null
     or v_public_result - array[
       'id', 'title', 'payload', 'include_assessments', 'include_topics', 'expires_at'
     ] <> '{}'::jsonb
     or v_public_result ? 'owner_id'
     or v_public_result ? 'token_hash'
     or v_public_result::text ~* '"(obtained|score|scores|email|user_id|profileName|documents|vault)"' then
    raise exception 'Valid share RPC returned missing, extra, or unsanitized fields.';
  end if;

  v_import_result := public.record_shared_setup_import(v_share.share_token);
  if v_import_result <> 'recorded'
     or public.record_shared_setup_import(v_share.share_token) <> 'already_imported'
     or public.check_shared_setup_import(v_share.share_token) is not true then
    raise exception 'Share import recording is not idempotent for its authenticated importer.';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_other::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_other::text, 'role', 'authenticated')::text,
    true
  );
  select count(*) into v_rows
  from public.shared_setups
  where id = v_share.setup_id;
  if v_rows <> 0 then
    raise exception 'A different authenticated user can list the owner share row.';
  end if;
  if public.revoke_shared_setup(v_share.setup_id) is not false then
    raise exception 'A different authenticated user revoked the owner share link.';
  end if;

  perform pg_catalog.set_config('request.jwt.claim.sub', v_owner::text, true);
  perform pg_catalog.set_config(
    'request.jwt.claims',
    pg_catalog.jsonb_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
    true
  );
  if public.get_shared_setup('invalid-token') is not null then
    raise exception 'Invalid share token returned data.';
  end if;
  if public.get_shared_setup(v_expired_token) is not null then
    raise exception 'Expired share token returned data.';
  end if;
  if not public.revoke_shared_setup(v_share.setup_id)
     or public.get_shared_setup(v_share.share_token) is not null then
    raise exception 'Owner could not revoke the link or the revoked link still returned data.';
  end if;

  raise notice 'PASS: owner INSERT/SELECT/UPDATE through validated RPC and RLS isolation.';
  raise notice 'PASS: shared setup INSERT RETURNING, owner listing, token validation, sanitized payload, and import idempotence.';
  raise notice 'PASS: another authenticated user cannot read/change owner records or list/revoke owner links.';
  raise notice 'PASS: invalid, expired, and revoked share tokens return no data.';
end
$$;

rollback;
