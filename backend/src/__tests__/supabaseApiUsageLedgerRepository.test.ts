import { describe, expect, it } from "vitest";
import type {
  MonthlyApiCostStatus,
  SupabaseApiUsageEventRow,
  SupabaseApiUsageLedgerStore,
  SupabaseApiUsageLedgerTransaction,
  SupabaseBackupRunSummaryUpdate,
  SupabaseBackupRunRow,
} from "../repositories/supabaseApiUsageLedgerRepository.js";
import { SupabaseApiUsageLedgerRepository } from "../repositories/supabaseApiUsageLedgerRepository.js";
import { ApiUsageLedgerService } from "../services/apiUsageLedger.js";

describe("Supabase API usage ledger repository", () => {
  it("creates backup runs, records usage events, and rolls up summaries through the store boundary", async () => {
    const store = new InMemorySupabaseApiUsageLedgerStore();
    store.monthlyCosts.set("user-1", { monthlyApiCostLimitUsd: 0.05, estimatedCostUsdSoFar: 0 });
    const ledger = new ApiUsageLedgerService(new SupabaseApiUsageLedgerRepository(store));

    const backupRun = await ledger.startBackupRun({
      xAccountId: "x-account-1",
      tweetLimit: 2,
      startedAt: "2026-05-28T04:30:00.000Z",
    });

    await ledger.recordApiUsage({
      userId: "user-1",
      xAccountId: "x-account-1",
      backupRunId: backupRun.id,
      endpoint: "GET /2/users/me",
      resourceType: "user",
      resourceCount: 1,
      ownedRead: true,
      statusCode: 200,
      occurredAt: "2026-05-28T04:30:01.000Z",
    });
    await ledger.recordApiUsage({
      userId: "user-1",
      xAccountId: "x-account-1",
      backupRunId: backupRun.id,
      endpoint: "GET /2/users/:id/tweets",
      resourceType: "post",
      resourceCount: 2,
      ownedRead: true,
      rateLimitRemaining: 1499,
      rateLimitResetAt: "2026-05-28T04:45:00.000Z",
      statusCode: 200,
      occurredAt: "2026-05-28T04:30:02.000Z",
    });

    const completed = await ledger.completeBackupRun({
      backupRunId: backupRun.id,
      completedAt: "2026-05-28T04:30:03.000Z",
      tweetsCaptured: 2,
      profilesCaptured: 1,
    });

    expect(completed).toMatchObject({
      status: "completed",
      apiUnitsUsed: 3,
      estimatedCostUsd: 0.02,
      rateLimitRemaining: 1499,
      rateLimitResetAt: "2026-05-28T04:45:00.000Z",
    });
    expect(store.usageEvents).toHaveLength(2);
    expect(store.backupRuns.get(backupRun.id)?.estimated_cost_usd).toBe(0.02);
  });

  it("maps Supabase numeric estimated costs returned as strings", async () => {
    const store = new InMemorySupabaseApiUsageLedgerStore();
    store.returnEstimatedCostsAsStrings = true;
    store.monthlyCosts.set("user-1", { monthlyApiCostLimitUsd: 0.05, estimatedCostUsdSoFar: 0 });
    const ledger = new ApiUsageLedgerService(new SupabaseApiUsageLedgerRepository(store));

    const backupRun = await ledger.startBackupRun({
      xAccountId: "x-account-1",
      tweetLimit: 2,
      startedAt: "2026-05-29T04:30:00.000Z",
    });
    const event = await ledger.recordApiUsage({
      userId: "user-1",
      xAccountId: "x-account-1",
      backupRunId: backupRun.id,
      endpoint: "GET /2/users/:id/tweets",
      resourceType: "post",
      resourceCount: 2,
      ownedRead: true,
      occurredAt: "2026-05-29T04:30:01.000Z",
    });

    const completed = await ledger.completeBackupRun({
      backupRunId: backupRun.id,
      completedAt: "2026-05-29T04:30:02.000Z",
      tweetsCaptured: 2,
      profilesCaptured: 0,
    });

    expect(event.estimatedCostUsd).toBe(0.01);
    expect(typeof event.estimatedCostUsd).toBe("number");
    expect(completed.estimatedCostUsd).toBe(0.01);
    expect(typeof completed.estimatedCostUsd).toBe("number");
  });

  it("rejects usage events before crossing the user's monthly API cost limit", async () => {
    const store = new InMemorySupabaseApiUsageLedgerStore();
    store.monthlyCosts.set("user-1", { monthlyApiCostLimitUsd: 0.015, estimatedCostUsdSoFar: 0.01 });
    const ledger = new ApiUsageLedgerService(new SupabaseApiUsageLedgerRepository(store));
    const backupRun = await ledger.startBackupRun({
      xAccountId: "x-account-1",
      tweetLimit: 1,
      startedAt: "2026-05-28T04:30:00.000Z",
    });

    await expect(
      ledger.recordApiUsage({
        userId: "user-1",
        xAccountId: "x-account-1",
        backupRunId: backupRun.id,
        endpoint: "GET /2/users/:id/tweets",
        resourceType: "post",
        resourceCount: 2,
        ownedRead: true,
        occurredAt: "2026-05-28T04:30:01.000Z",
      }),
    ).rejects.toThrow("api_usage_ledger_monthly_cost_limit_exceeded:user-1");

    expect(store.usageEvents).toHaveLength(0);
  });

  it("rolls back transaction changes when a store write fails", async () => {
    const store = new InMemorySupabaseApiUsageLedgerStore();
    store.monthlyCosts.set("user-1", { monthlyApiCostLimitUsd: 1, estimatedCostUsdSoFar: 0 });
    store.failNextUsageInsert = true;
    const ledger = new ApiUsageLedgerService(new SupabaseApiUsageLedgerRepository(store));
    const backupRun = await ledger.startBackupRun({
      xAccountId: "x-account-1",
      tweetLimit: 1,
      startedAt: "2026-05-28T04:30:00.000Z",
    });

    await expect(
      ledger.recordApiUsage({
        userId: "user-1",
        xAccountId: "x-account-1",
        backupRunId: backupRun.id,
        endpoint: "GET /2/users/me",
        resourceType: "user",
        resourceCount: 1,
        ownedRead: true,
        occurredAt: "2026-05-28T04:30:01.000Z",
      }),
    ).rejects.toThrow("supabase_usage_insert_failed");

    expect(store.usageEvents).toHaveLength(0);
  });
});

class InMemorySupabaseApiUsageLedgerStore implements SupabaseApiUsageLedgerStore {
  readonly backupRuns = new Map<string, SupabaseBackupRunRow>();
  readonly usageEvents: SupabaseApiUsageEventRow[] = [];
  readonly monthlyCosts = new Map<string, MonthlyApiCostStatus>();
  failNextUsageInsert = false;
  returnEstimatedCostsAsStrings = false;

  async runInTransaction<T>(operation: (transaction: SupabaseApiUsageLedgerTransaction) => Promise<T>): Promise<T> {
    const backupRuns = new Map(this.backupRuns);
    const usageEvents = [...this.usageEvents];
    const transaction = new InMemorySupabaseApiUsageLedgerTransaction(this, backupRuns, usageEvents);
    const result = await operation(transaction);

    this.backupRuns.clear();
    backupRuns.forEach((row, id) => this.backupRuns.set(id, row));
    this.usageEvents.splice(0, this.usageEvents.length, ...usageEvents);

    return result;
  }
}

class InMemorySupabaseApiUsageLedgerTransaction implements SupabaseApiUsageLedgerTransaction {
  constructor(
    private readonly parent: InMemorySupabaseApiUsageLedgerStore,
    private readonly backupRuns: Map<string, SupabaseBackupRunRow>,
    private readonly usageEvents: SupabaseApiUsageEventRow[],
  ) {}

  async insertBackupRun(row: SupabaseBackupRunRow): Promise<SupabaseBackupRunRow> {
    this.backupRuns.set(row.id, row);
    return this.toReturnedBackupRunRow(row);
  }

  async insertApiUsageEvent(row: SupabaseApiUsageEventRow): Promise<SupabaseApiUsageEventRow> {
    if (this.parent.failNextUsageInsert) {
      this.parent.failNextUsageInsert = false;
      throw new Error("supabase_usage_insert_failed");
    }

    this.usageEvents.push(row);
    return this.toReturnedApiUsageEventRow(row);
  }

  async listApiUsageEvents(backupRunId: string): Promise<SupabaseApiUsageEventRow[]> {
    return this.usageEvents
      .filter((event) => event.backup_run_id === backupRunId)
      .map((event) => this.toReturnedApiUsageEventRow(event));
  }

  async updateBackupRunSummary(input: SupabaseBackupRunSummaryUpdate): Promise<SupabaseBackupRunRow> {
    const current = this.backupRuns.get(input.id);

    if (!current) {
      throw new Error(`backup_run_not_found:${input.id}`);
    }

    const updated: SupabaseBackupRunRow = {
      ...current,
      status: input.status,
      completed_at: input.completed_at,
      tweets_captured: input.tweets_captured,
      profiles_captured: input.profiles_captured,
      api_units_used: input.api_units_used,
      estimated_cost_usd: input.estimated_cost_usd,
      rate_limit_remaining: input.rate_limit_remaining,
      rate_limit_reset_at: input.rate_limit_reset_at,
      error_code: input.error_code,
      error_message: input.error_message,
    };

    this.backupRuns.set(input.id, updated);

    return this.toReturnedBackupRunRow(updated);
  }

  async getMonthlyApiCostStatus(input: { userId: string; occurredAt: string }): Promise<MonthlyApiCostStatus | null> {
    const base = this.parent.monthlyCosts.get(input.userId);

    if (!base) {
      return null;
    }

    return {
      monthlyApiCostLimitUsd: base.monthlyApiCostLimitUsd,
      estimatedCostUsdSoFar: base.estimatedCostUsdSoFar + this.getMonthlyUsageCost(input.userId, input.occurredAt),
    };
  }

  private getMonthlyUsageCost(userId: string, occurredAt: string): number {
    const month = occurredAt.slice(0, 7);

    return this.usageEvents
      .filter((event) => event.user_id === userId && event.occurred_at.startsWith(month))
      .reduce((total, event) => total + Number(event.estimated_cost_usd), 0);
  }

  private toReturnedBackupRunRow(row: SupabaseBackupRunRow): SupabaseBackupRunRow {
    if (!this.parent.returnEstimatedCostsAsStrings) {
      return row;
    }

    return { ...row, estimated_cost_usd: Number(row.estimated_cost_usd).toFixed(4) };
  }

  private toReturnedApiUsageEventRow(row: SupabaseApiUsageEventRow): SupabaseApiUsageEventRow {
    if (!this.parent.returnEstimatedCostsAsStrings) {
      return row;
    }

    return { ...row, estimated_cost_usd: Number(row.estimated_cost_usd).toFixed(4) };
  }
}
