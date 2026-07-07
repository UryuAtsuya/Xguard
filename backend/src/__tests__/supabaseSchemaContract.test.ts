import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schemaSql = readFileSync(resolve(process.cwd(), "supabase/schema.sql"), "utf8");
const usageLedgerFunctionSql =
  schemaSql.match(
    /create or replace function public\.record_api_usage_event_with_monthly_limit\([\s\S]*?\n\$\$;/,
  )?.[0] ?? "";
const xOauthConnectionsTableSql =
  schemaSql.match(/create table public\.x_oauth_connections \([\s\S]*?\n\);/)?.[0] ?? "";
const oauthStatesTableSql = schemaSql.match(/create table public\.oauth_states \([\s\S]*?\n\);/)?.[0] ?? "";
const contentComplianceEventsTableSql =
  schemaSql.match(/create table public\.content_compliance_events \([\s\S]*?\n\);/)?.[0] ?? "";
const mediaTableSql = schemaSql.match(/create table public\.media \([\s\S]*?\n\);/)?.[0] ?? "";
const proofPagesTableSql = schemaSql.match(/create table public\.proof_pages \([\s\S]*?\n\);/)?.[0] ?? "";
const recoveryCasesTableSql =
  schemaSql.match(/create table public\.recovery_cases \([\s\S]*?\n\);/)?.[0] ?? "";
const proofPageRevocationFunctionSql =
  schemaSql.match(
    /create or replace function public\.update_proof_page_visibility_and_record_content_compliance_event\([\s\S]*?\n\$\$;/,
  )?.[0] ?? "";
const mediaOwnerConsistencyFunctionSql =
  schemaSql.match(/create or replace function public\.validate_media_owner_consistency\(\)[\s\S]*?\n\$\$;/)?.[0] ??
  "";
const recoveryCaseOwnerConsistencyFunctionSql =
  schemaSql.match(
    /create or replace function public\.validate_recovery_case_owner_consistency\(\)[\s\S]*?\n\$\$;/,
  )?.[0] ?? "";
const ownComplianceEventsPolicySql =
  schemaSql.match(
    /create policy "Users can read own compliance events" on public\.content_compliance_events for select using \([\s\S]*?\n\);/,
  )?.[0] ?? "";
const ownMediaPolicySql =
  schemaSql.match(/create policy "Users can read own media" on public\.media for select using \([\s\S]*?\n\);/)?.[0] ??
  "";

describe("Supabase schema contract", () => {
  it("requires x_account_id when usage is attached to a backup run", () => {
    expect(usageLedgerFunctionSql).toContain("returns public.api_usage_events");
    expect(usageLedgerFunctionSql).toContain("p_backup_run_id uuid");
    expect(usageLedgerFunctionSql).toContain("p_x_account_id uuid");
    expect(usageLedgerFunctionSql).toContain("api_usage_ledger_x_account_required_for_backup_run");
    expect(usageLedgerFunctionSql).toContain(
      "if p_backup_run_id is not null and p_x_account_id is null then",
    );
    expect(usageLedgerFunctionSql).toContain("and backup_runs.x_account_id = p_x_account_id");
    expect(usageLedgerFunctionSql).not.toContain(
      "p_x_account_id is null or backup_runs.x_account_id = p_x_account_id",
    );
  });

  it("defines OAuth token persistence with token references and service-role-only exposure", () => {
    expect(schemaSql).toContain(
      "create type public.x_oauth_connection_status as enum ('active', 'auth_expired', 'revoked');",
    );

    expect(xOauthConnectionsTableSql).toContain(
      "x_account_id uuid not null references public.x_accounts(id) on delete cascade",
    );
    expect(xOauthConnectionsTableSql).toContain("provider text not null default 'x'");
    expect(xOauthConnectionsTableSql).toContain("scope text[] not null default '{}'");
    expect(xOauthConnectionsTableSql).toContain("access_token_ref text not null");
    expect(xOauthConnectionsTableSql).toContain("refresh_token_ref text");
    expect(xOauthConnectionsTableSql).toContain(
      "status public.x_oauth_connection_status not null default 'active'",
    );
    expect(xOauthConnectionsTableSql).toContain("expires_at timestamptz");
    expect(xOauthConnectionsTableSql).toContain("refreshed_at timestamptz");
    expect(xOauthConnectionsTableSql).toContain("auth_expired_at timestamptz");
    expect(xOauthConnectionsTableSql).toContain("revoked_at timestamptz");
    expect(xOauthConnectionsTableSql).toContain("failure_reason text");
    expect(xOauthConnectionsTableSql).toContain("updated_at timestamptz not null default now()");
    expect(xOauthConnectionsTableSql).toContain("unique (x_account_id, provider)");

    expect(xOauthConnectionsTableSql).not.toContain("encrypted_access_token");
    expect(xOauthConnectionsTableSql).not.toContain("encrypted_refresh_token");
    expect(xOauthConnectionsTableSql).not.toContain("token_cipher_version");

    expect(schemaSql).toContain("alter table public.x_oauth_connections enable row level security;");
    expect(schemaSql).toContain(
      "revoke all on table public.x_oauth_connections from public, anon, authenticated;",
    );
    expect(schemaSql).toContain("grant all on table public.x_oauth_connections to service_role;");
    expect(schemaSql).not.toMatch(/create policy [\s\S]* on public\.x_oauth_connections/);
  });

  it("defines OAuth state persistence with PKCE verifier and service-role-only exposure", () => {
    expect(oauthStatesTableSql).toContain("state text primary key");
    expect(oauthStatesTableSql).toContain("code_verifier text not null");
    expect(oauthStatesTableSql).toContain("expires_at timestamptz not null");
    expect(oauthStatesTableSql).toContain("created_at timestamptz not null default now()");

    expect(schemaSql).toContain("create index oauth_states_expires_at_idx on public.oauth_states(expires_at);");
    expect(schemaSql).toContain("alter table public.oauth_states enable row level security;");
    expect(schemaSql).toContain(
      "revoke all on table public.oauth_states from public, anon, authenticated;",
    );
    expect(schemaSql).toContain("grant all on table public.oauth_states to service_role;");
    expect(schemaSql).not.toMatch(/create policy [\s\S]* on public\.oauth_states/);
  });

  it("defines content compliance events with ownership constraints and read policy", () => {
    expect(schemaSql).toContain(
      "create type public.content_compliance_event_type as enum ('tweet_deleted', 'tweet_protected', 'tweet_withheld', 'tweet_changed', 'user_deleted', 'user_suspended', 'user_request_delete', 'proof_page_revoked');",
    );

    expect(contentComplianceEventsTableSql).toContain(
      "x_account_id uuid not null references public.x_accounts(id) on delete cascade",
    );
    expect(contentComplianceEventsTableSql).toContain(
      "proof_page_id uuid references public.proof_pages(id) on delete set null",
    );
    expect(contentComplianceEventsTableSql).toContain(
      "event_type public.content_compliance_event_type not null",
    );
    expect(contentComplianceEventsTableSql).toContain(
      "created_at timestamptz not null default now()",
    );

    expect(schemaSql).toContain(
      "create index content_compliance_events_x_account_id_created_at_idx on public.content_compliance_events(x_account_id, created_at desc);",
    );
    expect(schemaSql).toContain(
      "alter table public.content_compliance_events enable row level security;",
    );
    expect(ownComplianceEventsPolicySql).toContain(
      "exists (select 1 from public.x_accounts where x_accounts.id = content_compliance_events.x_account_id and x_accounts.user_id = auth.uid())",
    );
  });

  it("defines media rows as account-owned backup evidence", () => {
    expect(mediaTableSql).toContain(
      "x_account_id uuid not null references public.x_accounts(id) on delete cascade",
    );
    expect(mediaTableSql).toContain(
      "backup_run_id uuid references public.backup_runs(id) on delete set null",
    );
    expect(mediaTableSql).toContain(
      "tweet_snapshot_id uuid references public.tweet_snapshots(id) on delete set null",
    );
    expect(mediaTableSql).toContain("tweet_id text not null");
    expect(mediaTableSql).toContain("media_key text not null");
    expect(mediaTableSql).toContain("type text not null");
    expect(mediaTableSql).toContain("url_or_storage_key text not null");
    expect(mediaTableSql).toContain("width integer");
    expect(mediaTableSql).toContain("height integer");
    expect(mediaTableSql).toContain("duration_ms integer");
    expect(mediaTableSql).toContain("captured_at timestamptz not null default now()");
    expect(mediaTableSql).toContain("unique (x_account_id, media_key, captured_at)");

    expect(schemaSql).toContain(
      "create index media_x_account_id_captured_at_idx on public.media(x_account_id, captured_at desc);",
    );
    expect(schemaSql).toContain("create index media_tweet_snapshot_id_idx on public.media(tweet_snapshot_id);");
    expect(schemaSql).toContain("alter table public.media enable row level security;");
    expect(ownMediaPolicySql).toContain(
      "exists (select 1 from public.x_accounts where x_accounts.id = media.x_account_id and x_accounts.user_id = auth.uid())",
    );

    expect(mediaOwnerConsistencyFunctionSql).toContain("media_backup_run_owner_mismatch");
    expect(mediaOwnerConsistencyFunctionSql).toContain("backup_runs.x_account_id = new.x_account_id");
    expect(mediaOwnerConsistencyFunctionSql).toContain("media_tweet_snapshot_owner_mismatch");
    expect(mediaOwnerConsistencyFunctionSql).toContain("tweet_snapshots.x_account_id = new.x_account_id");
    expect(schemaSql).toContain("create trigger validate_media_owner_consistency_before_write");
    expect(schemaSql).toContain("before insert or update of x_account_id, backup_run_id, tweet_snapshot_id");
    expect(schemaSql).toContain("on public.media");
  });

  it("defines recovery cases as user-owned recovery workflow state", () => {
    expect(schemaSql).toContain(
      "create type public.recovery_case_status as enum ('open', 'proof_ready', 'recovering', 'closed', 'canceled');",
    );
    expect(recoveryCasesTableSql).toContain(
      "user_id uuid not null references public.user_profiles(id) on delete cascade",
    );
    expect(recoveryCasesTableSql).toContain(
      "x_account_id uuid not null references public.x_accounts(id) on delete cascade",
    );
    expect(recoveryCasesTableSql).toContain(
      "proof_page_id uuid references public.proof_pages(id) on delete set null",
    );
    expect(recoveryCasesTableSql).toContain("status public.recovery_case_status not null default 'open'");
    expect(recoveryCasesTableSql).toContain("reason text");
    expect(recoveryCasesTableSql).toContain("opened_at timestamptz not null default now()");
    expect(recoveryCasesTableSql).toContain("closed_at timestamptz");
    expect(recoveryCasesTableSql).toContain("updated_at timestamptz not null default now()");

    expect(schemaSql).toContain(
      "create index recovery_cases_user_id_opened_at_idx on public.recovery_cases(user_id, opened_at desc);",
    );
    expect(schemaSql).toContain(
      "create index recovery_cases_x_account_id_opened_at_idx on public.recovery_cases(x_account_id, opened_at desc);",
    );
    expect(schemaSql).toContain("alter table public.recovery_cases enable row level security;");
    expect(schemaSql).toContain(
      'create policy "Users can read own recovery cases" on public.recovery_cases for select using (auth.uid() = user_id);',
    );

    expect(recoveryCaseOwnerConsistencyFunctionSql).toContain("recovery_case_x_account_owner_mismatch");
    expect(recoveryCaseOwnerConsistencyFunctionSql).toContain("x_accounts.user_id = new.user_id");
    expect(recoveryCaseOwnerConsistencyFunctionSql).toContain("recovery_case_proof_page_owner_mismatch");
    expect(recoveryCaseOwnerConsistencyFunctionSql).toContain("proof_pages.user_id = new.user_id");
    expect(recoveryCaseOwnerConsistencyFunctionSql).toContain("proof_pages.x_account_id = new.x_account_id");
    expect(schemaSql).toContain("create trigger validate_recovery_case_owner_consistency_before_write");
    expect(schemaSql).toContain("before insert or update of user_id, x_account_id, proof_page_id");
    expect(schemaSql).toContain("on public.recovery_cases");
  });

  it("defines proof pages as one persistent repository row per backup run", () => {
    expect(proofPagesTableSql).toContain(
      "user_id uuid not null references public.user_profiles(id) on delete cascade",
    );
    expect(proofPagesTableSql).toContain(
      "x_account_id uuid not null references public.x_accounts(id) on delete cascade",
    );
    expect(proofPagesTableSql).toContain(
      "backup_run_id uuid not null references public.backup_runs(id) on delete cascade",
    );
    expect(proofPagesTableSql).toContain("public_payload jsonb not null default '{}'::jsonb");
    expect(proofPagesTableSql).toContain("unique (backup_run_id)");
    expect(schemaSql).toContain("alter table public.proof_pages enable row level security;");
    expect(schemaSql).toContain(
      'create policy "Users can read own proof pages" on public.proof_pages for select using (auth.uid() = user_id);',
    );
  });

  it("defines proof page revocation as one service-role transaction function", () => {
    expect(proofPageRevocationFunctionSql).toContain("returns jsonb");
    expect(proofPageRevocationFunctionSql).toContain("for update");
    expect(proofPageRevocationFunctionSql).toContain("update public.proof_pages");
    expect(proofPageRevocationFunctionSql).toContain("insert into public.content_compliance_events");
    expect(proofPageRevocationFunctionSql).toContain("proof_page_revocation_event_mismatch");
    expect(schemaSql).toContain(
      "revoke all on function public.update_proof_page_visibility_and_record_content_compliance_event(",
    );
    expect(schemaSql).toContain(
      "grant execute on function public.update_proof_page_visibility_and_record_content_compliance_event(",
    );
  });
});
