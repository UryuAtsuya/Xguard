import type {
  MonthlyApiCostStatus,
  SupabaseApiUsageEventRow,
  SupabaseApiUsageLedgerStore,
  SupabaseApiUsageLedgerTransaction,
  SupabaseBackupRunRow,
  SupabaseBackupRunSummaryUpdate,
} from "./supabaseApiUsageLedgerRepository.js";

export interface SupabaseApiUsageLedgerHttpStoreOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface UserProfileCostLimitRow {
  monthly_api_cost_limit_usd: number | string;
}

interface ApiUsageCostRow {
  estimated_cost_usd: number | string;
}

export class SupabaseApiUsageLedgerHttpStore implements SupabaseApiUsageLedgerStore {
  private readonly backupRunsEndpoint: URL;
  private readonly apiUsageEventsEndpoint: URL;
  private readonly userProfilesEndpoint: URL;
  private readonly recordApiUsageEventEndpoint: URL;
  private readonly serviceRoleKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: SupabaseApiUsageLedgerHttpStoreOptions) {
    const supabaseUrl = parseSupabaseUrl(options.supabaseUrl);
    this.backupRunsEndpoint = new URL("/rest/v1/backup_runs", supabaseUrl);
    this.apiUsageEventsEndpoint = new URL("/rest/v1/api_usage_events", supabaseUrl);
    this.userProfilesEndpoint = new URL("/rest/v1/user_profiles", supabaseUrl);
    this.recordApiUsageEventEndpoint = new URL("/rest/v1/rpc/record_api_usage_event_with_monthly_limit", supabaseUrl);
    this.serviceRoleKey = requireNonEmpty("SUPABASE_SERVICE_ROLE_KEY", options.serviceRoleKey);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  async runInTransaction<T>(operation: (transaction: SupabaseApiUsageLedgerTransaction) => Promise<T>): Promise<T> {
    return operation(new SupabaseApiUsageLedgerHttpTransaction(this));
  }

  async insertBackupRun(row: SupabaseBackupRunRow): Promise<SupabaseBackupRunRow> {
    const response = await this.fetchWithTimeout(this.backupRunsEndpoint, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });

    return firstRow(await parseRowsResponse<SupabaseBackupRunRow>(response, "insert_backup_run"));
  }

  async insertApiUsageEvent(row: SupabaseApiUsageEventRow): Promise<SupabaseApiUsageEventRow> {
    const response = await this.fetchWithTimeout(this.recordApiUsageEventEndpoint, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_id: row.id,
        p_user_id: row.user_id,
        p_x_account_id: row.x_account_id ?? null,
        p_backup_run_id: row.backup_run_id ?? null,
        p_endpoint: row.endpoint,
        p_method: row.method,
        p_resource_type: row.resource_type,
        p_resource_count: row.resource_count,
        p_owned_read: row.owned_read,
        p_estimated_cost_usd: row.estimated_cost_usd,
        p_rate_limit_limit: row.rate_limit_limit ?? null,
        p_rate_limit_remaining: row.rate_limit_remaining ?? null,
        p_rate_limit_reset_at: row.rate_limit_reset_at ?? null,
        p_status_code: row.status_code ?? null,
        p_occurred_at: row.occurred_at,
      }),
    });

    return parseRowResponse<SupabaseApiUsageEventRow>(response, "record_api_usage_event_with_monthly_limit");
  }

  async listApiUsageEvents(backupRunId: string): Promise<SupabaseApiUsageEventRow[]> {
    const url = new URL(this.apiUsageEventsEndpoint);
    url.searchParams.set("backup_run_id", `eq.${backupRunId}`);
    url.searchParams.set("order", "occurred_at.asc");

    const response = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: this.headers(),
    });

    return parseRowsResponse<SupabaseApiUsageEventRow>(response, "list_api_usage_events");
  }

  async updateBackupRunSummary(input: SupabaseBackupRunSummaryUpdate): Promise<SupabaseBackupRunRow> {
    const url = new URL(this.backupRunsEndpoint);
    url.searchParams.set("id", `eq.${input.id}`);
    url.searchParams.set("select", "*");

    const response = await this.fetchWithTimeout(url, {
      method: "PATCH",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
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
      }),
    });

    return firstRow(await parseRowsResponse<SupabaseBackupRunRow>(response, "update_backup_run_summary"));
  }

  async getMonthlyApiCostStatus(input: { userId: string; occurredAt: string }): Promise<MonthlyApiCostStatus | null> {
    const profileUrl = new URL(this.userProfilesEndpoint);
    profileUrl.searchParams.set("id", `eq.${input.userId}`);
    profileUrl.searchParams.set("select", "monthly_api_cost_limit_usd");
    profileUrl.searchParams.set("limit", "1");

    const profileResponse = await this.fetchWithTimeout(profileUrl, {
      method: "GET",
      headers: this.headers(),
    });
    const [profile] = await parseRowsResponse<UserProfileCostLimitRow>(profileResponse, "get_monthly_api_cost_profile");

    if (!profile) {
      return null;
    }

    const { monthStart, nextMonthStart } = getUtcMonthBounds(input.occurredAt);
    const usageUrl = new URL(this.apiUsageEventsEndpoint);
    usageUrl.searchParams.set("user_id", `eq.${input.userId}`);
    usageUrl.searchParams.set("occurred_at", `gte.${monthStart}`);
    usageUrl.searchParams.append("occurred_at", `lt.${nextMonthStart}`);
    usageUrl.searchParams.set("select", "estimated_cost_usd");

    const usageResponse = await this.fetchWithTimeout(usageUrl, {
      method: "GET",
      headers: this.headers(),
    });
    const usageRows = await parseRowsResponse<ApiUsageCostRow>(usageResponse, "get_monthly_api_cost_events");

    return {
      monthlyApiCostLimitUsd: Number(profile.monthly_api_cost_limit_usd),
      estimatedCostUsdSoFar: roundCost(usageRows.reduce((total, row) => total + Number(row.estimated_cost_usd), 0)),
    };
  }

  private headers(): Record<string, string> {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
    };
  }

  private async fetchWithTimeout(url: URL, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error("supabase_api_usage_ledger_timeout");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

class SupabaseApiUsageLedgerHttpTransaction implements SupabaseApiUsageLedgerTransaction {
  constructor(private readonly store: SupabaseApiUsageLedgerHttpStore) {}

  async insertBackupRun(row: SupabaseBackupRunRow): Promise<SupabaseBackupRunRow> {
    return this.store.insertBackupRun(row);
  }

  async insertApiUsageEvent(row: SupabaseApiUsageEventRow): Promise<SupabaseApiUsageEventRow> {
    return this.store.insertApiUsageEvent(row);
  }

  async listApiUsageEvents(backupRunId: string): Promise<SupabaseApiUsageEventRow[]> {
    return this.store.listApiUsageEvents(backupRunId);
  }

  async updateBackupRunSummary(input: SupabaseBackupRunSummaryUpdate): Promise<SupabaseBackupRunRow> {
    return this.store.updateBackupRunSummary(input);
  }

  async getMonthlyApiCostStatus(input: { userId: string; occurredAt: string }): Promise<MonthlyApiCostStatus | null> {
    return this.store.getMonthlyApiCostStatus(input);
  }
}

async function parseRowsResponse<T>(response: Response, operation: string): Promise<T[]> {
  if (!response.ok) {
    throw new Error(`${operation}_failed:${response.status}`);
  }

  const body = (await response.json()) as unknown;

  if (!Array.isArray(body)) {
    throw new Error(`${operation}_invalid_response`);
  }

  return body as T[];
}

async function parseRowResponse<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${operation}_failed:${response.status}`);
  }

  const body = (await response.json()) as unknown;

  if (body === null || Array.isArray(body) || typeof body !== "object") {
    throw new Error(`${operation}_invalid_response`);
  }

  return body as T;
}

function firstRow<T>(rows: T[]): T {
  const [row] = rows;

  if (!row) {
    throw new Error("supabase_api_usage_ledger_empty_response");
  }

  return row;
}

function parseSupabaseUrl(value: string): string {
  const trimmed = requireNonEmpty("SUPABASE_URL", value);

  try {
    return new URL(trimmed).toString();
  } catch {
    throw new Error("invalid_runtime_env:SUPABASE_URL");
  }
}

function requireNonEmpty(fieldName: string, value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`invalid_runtime_env:${fieldName}`);
  }

  return trimmed;
}

function getUtcMonthBounds(value: string): { monthStart: string; nextMonthStart: string } {
  const occurredAt = new Date(value);

  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error("api_usage_ledger_invalid_occurred_at");
  }

  const monthStart = new Date(Date.UTC(occurredAt.getUTCFullYear(), occurredAt.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(occurredAt.getUTCFullYear(), occurredAt.getUTCMonth() + 1, 1));

  return {
    monthStart: monthStart.toISOString(),
    nextMonthStart: nextMonthStart.toISOString(),
  };
}

function roundCost(cost: number): number {
  return Math.round(cost * 10000) / 10000;
}
