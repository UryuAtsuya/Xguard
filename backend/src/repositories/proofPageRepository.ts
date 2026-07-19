import type { BackupRun, ProofPageVisibility, ProofPublicPayload } from "../../../shared/types.js";
import type {
  ContentComplianceEventRepository,
  NewContentComplianceEvent,
} from "./contentComplianceEventRepository.js";
import type { SupabaseBackupRunRow } from "./supabaseApiUsageLedgerRepository.js";
import type { SupabaseContentComplianceEventRow } from "./supabaseContentComplianceEventRepository.js";

export interface ProofPageEntry {
  userId: string;
  visibility: ProofPageVisibility;
  revokedAt: string | null;
  backupRun: BackupRun;
  proofPayload: ProofPublicPayload;
}

export interface ProofPageRepository {
  create(entry: ProofPageEntry): Promise<void>;
  findByRunId(runId: string): Promise<ProofPageEntry | null>;
  listByUser(userId: string): Promise<ProofPageEntry[]>;
  listAll(): Promise<ProofPageEntry[]>;
  updateVisibility(
    runId: string,
    visibility: ProofPageVisibility,
    revokedAt: string | null,
  ): Promise<ProofPageEntry | null>;
  updateVisibilityAndRecordComplianceEvent?(
    runId: string,
    visibility: ProofPageVisibility,
    revokedAt: string | null,
    revocationEvent: NewContentComplianceEvent,
  ): Promise<ProofPageEntry | null>;
}

export class InMemoryProofPageRepository implements ProofPageRepository {
  private readonly entries = new Map<string, ProofPageEntry>();

  async create(entry: ProofPageEntry): Promise<void> {
    this.entries.set(entry.backupRun.id, cloneProofPageEntry(entry));
  }

  async findByRunId(runId: string): Promise<ProofPageEntry | null> {
    const entry = this.entries.get(runId);
    return entry ? cloneProofPageEntry(entry) : null;
  }

  async listByUser(userId: string): Promise<ProofPageEntry[]> {
    return [...this.entries.values()]
      .filter((entry) => entry.userId === userId)
      .sort((left, right) => right.backupRun.createdAt.localeCompare(left.backupRun.createdAt))
      .map(cloneProofPageEntry);
  }

  async listAll(): Promise<ProofPageEntry[]> {
    return [...this.entries.values()]
      .sort((left, right) => right.backupRun.createdAt.localeCompare(left.backupRun.createdAt))
      .map(cloneProofPageEntry);
  }

  async updateVisibility(
    runId: string,
    visibility: ProofPageVisibility,
    revokedAt: string | null,
  ): Promise<ProofPageEntry | null> {
    const entry = this.entries.get(runId);

    if (!entry) {
      return null;
    }

    const updatedEntry = cloneProofPageEntry({
      ...entry,
      visibility,
      revokedAt,
    });
    this.entries.set(runId, updatedEntry);
    return cloneProofPageEntry(updatedEntry);
  }

}

export interface SupabaseProofPageRow {
  id: string;
  user_id: string;
  x_account_id: string;
  backup_run_id: string;
  slug: string;
  visibility: ProofPageVisibility;
  public_payload: ProofPublicPayload;
  redaction_policy_version: string;
  published_at?: string;
  revoked_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SupabaseProofPageEntryRow {
  backup_run: SupabaseBackupRunRow;
  proof_page: SupabaseProofPageRow;
}

export interface SupabaseProofPageStore {
  insertProofPage(row: {
    backup_run: SupabaseBackupRunRow;
    proof_page: Omit<SupabaseProofPageRow, "id" | "created_at" | "updated_at"> & {
      id?: string;
      created_at?: string;
      updated_at?: string;
    };
  }): Promise<SupabaseProofPageEntryRow>;
  findProofPageByRunId(runId: string): Promise<SupabaseProofPageEntryRow | null>;
  listProofPagesByUser(userId: string): Promise<SupabaseProofPageEntryRow[]>;
  listAllProofPages(): Promise<SupabaseProofPageEntryRow[]>;
  updateProofPageVisibility(input: {
    backup_run_id: string;
    visibility: ProofPageVisibility;
    revoked_at: string | null;
    updated_at: string;
  }): Promise<SupabaseProofPageEntryRow | null>;
  updateProofPageVisibilityAndRecordContentComplianceEvent(input: {
    proof_page: {
      backup_run_id: string;
      visibility: ProofPageVisibility;
      revoked_at: string | null;
      updated_at: string;
    };
    content_compliance_event: Omit<SupabaseContentComplianceEventRow, "id" | "created_at"> & {
      id?: string;
      created_at?: string;
    };
  }): Promise<SupabaseProofPageEntryRow | null>;
}

export class SupabaseProofPageRepository implements ProofPageRepository {
  constructor(private readonly store: SupabaseProofPageStore) {}

  async create(entry: ProofPageEntry): Promise<void> {
    await this.store.insertProofPage({
      backup_run: backupRunToRow(entry.backupRun),
      proof_page: {
        user_id: entry.userId,
        x_account_id: entry.backupRun.xAccountId,
        backup_run_id: entry.backupRun.id,
        slug: entry.backupRun.id,
        visibility: entry.visibility,
        public_payload: cloneProofPublicPayload(entry.proofPayload),
        redaction_policy_version: entry.proofPayload.redactionPolicyVersion,
        published_at: entry.visibility === "public" || entry.visibility === "unlisted" ? entry.backupRun.completedAt : undefined,
        revoked_at: entry.revokedAt ?? undefined,
        created_at: entry.backupRun.createdAt,
        updated_at: entry.revokedAt ?? entry.backupRun.completedAt ?? entry.backupRun.createdAt,
      },
    });
  }

  async findByRunId(runId: string): Promise<ProofPageEntry | null> {
    const row = await this.store.findProofPageByRunId(runId);
    return row ? rowToProofPageEntry(row) : null;
  }

  async listByUser(userId: string): Promise<ProofPageEntry[]> {
    const rows = await this.store.listProofPagesByUser(userId);
    return rows.map(rowToProofPageEntry);
  }

  async listAll(): Promise<ProofPageEntry[]> {
    const rows = await this.store.listAllProofPages();
    return rows.map(rowToProofPageEntry);
  }

  async updateVisibility(
    runId: string,
    visibility: ProofPageVisibility,
    revokedAt: string | null,
  ): Promise<ProofPageEntry | null> {
    const row = await this.store.updateProofPageVisibility({
      backup_run_id: runId,
      visibility,
      revoked_at: revokedAt,
      updated_at: revokedAt ?? new Date().toISOString(),
    });
    return row ? rowToProofPageEntry(row) : null;
  }

  async updateVisibilityAndRecordComplianceEvent(
    runId: string,
    visibility: ProofPageVisibility,
    revokedAt: string | null,
    revocationEvent: NewContentComplianceEvent,
  ): Promise<ProofPageEntry | null> {
    const row = await this.store.updateProofPageVisibilityAndRecordContentComplianceEvent({
      proof_page: {
        backup_run_id: runId,
        visibility,
        revoked_at: revokedAt,
        updated_at: revokedAt ?? new Date().toISOString(),
      },
      content_compliance_event: {
        id: revocationEvent.id,
        x_account_id: revocationEvent.xAccountId,
        tweet_snapshot_id: revocationEvent.tweetSnapshotId,
        proof_page_id: revocationEvent.proofPageId,
        event_type: revocationEvent.eventType,
        source: revocationEvent.source,
        details: { ...revocationEvent.details },
        resolved_at: revocationEvent.resolvedAt,
        created_at: revocationEvent.createdAt,
      },
    });
    return row ? rowToProofPageEntry(row) : null;
  }
}

function backupRunToRow(backupRun: BackupRun): SupabaseBackupRunRow {
  return {
    id: backupRun.id,
    x_account_id: backupRun.xAccountId,
    status: backupRun.status,
    started_at: backupRun.startedAt,
    completed_at: backupRun.completedAt,
    tweet_limit: backupRun.tweetLimit,
    tweets_captured: backupRun.tweetsCaptured,
    profiles_captured: backupRun.profilesCaptured,
    api_units_used: backupRun.apiUnitsUsed,
    estimated_cost_usd: backupRun.estimatedCostUsd,
    rate_limit_remaining: backupRun.rateLimitRemaining,
    rate_limit_reset_at: backupRun.rateLimitResetAt,
    error_code: backupRun.errorCode,
    error_message: backupRun.errorMessage,
    created_at: backupRun.createdAt,
  };
}

function cloneProofPageEntry(entry: ProofPageEntry): ProofPageEntry {
  return {
    ...entry,
    backupRun: { ...entry.backupRun },
    proofPayload: cloneProofPublicPayload(entry.proofPayload),
  };
}

function cloneProofPublicPayload(payload: ProofPublicPayload): ProofPublicPayload {
  return {
    ...payload,
    snapshotCounts: { ...payload.snapshotCounts },
    publicMetrics: payload.publicMetrics ? { ...payload.publicMetrics } : undefined,
    representativeTweets: payload.representativeTweets.map((tweet) => ({
      ...tweet,
      publicMetrics: tweet.publicMetrics ? { ...tweet.publicMetrics } : undefined,
    })),
  };
}

function rowToProofPageEntry(row: SupabaseProofPageEntryRow): ProofPageEntry {
  return cloneProofPageEntry({
    userId: row.proof_page.user_id,
    visibility: row.proof_page.visibility,
    revokedAt: row.proof_page.revoked_at ?? null,
    backupRun: {
      id: row.backup_run.id,
      xAccountId: row.backup_run.x_account_id,
      status: row.backup_run.status,
      startedAt: row.backup_run.started_at,
      completedAt: row.backup_run.completed_at,
      tweetLimit: row.backup_run.tweet_limit,
      tweetsCaptured: row.backup_run.tweets_captured,
      profilesCaptured: row.backup_run.profiles_captured,
      apiUnitsUsed: row.backup_run.api_units_used,
      estimatedCostUsd: Number(row.backup_run.estimated_cost_usd),
      rateLimitRemaining: row.backup_run.rate_limit_remaining,
      rateLimitResetAt: row.backup_run.rate_limit_reset_at,
      errorCode: row.backup_run.error_code,
      errorMessage: row.backup_run.error_message,
      createdAt: row.backup_run.created_at,
    },
    proofPayload: row.proof_page.public_payload,
  });
}
