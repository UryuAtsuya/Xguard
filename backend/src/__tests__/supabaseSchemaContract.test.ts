import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schemaSql = readFileSync(resolve(process.cwd(), "supabase/schema.sql"), "utf8");
const usageLedgerFunctionSql =
  schemaSql.match(
    /create or replace function public\.record_api_usage_event_with_monthly_limit\([\s\S]*?\n\$\$;/,
  )?.[0] ?? "";
const contentComplianceEventsTableSql =
  schemaSql.match(/create table public\.content_compliance_events \([\s\S]*?\n\);/)?.[0] ?? "";
const ownComplianceEventsPolicySql =
  schemaSql.match(
    /create policy "Users can read own compliance events" on public\.content_compliance_events for select using \([\s\S]*?\n\);/,
  )?.[0] ?? "";

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
});
