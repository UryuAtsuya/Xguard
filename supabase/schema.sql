-- XGuard Supabase v1 schema draft
-- Created: 2026-05-24
-- Purpose: read-only backup, proof page DTO, API usage tracking, compliance queue, and Stripe idempotency.
-- Safety: v0 does not include automated DM, follow/unfollow, posting, or ban-evasion workflows.

create type public.subscription_status as enum ('inactive', 'trialing', 'active', 'past_due', 'canceled');
create type public.x_account_status as enum ('connected', 'auth_expired', 'rate_limited', 'suspected_banned', 'banned', 'suspended', 'deleted', 'unknown');
create type public.backup_run_status as enum ('queued', 'running', 'completed', 'partial', 'failed', 'rate_limited', 'auth_expired');
create type public.proof_page_visibility as enum ('private', 'unlisted', 'public', 'revoked');
create type public.content_compliance_event_type as enum ('tweet_deleted', 'tweet_protected', 'tweet_withheld', 'tweet_changed', 'user_deleted', 'user_suspended', 'user_request_delete', 'proof_page_revoked');
create type public.recovery_session_status as enum ('draft', 'proof_ready', 'new_account_registered', 'completed');
create type public.recovery_case_status as enum ('open', 'proof_ready', 'recovering', 'closed', 'canceled');
create type public.health_check_reason as enum ('ok', 'not_found', 'forbidden', 'auth_failed', 'rate_limited', 'api_error', 'network_error', 'unknown');
create type public.x_oauth_connection_status as enum ('active', 'auth_expired', 'revoked');
create type public.admin_role as enum ('owner', 'operator', 'viewer');
create type public.admin_member_status as enum ('invited', 'active', 'disabled');
create type public.admin_membership_event_type as enum ('invited', 'invitation_resent', 'activated', 'role_changed', 'disabled', 'reactivated');

create table public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  subscription_status public.subscription_status not null default 'inactive',
  stripe_customer_id text,
  stripe_subscription_id text,
  monthly_api_cost_limit_usd numeric(10, 4) not null default 10.0000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  email text not null unique check (email = lower(btrim(email))),
  role public.admin_role not null,
  status public.admin_member_status not null default 'invited',
  invited_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_membership_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  member_id uuid not null references public.admin_members(id) on delete cascade,
  event_type public.admin_membership_event_type not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.x_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  x_user_id text not null,
  username text not null,
  display_name text,
  avatar_url text,
  status public.x_account_status not null default 'connected',
  connected_at timestamptz not null default now(),
  last_backup_at timestamptz,
  last_health_check_at timestamptz,
  suspected_banned_at timestamptz,
  banned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, x_user_id)
);

create table public.x_oauth_connections (
  id uuid primary key default gen_random_uuid(),
  x_account_id uuid not null references public.x_accounts(id) on delete cascade,
  provider text not null default 'x',
  scope text[] not null default '{}',
  access_token_ref text not null,
  refresh_token_ref text,
  status public.x_oauth_connection_status not null default 'active',
  expires_at timestamptz,
  refreshed_at timestamptz,
  auth_expired_at timestamptz,
  revoked_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (x_account_id, provider)
);

create table public.oauth_states (
  state text primary key,
  code_verifier text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  x_account_id uuid not null references public.x_accounts(id) on delete cascade,
  status public.backup_run_status not null default 'queued',
  started_at timestamptz,
  completed_at timestamptz,
  tweet_limit integer not null default 100,
  tweets_captured integer not null default 0,
  profiles_captured integer not null default 0,
  api_units_used integer not null default 0,
  estimated_cost_usd numeric(10, 4) not null default 0,
  rate_limit_remaining integer,
  rate_limit_reset_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now()
);

create table public.api_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  x_account_id uuid references public.x_accounts(id) on delete set null,
  backup_run_id uuid references public.backup_runs(id) on delete set null,
  endpoint text not null,
  method text not null default 'GET',
  resource_type text not null,
  resource_count integer not null default 0,
  owned_read boolean not null default true,
  estimated_cost_usd numeric(10, 4) not null default 0,
  rate_limit_limit integer,
  rate_limit_remaining integer,
  rate_limit_reset_at timestamptz,
  status_code integer,
  occurred_at timestamptz not null default now()
);

create table public.tweet_snapshots (
  id uuid primary key default gen_random_uuid(),
  x_account_id uuid not null references public.x_accounts(id) on delete cascade,
  backup_run_id uuid references public.backup_runs(id) on delete set null,
  tweet_id text not null,
  text text not null,
  posted_at timestamptz not null,
  like_count integer,
  repost_count integer,
  reply_count integer,
  quote_count integer,
  bookmark_count integer,
  impression_count integer,
  media_urls text[] not null default '{}',
  raw_payload jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  deleted_at timestamptz,
  withheld_at timestamptz,
  protected_at timestamptz,
  unique (x_account_id, tweet_id, captured_at)
);

create table public.media (
  id uuid primary key default gen_random_uuid(),
  x_account_id uuid not null references public.x_accounts(id) on delete cascade,
  backup_run_id uuid references public.backup_runs(id) on delete set null,
  tweet_snapshot_id uuid references public.tweet_snapshots(id) on delete set null,
  tweet_id text not null,
  media_key text not null,
  type text not null,
  url_or_storage_key text not null,
  width integer,
  height integer,
  duration_ms integer,
  captured_at timestamptz not null default now(),
  unique (x_account_id, media_key, captured_at)
);

create table public.profile_snapshots (
  id uuid primary key default gen_random_uuid(),
  x_account_id uuid not null references public.x_accounts(id) on delete cascade,
  backup_run_id uuid references public.backup_runs(id) on delete set null,
  display_name text,
  bio text,
  avatar_url text,
  banner_url text,
  follower_count integer,
  following_count integer,
  tweet_count integer,
  listed_count integer,
  raw_payload jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

create table public.account_health_checks (
  id uuid primary key default gen_random_uuid(),
  x_account_id uuid not null references public.x_accounts(id) on delete cascade,
  status public.x_account_status not null,
  reason public.health_check_reason not null default 'unknown',
  http_status integer,
  error_code text,
  error_message text,
  checked_at timestamptz not null default now()
);

create table public.proof_pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  x_account_id uuid not null references public.x_accounts(id) on delete cascade,
  backup_run_id uuid not null references public.backup_runs(id) on delete cascade,
  slug text not null unique,
  visibility public.proof_page_visibility not null default 'private',
  public_payload jsonb not null default '{}'::jsonb,
  redaction_policy_version text not null default 'v1',
  published_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (backup_run_id)
);

create table public.content_compliance_events (
  id uuid primary key default gen_random_uuid(),
  x_account_id uuid not null references public.x_accounts(id) on delete cascade,
  tweet_snapshot_id uuid references public.tweet_snapshots(id) on delete set null,
  proof_page_id uuid references public.proof_pages(id) on delete set null,
  event_type public.content_compliance_event_type not null,
  source text not null default 'x_api',
  details jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.recovery_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  old_x_account_id uuid not null references public.x_accounts(id) on delete cascade,
  proof_page_id uuid references public.proof_pages(id) on delete set null,
  new_account_url text,
  announcement_draft text,
  pinned_post_draft text,
  profile_bio_draft text,
  status public.recovery_session_status not null default 'draft',
  created_at timestamptz not null default now(),
  proof_ready_at timestamptz,
  completed_at timestamptz
);

create table public.recovery_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  x_account_id uuid not null references public.x_accounts(id) on delete cascade,
  proof_page_id uuid references public.proof_pages(id) on delete set null,
  status public.recovery_case_status not null default 'open',
  reason text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.manual_notification_queue (
  id uuid primary key default gen_random_uuid(),
  recovery_session_id uuid not null references public.recovery_sessions(id) on delete cascade,
  target_x_user_id text,
  target_username text,
  message_draft text not null,
  review_status text not null default 'pending',
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.stripe_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  event_type text not null,
  customer_id text,
  subscription_id text,
  processed_at timestamptz,
  processing_error text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index x_accounts_user_id_idx on public.x_accounts(user_id);
create index admin_members_status_role_idx on public.admin_members(status, role);
create index admin_membership_events_member_id_created_at_idx on public.admin_membership_events(member_id, created_at desc);
create index x_oauth_connections_x_account_id_idx on public.x_oauth_connections(x_account_id);
create index oauth_states_expires_at_idx on public.oauth_states(expires_at);
create index backup_runs_x_account_id_created_at_idx on public.backup_runs(x_account_id, created_at desc);
create index api_usage_events_user_id_occurred_at_idx on public.api_usage_events(user_id, occurred_at desc);
create index tweet_snapshots_x_account_id_captured_at_idx on public.tweet_snapshots(x_account_id, captured_at desc);
create index media_x_account_id_captured_at_idx on public.media(x_account_id, captured_at desc);
create index media_tweet_snapshot_id_idx on public.media(tweet_snapshot_id);
create index profile_snapshots_x_account_id_captured_at_idx on public.profile_snapshots(x_account_id, captured_at desc);
create index account_health_checks_x_account_id_checked_at_idx on public.account_health_checks(x_account_id, checked_at desc);
create index proof_pages_user_id_created_at_idx on public.proof_pages(user_id, created_at desc);
create index content_compliance_events_x_account_id_created_at_idx on public.content_compliance_events(x_account_id, created_at desc);
create index recovery_sessions_user_id_created_at_idx on public.recovery_sessions(user_id, created_at desc);
create index recovery_cases_user_id_opened_at_idx on public.recovery_cases(user_id, opened_at desc);
create index recovery_cases_x_account_id_opened_at_idx on public.recovery_cases(x_account_id, opened_at desc);

alter table public.user_profiles enable row level security;
alter table public.admin_members enable row level security;
alter table public.admin_membership_events enable row level security;
alter table public.x_accounts enable row level security;
alter table public.x_oauth_connections enable row level security;
alter table public.oauth_states enable row level security;
alter table public.backup_runs enable row level security;
alter table public.api_usage_events enable row level security;
alter table public.tweet_snapshots enable row level security;
alter table public.media enable row level security;
alter table public.profile_snapshots enable row level security;
alter table public.account_health_checks enable row level security;
alter table public.proof_pages enable row level security;
alter table public.content_compliance_events enable row level security;
alter table public.recovery_sessions enable row level security;
alter table public.recovery_cases enable row level security;
alter table public.manual_notification_queue enable row level security;
alter table public.stripe_events enable row level security;

create policy "Users can read own profile" on public.user_profiles for select using (auth.uid() = id);
create policy "Users can read own x accounts" on public.x_accounts for select using (auth.uid() = user_id);
create policy "Users can read own api usage" on public.api_usage_events for select using (auth.uid() = user_id);
create policy "Users can read own proof pages" on public.proof_pages for select using (auth.uid() = user_id);
create policy "Users can read own recovery sessions" on public.recovery_sessions for select using (auth.uid() = user_id);

create policy "Users can read own backup runs" on public.backup_runs for select using (
  exists (select 1 from public.x_accounts where x_accounts.id = backup_runs.x_account_id and x_accounts.user_id = auth.uid())
);

create policy "Users can read own tweet snapshots" on public.tweet_snapshots for select using (
  exists (select 1 from public.x_accounts where x_accounts.id = tweet_snapshots.x_account_id and x_accounts.user_id = auth.uid())
);

create policy "Users can read own media" on public.media for select using (
  exists (select 1 from public.x_accounts where x_accounts.id = media.x_account_id and x_accounts.user_id = auth.uid())
);

create policy "Users can read own profile snapshots" on public.profile_snapshots for select using (
  exists (select 1 from public.x_accounts where x_accounts.id = profile_snapshots.x_account_id and x_accounts.user_id = auth.uid())
);

create policy "Users can read own health checks" on public.account_health_checks for select using (
  exists (select 1 from public.x_accounts where x_accounts.id = account_health_checks.x_account_id and x_accounts.user_id = auth.uid())
);

create policy "Users can read own compliance events" on public.content_compliance_events for select using (
  exists (select 1 from public.x_accounts where x_accounts.id = content_compliance_events.x_account_id and x_accounts.user_id = auth.uid())
);

create policy "Users can read own recovery cases" on public.recovery_cases for select using (auth.uid() = user_id);

create policy "Users can read own manual notification queue" on public.manual_notification_queue for select using (
  exists (
    select 1
    from public.recovery_sessions
    where recovery_sessions.id = manual_notification_queue.recovery_session_id
      and recovery_sessions.user_id = auth.uid()
  )
);

-- admin_members, admin_membership_events, x_oauth_connections, oauth_states,
-- and stripe_events are service-role only.
-- Insert/update/delete are service-role only for v0.
-- Do not expose token refs, raw X payload, service role keys, or Stripe raw payloads to the frontend.
revoke all on table public.x_oauth_connections from public, anon, authenticated;
grant all on table public.x_oauth_connections to service_role;
revoke all on table public.oauth_states from public, anon, authenticated;
grant all on table public.oauth_states to service_role;
revoke all on table public.admin_members from public, anon, authenticated;
grant all on table public.admin_members to service_role;
revoke all on table public.admin_membership_events from public, anon, authenticated;
grant all on table public.admin_membership_events to service_role;

create or replace function public.bootstrap_admin_owner(
  p_user_id uuid,
  p_email text,
  p_created_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  created_member public.admin_members%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('xguard_admin_bootstrap_guard', 0));

  if exists (select 1 from public.admin_members) then
    raise exception 'admin_bootstrap_already_completed' using errcode = 'P0001';
  end if;

  insert into public.admin_members (
    user_id,
    email,
    role,
    status,
    invited_by_user_id,
    created_at,
    updated_at
  ) values (
    p_user_id,
    lower(btrim(p_email)),
    'owner',
    'invited',
    null,
    coalesce(p_created_at, now()),
    coalesce(p_created_at, now())
  )
  returning * into created_member;

  insert into public.admin_membership_events (
    actor_user_id,
    member_id,
    event_type,
    details,
    created_at
  ) values (
    null,
    created_member.id,
    'invited',
    jsonb_build_object('bootstrap', true, 'role', 'owner'),
    coalesce(p_created_at, now())
  );

  return to_jsonb(created_member);
end;
$$;

revoke all on function public.bootstrap_admin_owner(
  uuid,
  text,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.bootstrap_admin_owner(
  uuid,
  text,
  timestamptz
) to service_role;

create or replace function public.update_admin_member_safely(
  p_actor_member_id uuid,
  p_member_id uuid,
  p_role public.admin_role,
  p_status public.admin_member_status,
  p_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_member public.admin_members%rowtype;
  target_member public.admin_members%rowtype;
  updated_member public.admin_members%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('xguard_admin_member_guard', 0));

  select * into actor_member
    from public.admin_members
    where id = p_actor_member_id
    for update;

  if not found
    or actor_member.status <> 'active'
    or actor_member.role <> 'owner'
    or actor_member.user_id is null
  then
    raise exception 'admin_owner_required' using errcode = 'P0001';
  end if;

  select * into target_member
    from public.admin_members
    where id = p_member_id
    for update;

  if not found then
    raise exception 'admin_member_not_found' using errcode = 'P0001';
  end if;

  if p_role is null and p_status is null then
    raise exception 'admin_member_update_empty' using errcode = 'P0001';
  end if;

  if p_status = 'invited' then
    raise exception 'admin_member_invalid_status' using errcode = 'P0001';
  end if;

  if target_member.id = actor_member.id and p_status = 'disabled' then
    raise exception 'admin_member_cannot_disable_self' using errcode = 'P0001';
  end if;

  if p_status = 'active' and target_member.user_id is null then
    raise exception 'admin_member_activation_requires_login' using errcode = 'P0001';
  end if;

  if target_member.role = 'owner'
    and target_member.status = 'active'
    and (
      (p_role is not null and p_role <> 'owner')
      or p_status = 'disabled'
    )
    and (
      select count(*)
      from public.admin_members
      where role = 'owner' and status = 'active'
    ) <= 1
  then
    raise exception 'admin_last_owner_required' using errcode = 'P0001';
  end if;

  update public.admin_members
    set role = coalesce(p_role, target_member.role),
        status = coalesce(p_status, target_member.status),
        updated_at = coalesce(p_updated_at, now())
    where id = target_member.id
    returning * into updated_member;

  if p_role is not null and p_role <> target_member.role then
    insert into public.admin_membership_events (
      actor_user_id,
      member_id,
      event_type,
      details,
      created_at
    ) values (
      actor_member.user_id,
      target_member.id,
      'role_changed',
      jsonb_build_object('from', target_member.role, 'to', p_role),
      coalesce(p_updated_at, now())
    );
  end if;

  if p_status is not null and p_status <> target_member.status then
    insert into public.admin_membership_events (
      actor_user_id,
      member_id,
      event_type,
      details,
      created_at
    ) values (
      actor_member.user_id,
      target_member.id,
      case when p_status = 'disabled'
        then 'disabled'::public.admin_membership_event_type
        else 'reactivated'::public.admin_membership_event_type
      end,
      jsonb_build_object('from', target_member.status, 'to', p_status),
      coalesce(p_updated_at, now())
    );
  end if;

  return to_jsonb(updated_member);
end;
$$;

revoke all on function public.update_admin_member_safely(
  uuid,
  uuid,
  public.admin_role,
  public.admin_member_status,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.update_admin_member_safely(
  uuid,
  uuid,
  public.admin_role,
  public.admin_member_status,
  timestamptz
) to service_role;

create or replace function public.validate_media_owner_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.backup_run_id is not null and not exists (
    select 1
    from public.backup_runs
    where backup_runs.id = new.backup_run_id
      and backup_runs.x_account_id = new.x_account_id
  ) then
    raise exception 'media_backup_run_owner_mismatch:%', new.backup_run_id using errcode = 'P0001';
  end if;

  if new.tweet_snapshot_id is not null and not exists (
    select 1
    from public.tweet_snapshots
    where tweet_snapshots.id = new.tweet_snapshot_id
      and tweet_snapshots.x_account_id = new.x_account_id
  ) then
    raise exception 'media_tweet_snapshot_owner_mismatch:%', new.tweet_snapshot_id using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger validate_media_owner_consistency_before_write
  before insert or update of x_account_id, backup_run_id, tweet_snapshot_id
  on public.media
  for each row
  execute function public.validate_media_owner_consistency();

create or replace function public.validate_recovery_case_owner_consistency()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.x_accounts
    where x_accounts.id = new.x_account_id
      and x_accounts.user_id = new.user_id
  ) then
    raise exception 'recovery_case_x_account_owner_mismatch:%', new.x_account_id using errcode = 'P0001';
  end if;

  if new.proof_page_id is not null and not exists (
    select 1
    from public.proof_pages
    where proof_pages.id = new.proof_page_id
      and proof_pages.user_id = new.user_id
      and proof_pages.x_account_id = new.x_account_id
  ) then
    raise exception 'recovery_case_proof_page_owner_mismatch:%', new.proof_page_id using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger validate_recovery_case_owner_consistency_before_write
  before insert or update of user_id, x_account_id, proof_page_id
  on public.recovery_cases
  for each row
  execute function public.validate_recovery_case_owner_consistency();

create or replace function public.update_proof_page_visibility_and_record_content_compliance_event(
  p_backup_run_id uuid,
  p_visibility public.proof_page_visibility,
  p_revoked_at timestamptz,
  p_updated_at timestamptz,
  p_event_id uuid,
  p_x_account_id uuid,
  p_tweet_snapshot_id uuid,
  p_proof_page_id uuid,
  p_event_type public.content_compliance_event_type,
  p_source text,
  p_details jsonb,
  p_resolved_at timestamptz,
  p_created_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_proof_page public.proof_pages%rowtype;
  updated_proof_page public.proof_pages%rowtype;
  selected_backup_run public.backup_runs%rowtype;
begin
  select *
    into locked_proof_page
    from public.proof_pages
    where proof_pages.backup_run_id = p_backup_run_id
    for update;

  if not found then
    return null;
  end if;

  if p_proof_page_id is not null and p_proof_page_id <> locked_proof_page.id then
    raise exception 'proof_page_revocation_event_mismatch:%', p_backup_run_id using errcode = 'P0001';
  end if;

  if p_x_account_id <> locked_proof_page.x_account_id then
    raise exception 'proof_page_revocation_event_mismatch:%', p_backup_run_id using errcode = 'P0001';
  end if;

  update public.proof_pages
    set visibility = p_visibility,
        revoked_at = p_revoked_at,
        updated_at = p_updated_at
    where proof_pages.id = locked_proof_page.id
    returning * into updated_proof_page;

  insert into public.content_compliance_events (
    id,
    x_account_id,
    tweet_snapshot_id,
    proof_page_id,
    event_type,
    source,
    details,
    resolved_at,
    created_at
  ) values (
    coalesce(p_event_id, gen_random_uuid()),
    p_x_account_id,
    p_tweet_snapshot_id,
    updated_proof_page.id,
    p_event_type,
    coalesce(p_source, 'x_api'),
    coalesce(p_details, '{}'::jsonb),
    p_resolved_at,
    coalesce(p_created_at, now())
  );

  select *
    into selected_backup_run
    from public.backup_runs
    where backup_runs.id = updated_proof_page.backup_run_id;

  return jsonb_build_object(
    'backup_run', to_jsonb(selected_backup_run),
    'proof_page', to_jsonb(updated_proof_page)
  );
end;
$$;

revoke all on function public.update_proof_page_visibility_and_record_content_compliance_event(
  uuid,
  public.proof_page_visibility,
  timestamptz,
  timestamptz,
  uuid,
  uuid,
  uuid,
  uuid,
  public.content_compliance_event_type,
  text,
  jsonb,
  timestamptz,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.update_proof_page_visibility_and_record_content_compliance_event(
  uuid,
  public.proof_page_visibility,
  timestamptz,
  timestamptz,
  uuid,
  uuid,
  uuid,
  uuid,
  public.content_compliance_event_type,
  text,
  jsonb,
  timestamptz,
  timestamptz
) to service_role;

create or replace function public.record_api_usage_event_with_monthly_limit(
  p_id uuid,
  p_user_id uuid,
  p_x_account_id uuid,
  p_backup_run_id uuid,
  p_endpoint text,
  p_method text,
  p_resource_type text,
  p_resource_count integer,
  p_owned_read boolean,
  p_estimated_cost_usd numeric,
  p_rate_limit_limit integer,
  p_rate_limit_remaining integer,
  p_rate_limit_reset_at timestamptz,
  p_status_code integer,
  p_occurred_at timestamptz
)
returns public.api_usage_events
language plpgsql
security definer
set search_path = public
as $$
declare
  monthly_limit numeric(10, 4);
  current_month_cost numeric(10, 4);
  inserted_event public.api_usage_events%rowtype;
begin
  select user_profiles.monthly_api_cost_limit_usd
    into monthly_limit
    from public.user_profiles
    where user_profiles.id = p_user_id
    for update;

  if not found then
    raise exception 'api_usage_ledger_user_profile_not_found:%', p_user_id using errcode = 'P0001';
  end if;

  if p_x_account_id is not null and not exists (
    select 1
    from public.x_accounts
    where x_accounts.id = p_x_account_id
      and x_accounts.user_id = p_user_id
  ) then
    raise exception 'api_usage_ledger_x_account_not_found:%', p_x_account_id using errcode = 'P0001';
  end if;

  if p_backup_run_id is not null and p_x_account_id is null then
    raise exception 'api_usage_ledger_x_account_required_for_backup_run' using errcode = 'P0001';
  end if;

  if p_backup_run_id is not null and not exists (
    select 1
    from public.backup_runs
    join public.x_accounts on x_accounts.id = backup_runs.x_account_id
    where backup_runs.id = p_backup_run_id
      and x_accounts.user_id = p_user_id
      and backup_runs.x_account_id = p_x_account_id
  ) then
    raise exception 'api_usage_ledger_backup_run_not_found:%', p_backup_run_id using errcode = 'P0001';
  end if;

  if p_resource_count < 0 then
    raise exception 'api_usage_ledger_invalid_non_negative_integer:resourceCount' using errcode = 'P0001';
  end if;

  if p_rate_limit_limit is not null and p_rate_limit_limit < 0 then
    raise exception 'api_usage_ledger_invalid_non_negative_integer:rateLimitLimit' using errcode = 'P0001';
  end if;

  if p_rate_limit_remaining is not null and p_rate_limit_remaining < 0 then
    raise exception 'api_usage_ledger_invalid_non_negative_integer:rateLimitRemaining' using errcode = 'P0001';
  end if;

  if p_estimated_cost_usd < 0 then
    raise exception 'api_usage_ledger_invalid_non_negative_cost:estimatedCostUsd' using errcode = 'P0001';
  end if;

  select coalesce(sum(api_usage_events.estimated_cost_usd), 0)
    into current_month_cost
    from public.api_usage_events
    where api_usage_events.user_id = p_user_id
      and api_usage_events.occurred_at >= date_trunc('month', p_occurred_at)
      and api_usage_events.occurred_at < date_trunc('month', p_occurred_at) + interval '1 month';

  if current_month_cost + p_estimated_cost_usd > monthly_limit then
    raise exception 'api_usage_ledger_monthly_cost_limit_exceeded:%', p_user_id using errcode = 'P0001';
  end if;

  insert into public.api_usage_events (
    id,
    user_id,
    x_account_id,
    backup_run_id,
    endpoint,
    method,
    resource_type,
    resource_count,
    owned_read,
    estimated_cost_usd,
    rate_limit_limit,
    rate_limit_remaining,
    rate_limit_reset_at,
    status_code,
    occurred_at
  ) values (
    p_id,
    p_user_id,
    p_x_account_id,
    p_backup_run_id,
    p_endpoint,
    p_method,
    p_resource_type,
    p_resource_count,
    p_owned_read,
    p_estimated_cost_usd,
    p_rate_limit_limit,
    p_rate_limit_remaining,
    p_rate_limit_reset_at,
    p_status_code,
    p_occurred_at
  ) returning * into inserted_event;

  return inserted_event;
end;
$$;

revoke all on function public.record_api_usage_event_with_monthly_limit(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  boolean,
  numeric,
  integer,
  integer,
  timestamptz,
  integer,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.record_api_usage_event_with_monthly_limit(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  integer,
  boolean,
  numeric,
  integer,
  integer,
  timestamptz,
  integer,
  timestamptz
) to service_role;
