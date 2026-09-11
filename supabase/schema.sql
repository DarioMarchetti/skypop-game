-- Cloud Hop backend schema.
-- Apply this file through Supabase SQL editor or a migration in CI.
-- The Edge Function is the only writer; browser roles have no table privileges.


create table if not exists public.cloud_hop_sessions (
  id uuid primary key default gen_random_uuid(),
  seed bigint not null check (seed >= 0 and seed <= 4294967295),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  submitted_score integer,
  submitted_perfect_count integer,
  submitted_nickname text,
  constraint cloud_hop_sessions_expiry_after_creation check (expires_at > created_at),
  constraint cloud_hop_sessions_score_valid check (submitted_score is null or submitted_score >= 0),
  constraint cloud_hop_sessions_perfect_valid check (submitted_perfect_count is null or submitted_perfect_count >= 0),
  constraint cloud_hop_sessions_nickname_valid check (submitted_nickname is null or char_length(submitted_nickname) between 1 and 16)
);

create index if not exists cloud_hop_sessions_expires_idx
  on public.cloud_hop_sessions (expires_at);

create table if not exists public.cloud_hop_scores (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.cloud_hop_sessions(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 16),
  score integer not null check (score >= 0),
  perfect_count integer not null check (perfect_count >= 0),
  created_at timestamptz not null default now()
);

create index if not exists cloud_hop_scores_leaderboard_idx
  on public.cloud_hop_scores (score desc, created_at asc, id asc);

-- A row is kept per anonymised endpoint/fingerprint. The Edge Function hashes the
-- network hint with a server-only salt before it reaches this table.
create table if not exists public.cloud_hop_rate_limits (
  rate_key text primary key check (char_length(rate_key) between 1 and 200),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0)
);

alter table public.cloud_hop_sessions enable row level security;
alter table public.cloud_hop_sessions force row level security;
alter table public.cloud_hop_scores enable row level security;
alter table public.cloud_hop_scores force row level security;
alter table public.cloud_hop_rate_limits enable row level security;
alter table public.cloud_hop_rate_limits force row level security;

-- The public Data API is intentionally not a data path for this feature.
revoke all on table public.cloud_hop_sessions from anon, authenticated;
revoke all on table public.cloud_hop_scores from anon, authenticated;
revoke all on table public.cloud_hop_rate_limits from anon, authenticated;
grant all on table public.cloud_hop_sessions to service_role;
grant all on table public.cloud_hop_scores to service_role;
grant all on table public.cloud_hop_rate_limits to service_role;

create or replace function public.cloud_hop_consume_rate_limit(
  p_rate_key text,
  p_limit integer default 20,
  p_window_seconds integer default 60
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_window_start timestamptz;
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_rate_key is null or char_length(p_rate_key) not between 1 and 200
     or p_limit < 1 or p_limit > 10000
     or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;

  insert into public.cloud_hop_rate_limits(rate_key, window_started_at, request_count)
  values (p_rate_key, now(), 1)
  on conflict (rate_key) do update
  set window_started_at = case
        when public.cloud_hop_rate_limits.window_started_at
             + make_interval(secs => p_window_seconds) <= now()
          then now()
        else public.cloud_hop_rate_limits.window_started_at
      end,
      request_count = case
        when public.cloud_hop_rate_limits.window_started_at
             + make_interval(secs => p_window_seconds) <= now()
          then 1
        else public.cloud_hop_rate_limits.request_count + 1
      end
  returning request_count, window_started_at into v_count, v_window_start;

  return v_count <= p_limit;
end;
$$;

create or replace function public.cloud_hop_submit_score(
  p_session_id uuid,
  p_token_hash text,
  p_score integer,
  p_perfect_count integer,
  p_nickname text
)
returns table(accepted boolean, duplicate boolean, score integer, perfect_count integer)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_session public.cloud_hop_sessions%rowtype;
  v_score public.cloud_hop_scores%rowtype;
  v_nickname text := btrim(coalesce(p_nickname, ''));
begin
  if current_user not in ('service_role', 'postgres') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_session_id is null or p_token_hash is null
     or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_score is null or p_score < 0
     or p_perfect_count is null or p_perfect_count < 0
     or char_length(v_nickname) not between 1 and 16 then
    raise exception 'invalid score arguments' using errcode = '22023';
  end if;

  select * into v_session
    from public.cloud_hop_sessions
   where id = p_session_id
   for update;

  if not found or v_session.token_hash <> p_token_hash then
    raise exception 'invalid session token' using errcode = '28000';
  end if;

  -- A retry after a successful commit returns the original result. This makes
  -- network retries safe and also serialises concurrent submissions.
  if v_session.used_at is not null then
    return query select true, true, v_session.submitted_score, v_session.submitted_perfect_count;
    return;
  end if;

  if v_session.expires_at <= now() then
    raise exception 'session expired' using errcode = '22023';
  end if;

  insert into public.cloud_hop_scores(session_id, nickname, score, perfect_count)
  values (v_session.id, v_nickname, p_score, p_perfect_count)
  returning * into v_score;

  update public.cloud_hop_sessions
     set used_at = now(),
         submitted_score = v_score.score,
         submitted_perfect_count = v_score.perfect_count,
         submitted_nickname = v_score.nickname
   where id = v_session.id;

  return query select true, false, v_score.score, v_score.perfect_count;
end;
$$;

-- These privileged RPCs are deliberately inaccessible to browser
-- roles. service_role is used only inside the Edge Function.
revoke all on function public.cloud_hop_consume_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.cloud_hop_submit_score(uuid, text, integer, integer, text) from public, anon, authenticated;
grant execute on function public.cloud_hop_consume_rate_limit(text, integer, integer) to service_role;
grant execute on function public.cloud_hop_submit_score(uuid, text, integer, integer, text) to service_role;
