create table if not exists public.vault_backups (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  encrypted_payload jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint vault_backups_encrypted_payload_shape check (
    pg_catalog.jsonb_typeof(encrypted_payload) = 'object'
    and encrypted_payload ?& array['version', 'salt', 'iv', 'ciphertext']
    and encrypted_payload - array['version', 'salt', 'iv', 'ciphertext'] = '{}'::jsonb
    and encrypted_payload->>'version' = '1'
    and pg_catalog.jsonb_typeof(encrypted_payload->'salt') = 'string'
    and pg_catalog.jsonb_typeof(encrypted_payload->'iv') = 'string'
    and pg_catalog.jsonb_typeof(encrypted_payload->'ciphertext') = 'string'
    and pg_catalog.octet_length(encrypted_payload::text) <= 2796204
  )
);

alter table public.vault_backups
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

create index if not exists vault_backups_updated_at_idx
  on public.vault_backups (updated_at desc);

alter table public.vault_backups enable row level security;

drop policy if exists "Vault backup owner can read" on public.vault_backups;
create policy "Vault backup owner can read"
  on public.vault_backups for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Vault backup owner can insert" on public.vault_backups;
create policy "Vault backup owner can insert"
  on public.vault_backups for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "Vault backup owner can update" on public.vault_backups;
create policy "Vault backup owner can update"
  on public.vault_backups for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

revoke all on public.vault_backups from anon, authenticated;
grant select, insert, update on public.vault_backups to authenticated;
