import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schemaSql = readFileSync(resolve(process.cwd(), "supabase/schema.sql"), "utf8");
const usageLedgerFunctionSql =
  schemaSql.match(
    /create or replace function public\.record_api_usage_event_with_monthly_limit\([\s\S]*?\n\$\$;/,
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
});
