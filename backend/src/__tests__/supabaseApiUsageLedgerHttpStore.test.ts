import { describe, expect, it } from "vitest";
import { SupabaseApiUsageLedgerHttpStore } from "../repositories/supabaseApiUsageLedgerHttpStore.js";
import type { SupabaseApiUsageEventRow, SupabaseBackupRunRow } from "../repositories/supabaseApiUsageLedgerRepository.js";

describe("Supabase API usage ledger HTTP store", () => {
  it("creates backup runs through the service-role REST boundary", async () => {
    const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const store = new SupabaseApiUsageLedgerHttpStore({
      supabaseUrl: "https://xguard.supabase.co",
      serviceRoleKey: "service-role-key",
      fetchImpl: async (url, init) => {
        fetchCalls.push({ url: url.toString(), init });
        return jsonResponse([backupRunRow()]);
      },
    });

    const row = await store.insertBackupRun(backupRunRow());

    expect(row.id).toBe("backup-run-1");
    expect(fetchCalls[0]).toMatchObject({
      url: "https://xguard.supabase.co/rest/v1/backup_runs",
      init: {
        method: "POST",
        headers: {
          apikey: "service-role-key",
          Authorization: "Bearer service-role-key",
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
      },
    });
  });

  it("records API usage through the monthly-limit RPC", async () => {
    const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const store = new SupabaseApiUsageLedgerHttpStore({
      supabaseUrl: "https://xguard.supabase.co",
      serviceRoleKey: "service-role-key",
      fetchImpl: async (url, init) => {
        fetchCalls.push({ url: url.toString(), init });
        return jsonResponse(apiUsageEventRow());
      },
    });

    await store.insertApiUsageEvent(apiUsageEventRow());

    expect(fetchCalls[0]).toMatchObject({
      url: "https://xguard.supabase.co/rest/v1/rpc/record_api_usage_event_with_monthly_limit",
      init: {
        method: "POST",
        headers: {
          apikey: "service-role-key",
          Authorization: "Bearer service-role-key",
          "Content-Type": "application/json",
        },
      },
    });
    expect(JSON.parse(String(fetchCalls[0]?.init?.body))).toMatchObject({
      p_id: "event-1",
      p_user_id: "user-1",
      p_x_account_id: "x-account-1",
      p_backup_run_id: "backup-run-1",
      p_endpoint: "GET /2/users/me",
      p_method: "GET",
      p_resource_type: "user",
      p_resource_count: 1,
      p_owned_read: true,
      p_estimated_cost_usd: 0.01,
      p_rate_limit_limit: null,
      p_rate_limit_remaining: 299,
      p_rate_limit_reset_at: null,
      p_status_code: 200,
      p_occurred_at: "2026-07-07T04:00:00.000Z",
    });
  });

  it("computes monthly API cost status from profile and usage rows", async () => {
    const fetchCalls: string[] = [];
    const store = new SupabaseApiUsageLedgerHttpStore({
      supabaseUrl: "https://xguard.supabase.co",
      serviceRoleKey: "service-role-key",
      fetchImpl: async (url) => {
        fetchCalls.push(url.toString());
        if (url.toString().includes("/user_profiles")) {
          return jsonResponse([{ monthly_api_cost_limit_usd: "10.0000" }]);
        }

        return jsonResponse([{ estimated_cost_usd: "0.0100" }, { estimated_cost_usd: 0.005 }]);
      },
    });

    const status = await store.getMonthlyApiCostStatus({
      userId: "user-1",
      occurredAt: "2026-07-07T04:00:00.000Z",
    });

    expect(status).toEqual({
      monthlyApiCostLimitUsd: 10,
      estimatedCostUsdSoFar: 0.015,
    });
    expect(fetchCalls[1]).toContain("occurred_at=gte.2026-07-01T00%3A00%3A00.000Z");
    expect(fetchCalls[1]).toContain("occurred_at=lt.2026-08-01T00%3A00%3A00.000Z");
  });

  it("does not include service-role material in failed response errors", async () => {
    const store = new SupabaseApiUsageLedgerHttpStore({
      supabaseUrl: "https://xguard.supabase.co",
      serviceRoleKey: "super-secret-service-role-key",
      fetchImpl: async () => jsonResponse({ message: "super-secret-service-role-key" }, 401),
    });

    await expect(store.insertBackupRun(backupRunRow())).rejects.toThrow("insert_backup_run_failed:401");
  });

  it("aborts stalled Supabase ledger calls with a bounded timeout error", async () => {
    const store = new SupabaseApiUsageLedgerHttpStore({
      supabaseUrl: "https://xguard.supabase.co",
      serviceRoleKey: "super-secret-service-role-key",
      timeoutMs: 1,
      fetchImpl: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    });

    await expect(store.insertBackupRun(backupRunRow())).rejects.toThrow("supabase_api_usage_ledger_timeout");
  });
});

function backupRunRow(): SupabaseBackupRunRow {
  return {
    id: "backup-run-1",
    x_account_id: "x-account-1",
    status: "running",
    started_at: "2026-07-07T04:00:00.000Z",
    tweet_limit: 100,
    tweets_captured: 0,
    profiles_captured: 0,
    api_units_used: 0,
    estimated_cost_usd: 0,
    created_at: "2026-07-07T04:00:00.000Z",
  };
}

function apiUsageEventRow(): SupabaseApiUsageEventRow {
  return {
    id: "event-1",
    user_id: "user-1",
    x_account_id: "x-account-1",
    backup_run_id: "backup-run-1",
    endpoint: "GET /2/users/me",
    method: "GET",
    resource_type: "user",
    resource_count: 1,
    owned_read: true,
    estimated_cost_usd: 0.01,
    rate_limit_remaining: 299,
    status_code: 200,
    occurred_at: "2026-07-07T04:00:00.000Z",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
