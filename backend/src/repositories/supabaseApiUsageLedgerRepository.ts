import type { ApiUsageEvent, BackupRun } from "../../../shared/types.js";
import type {
  ApiUsageLedgerRepository,
  CompleteBackupRunInput,
  StartBackupRunInput,
} from "../services/apiUsageLedger.js";

type SupabaseNumeric = number | string;

export interface SupabaseBackupRunRow {
  id: string;
  x_account_id: string;
  status: BackupRun["status"];
  started_at?: string;
  completed_at?: string;
  tweet_limit: number;
  tweets_captured: number;
  profiles_captured: number;
  api_units_used: number;
  estimated_cost_usd: SupabaseNumeric;
  rate_limit_remaining?: number;
  rate_limit_reset_at?: string;
  error_code?: string;
  error_message?: string;
  created_at: string;
}

export interface SupabaseApiUsageEventRow {
  id: string;
  user_id: string;
  x_account_id?: string;
  backup_run_id?: string;
  endpoint: string;
  method: ApiUsageEvent["method"];
  resource_type: ApiUsageEvent["resourceType"];
  resource_count: number;
  owned_read: boolean;
  estimated_cost_usd: SupabaseNumeric;
  rate_limit_limit?: number;
  rate_limit_remaining?: number;
  rate_limit_reset_at?: string;
  status_code?: number;
  occurred_at: string;
}

export interface SupabaseBackupRunSummaryUpdate {
  id: string;
  status: BackupRun["status"];
  completed_at: string;
  tweets_captured: number;
  profiles_captured: number;
  api_units_used: number;
  estimated_cost_usd: number;
  rate_limit_remaining?: number;
  rate_limit_reset_at?: string;
  error_code?: string;
  error_message?: string;
}

export interface MonthlyApiCostStatus {
  monthlyApiCostLimitUsd: number;
  estimatedCostUsdSoFar: number;
}

export interface SupabaseApiUsageLedgerTransaction {
  insertBackupRun(row: SupabaseBackupRunRow): Promise<SupabaseBackupRunRow>;
  insertApiUsageEvent(row: SupabaseApiUsageEventRow): Promise<SupabaseApiUsageEventRow>;
  listApiUsageEvents(backupRunId: string): Promise<SupabaseApiUsageEventRow[]>;
  updateBackupRunSummary(input: SupabaseBackupRunSummaryUpdate): Promise<SupabaseBackupRunRow>;
  getMonthlyApiCostStatus(input: {
    userId: string;
    occurredAt: string;
  }): Promise<MonthlyApiCostStatus | null>;
}

export interface SupabaseApiUsageLedgerStore {
  runInTransaction<T>(operation: (transaction: SupabaseApiUsageLedgerTransaction) => Promise<T>): Promise<T>;
}

export class SupabaseApiUsageLedgerRepository implements ApiUsageLedgerRepository {
  constructor(private readonly store: SupabaseApiUsageLedgerStore) {}

  async createBackupRun(input: StartBackupRunInput): Promise<BackupRun> {
    return this.store.runInTransaction(async (transaction) => {
      const row = await transaction.insertBackupRun({
        id: crypto.randomUUID(),
        x_account_id: input.xAccountId,
        status: "running",
        started_at: input.startedAt,
        tweet_limit: input.tweetLimit,
        tweets_captured: 0,
        profiles_captured: 0,
        api_units_used: 0,
        estimated_cost_usd: 0,
        created_at: input.startedAt,
      });

      return toBackupRun(row);
    });
  }

  async recordApiUsageEvent(input: ApiUsageEvent): Promise<ApiUsageEvent> {
    return this.store.runInTransaction(async (transaction) => {
      const monthlyCost = await transaction.getMonthlyApiCostStatus({
        userId: input.userId,
        occurredAt: input.occurredAt,
      });

      if (!monthlyCost) {
        throw new Error(`api_usage_ledger_user_profile_not_found:${input.userId}`);
      }

      const projectedCostUsd = roundCost(monthlyCost.estimatedCostUsdSoFar + input.estimatedCostUsd);

      if (projectedCostUsd > monthlyCost.monthlyApiCostLimitUsd) {
        throw new Error(`api_usage_ledger_monthly_cost_limit_exceeded:${input.userId}`);
      }

      const row = await transaction.insertApiUsageEvent(toApiUsageEventRow(input));

      return toApiUsageEvent(row);
    });
  }

  async listApiUsageEvents(backupRunId: string): Promise<ApiUsageEvent[]> {
    return this.store.runInTransaction(async (transaction) => {
      const rows = await transaction.listApiUsageEvents(backupRunId);

      return rows.map(toApiUsageEvent);
    });
  }

  async updateBackupRunSummary(input: CompleteBackupRunInput & {
    apiUnitsUsed: number;
    estimatedCostUsd: number;
    rateLimitRemaining?: number;
    rateLimitResetAt?: string;
  }): Promise<BackupRun> {
    return this.store.runInTransaction(async (transaction) => {
      const row = await transaction.updateBackupRunSummary({
        id: input.backupRunId,
        status: input.status ?? "completed",
        completed_at: input.completedAt,
        tweets_captured: input.tweetsCaptured,
        profiles_captured: input.profilesCaptured,
        api_units_used: input.apiUnitsUsed,
        estimated_cost_usd: input.estimatedCostUsd,
        rate_limit_remaining: input.rateLimitRemaining,
        rate_limit_reset_at: input.rateLimitResetAt,
        error_code: input.errorCode,
        error_message: input.errorMessage,
      });

      return toBackupRun(row);
    });
  }
}

function toBackupRun(row: SupabaseBackupRunRow): BackupRun {
  return {
    id: row.id,
    xAccountId: row.x_account_id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    tweetLimit: row.tweet_limit,
    tweetsCaptured: row.tweets_captured,
    profilesCaptured: row.profiles_captured,
    apiUnitsUsed: row.api_units_used,
    estimatedCostUsd: Number(row.estimated_cost_usd),
    rateLimitRemaining: row.rate_limit_remaining,
    rateLimitResetAt: row.rate_limit_reset_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

function toApiUsageEvent(row: SupabaseApiUsageEventRow): ApiUsageEvent {
  return {
    id: row.id,
    userId: row.user_id,
    xAccountId: row.x_account_id,
    backupRunId: row.backup_run_id,
    endpoint: row.endpoint,
    method: row.method,
    resourceType: row.resource_type,
    resourceCount: row.resource_count,
    ownedRead: row.owned_read,
    estimatedCostUsd: Number(row.estimated_cost_usd),
    rateLimitLimit: row.rate_limit_limit,
    rateLimitRemaining: row.rate_limit_remaining,
    rateLimitResetAt: row.rate_limit_reset_at,
    statusCode: row.status_code,
    occurredAt: row.occurred_at,
  };
}

function toApiUsageEventRow(event: ApiUsageEvent): SupabaseApiUsageEventRow {
  return {
    id: event.id,
    user_id: event.userId,
    x_account_id: event.xAccountId,
    backup_run_id: event.backupRunId,
    endpoint: event.endpoint,
    method: event.method,
    resource_type: event.resourceType,
    resource_count: event.resourceCount,
    owned_read: event.ownedRead,
    estimated_cost_usd: event.estimatedCostUsd,
    rate_limit_limit: event.rateLimitLimit,
    rate_limit_remaining: event.rateLimitRemaining,
    rate_limit_reset_at: event.rateLimitResetAt,
    status_code: event.statusCode,
    occurred_at: event.occurredAt,
  };
}

function roundCost(cost: number): number {
  return Math.round(cost * 10000) / 10000;
}
