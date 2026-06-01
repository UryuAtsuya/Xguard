import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schemaSql = readFileSync(join(process.cwd(), "supabase/schema.sql"), "utf8");

describe("Supabase schema contract", () => {
  it("requires x_account_id when usage is attached to a backup run", () => {
    expect(schemaSql).toContain("api_usage_ledger_x_account_required_for_backup_run");
    expect(schemaSql).toContain("if p_backup_run_id is not null and p_x_account_id is null then");
    expect(schemaSql).toContain("and backup_runs.x_account_id = p_x_account_id");
    expect(schemaSql).not.toContain("p_x_account_id is null or backup_runs.x_account_id = p_x_account_id");
  });
});
