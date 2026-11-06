-- Idempotent storage and service-only RPCs for the Help Edge Function.
-- Rollback note: forward-only if feedback/cache/audit data matters. Stop the
-- Edge Function, export any required operational data, then remove its RPCs,
-- tables, and indexes in a reviewed down migration.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.help_rate_limits (
  identity_hash text primary key check (identity_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.help_answer_cache (
  question_hash text primary key check (question_hash ~ '^[0-9a-f]{64}$'),
  answer text not null check (length(answer) between 1 and 1500),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists help_answer_cache_expiry_idx
  on public.help_answer_cache (expires_at);

create table if not exists public.help_unanswered_questions (
  question_hash text primary key check (question_hash ~ '^[0-9a-f]{64}$'),
  sanitized_question text not null check (length(sanitized_question) between 1 and 500),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  occurrences integer not null default 1 check (occurrences > 0)
);

create table if not exists public.help_answer_feedback (
  id uuid primary key default extensions.gen_random_uuid(),
  question_hash text not null
    references public.help_answer_cache(question_hash) on delete cascade,
  helpful boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists help_answer_feedback_created_idx
  on public.help_answer_feedback (created_at);

alter table public.help_rate_limits enable row level security;
alter table public.help_answer_cache enable row level security;
alter table public.help_unanswered_questions enable row level security;
alter table public.help_answer_feedback enable row level security;

revoke all on table public.help_rate_limits from public, anon, authenticated;
revoke all on table public.help_answer_cache from public, anon, authenticated;
revoke all on table public.help_unanswered_questions from public, anon, authenticated;
revoke all on table public.help_answer_feedback from public, anon, authenticated;
grant select, insert, update, delete on table public.help_rate_limits to service_role;
grant select, insert, update, delete on table public.help_answer_cache to service_role;
grant select, insert, update, delete on table public.help_unanswered_questions to service_role;
grant select, insert, update, delete on table public.help_answer_feedback to service_role;

create or replace function public.consume_help_rate_limit(
  p_identity_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed boolean := false;
begin
  if p_identity_hash is null
     or p_identity_hash !~ '^[0-9a-f]{64}$'
     or p_limit < 1 or p_limit > 1000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid Help rate limit request.' using errcode = '22023';
  end if;

  insert into public.help_rate_limits (identity_hash, window_started_at, request_count)
  values (p_identity_hash, pg_catalog.now(), 1)
  on conflict (identity_hash) do update
    set window_started_at = case
          when public.help_rate_limits.window_started_at
            <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
            then pg_catalog.now()
          else public.help_rate_limits.window_started_at
        end,
        request_count = case
          when public.help_rate_limits.window_started_at
            <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
            then 1
          else public.help_rate_limits.request_count + 1
        end,
        updated_at = pg_catalog.now()
  where public.help_rate_limits.window_started_at
          <= pg_catalog.now() - pg_catalog.make_interval(secs => p_window_seconds)
     or public.help_rate_limits.request_count < p_limit
  returning true into v_allowed;

  return coalesce(v_allowed, false);
end
$$;

create or replace function public.log_help_unanswered_question(
  p_question_hash text,
  p_sanitized_question text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_question_hash is null
     or p_question_hash !~ '^[0-9a-f]{64}$'
     or p_sanitized_question is null
     or pg_catalog.length(p_sanitized_question) < 1
     or pg_catalog.length(p_sanitized_question) > 500 then
    raise exception 'Invalid unanswered Help question.' using errcode = '22023';
  end if;

  insert into public.help_unanswered_questions (
    question_hash, sanitized_question, first_seen_at, last_seen_at, occurrences
  )
  values (p_question_hash, p_sanitized_question, pg_catalog.now(), pg_catalog.now(), 1)
  on conflict (question_hash) do update
    set last_seen_at = pg_catalog.now(),
        occurrences = public.help_unanswered_questions.occurrences + 1;
end
$$;

revoke all on function public.consume_help_rate_limit(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.log_help_unanswered_question(text, text)
  from public, anon, authenticated;
grant execute on function public.consume_help_rate_limit(text, integer, integer)
  to service_role;
grant execute on function public.log_help_unanswered_question(text, text)
  to service_role;
