import type { ApiUsageEvent, BackupRun, BackupRunStatus } from "../../../shared/types.js";

export interface StartBackupRunInput {
  xAccountId: string;
  tweetLimit: number;
  startedAt: string;
}

export interface RecordApiUsageInput {
  userId: string;
  xAccountId: string;
  backupRunId: string;
  endpoint: string;
  method?: ApiUsageEvent["method"];
  resourceType: ApiUsageEvent["resourceType"];
  resourceCount: number;
  ownedRead: boolean;
  rateLimitLimit?: number;
  rateLimitRemaining?: number;
  rateLimitResetAt?: string;
  statusCode?: number;
  occurredAt: string;
}

export interface CompleteBackupRunInput {
  backupRunId: string;
  status?: Extract<BackupRunStatus, "completed" | "partial" | "failed" | "rate_limited" | "auth_expired">;
  completedAt: string;
  tweetsCaptured: number;
  profilesCaptured: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface ApiUsageLedgerRepository {
  createBackupRun(input: StartBackupRunInput): Promise<BackupRun>;
  recordApiUsageEvent(input: ApiUsageEvent): Promise<ApiUsageEvent>;
  listApiUsageEvents(backupRunId: string): Promise<ApiUsageEvent[]>;
  updateBackupRunSummary(input: CompleteBackupRunInput & {
    apiUnitsUsed: number;
    estimatedCostUsd: number;
    rateLimitRemaining?: number;
    rateLimitResetAt?: string;
  }): Promise<BackupRun>;
}

export class ApiUsageLedgerService {
  constructor(private readonly repository: ApiUsageLedgerRepository) {}

  async startBackupRun(input: StartBackupRunInput): Promise<BackupRun> {
    return this.repository.createBackupRun(input);
  }

  async recordApiUsage(input: RecordApiUsageInput): Promise<ApiUsageEvent> {
    const event: ApiUsageEvent = {
      id: crypto.randomUUID(),
      userId: input.userId,
      xAccountId: input.xAccountId,
      backupRunId: input.backupRunId,
      endpoint: input.endpoint,
      method: input.method ?? "GET",
      resourceType: input.resourceType,
      resourceCount: input.resourceCount,
      ownedRead: input.ownedRead,
      estimatedCostUsd: estimateXApiReadCostUsd(input.resourceType, input.resourceCount),
      rateLimitLimit: input.rateLimitLimit,
      rateLimitRemaining: input.rateLimitRemaining,
      rateLimitResetAt: input.rateLimitResetAt,
      statusCode: input.statusCode,
      occurredAt: input.occurredAt,
    };

    return this.repository.recordApiUsageEvent(event);
  }

  async completeBackupRun(input: CompleteBackupRunInput): Promise<BackupRun> {
    const events = await this.repository.listApiUsageEvents(input.backupRunId);
    const latestRateLimitEvent = [...events].reverse().find((event) => event.rateLimitRemaining !== undefined);

    return this.repository.updateBackupRunSummary({
      ...input,
      apiUnitsUsed: events.reduce((total, event) => total + event.resourceCount, 0),
      estimatedCostUsd: roundCost(events.reduce((total, event) => total + event.estimatedCostUsd, 0)),
      rateLimitRemaining: latestRateLimitEvent?.rateLimitRemaining,
      rateLimitResetAt: latestRateLimitEvent?.rateLimitResetAt,
    });
  }
}

export class InMemoryApiUsageLedgerRepository implements ApiUsageLedgerRepository {
  readonly backupRuns = new Map<string, BackupRun>();
  readonly usageEvents = new Map<string, ApiUsageEvent[]>();

  async createBackupRun(input: StartBackupRunInput): Promise<BackupRun> {
    const backupRun: BackupRun = {
      id: crypto.randomUUID(),
      xAccountId: input.xAccountId,
      status: "running",
      startedAt: input.startedAt,
      tweetLimit: input.tweetLimit,
      tweetsCaptured: 0,
      profilesCaptured: 0,
      apiUnitsUsed: 0,
      estimatedCostUsd: 0,
      createdAt: input.startedAt,
    };

    this.backupRuns.set(backupRun.id, backupRun);
    this.usageEvents.set(backupRun.id, []);

    return backupRun;
  }

  async recordApiUsageEvent(input: ApiUsageEvent): Promise<ApiUsageEvent> {
    const backupRunId = input.backupRunId;

    if (backupRunId) {
      const events = this.usageEvents.get(backupRunId) ?? [];
      events.push(input);
      this.usageEvents.set(backupRunId, events);
    }

    return input;
  }

  async listApiUsageEvents(backupRunId: string): Promise<ApiUsageEvent[]> {
    return [...(this.usageEvents.get(backupRunId) ?? [])];
  }

  async updateBackupRunSummary(input: CompleteBackupRunInput & {
    apiUnitsUsed: number;
    estimatedCostUsd: number;
    rateLimitRemaining?: number;
    rateLimitResetAt?: string;
  }): Promise<BackupRun> {
    const current = this.backupRuns.get(input.backupRunId);

    if (!current) {
      throw new Error(`backup_run_not_found:${input.backupRunId}`);
    }

    const updated: BackupRun = {
      ...current,
      status: input.status ?? "completed",
      completedAt: input.completedAt,
      tweetsCaptured: input.tweetsCaptured,
      profilesCaptured: input.profilesCaptured,
      apiUnitsUsed: input.apiUnitsUsed,
      estimatedCostUsd: input.estimatedCostUsd,
      rateLimitRemaining: input.rateLimitRemaining,
      rateLimitResetAt: input.rateLimitResetAt,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    };

    this.backupRuns.set(input.backupRunId, updated);

    return updated;
  }
}

export function createInMemoryApiUsageLedgerService(): ApiUsageLedgerService {
  return new ApiUsageLedgerService(new InMemoryApiUsageLedgerRepository());
}

export function estimateXApiReadCostUsd(resourceType: ApiUsageEvent["resourceType"], resourceCount: number): number {
  const unitCost = getConservativeUnitCostUsd(resourceType);

  return roundCost(unitCost * resourceCount);
}

function getConservativeUnitCostUsd(resourceType: ApiUsageEvent["resourceType"]): number {
  switch (resourceType) {
    case "post":
      return 0.005;
    case "user":
    case "follower":
    case "following":
      return 0.01;
    case "media":
    case "usage":
    case "unknown":
      return 0;
  }
}

function roundCost(cost: number): number {
  return Math.round(cost * 10000) / 10000;
}
