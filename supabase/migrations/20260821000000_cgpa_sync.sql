create table if not exists public.cgpa_records (
  id text primary key,
  user_id uuid references auth.users(id) default auth.uid(),
  record_type text not null check (record_type in ('semester', 'course', 'settings')),
  payload jsonb not null,
  synced boolean not null default false,
  updated_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

alter table public.cgpa_records enable row level security;

alter table public.cgpa_records add column if not exists user_id uuid references auth.users(id) default auth.uid();

drop policy if exists "Authenticated users can read CGPA records" on public.cgpa_records;
create policy "Authenticated users can read CGPA records"
  on public.cgpa_records for select to authenticated using (user_id = auth.uid());

drop policy if exists "Authenticated users can insert CGPA records" on public.cgpa_records;
create policy "Authenticated users can insert CGPA records"
  on public.cgpa_records for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "Authenticated users can update CGPA records" on public.cgpa_records;
create policy "Authenticated users can update CGPA records"
  on public.cgpa_records for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create index if not exists cgpa_records_updated_at_idx on public.cgpa_records (updated_at);