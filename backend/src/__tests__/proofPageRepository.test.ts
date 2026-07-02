import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { BackupRun, ProofPublicPayload } from "../../../shared/types.js";
import {
  SupabaseProofPageRepository,
  type SupabaseProofPageEntryRow,
  type SupabaseProofPageRow,
  type SupabaseProofPageStore,
} from "../repositories/proofPageRepository.js";
import type { SupabaseBackupRunRow } from "../repositories/supabaseApiUsageLedgerRepository.js";

describe("Proof page repository", () => {
  it("maps proof page entries to Supabase rows keyed by backup run", async () => {
    const store = new InMemorySupabaseProofPageStore();
    const repository = new SupabaseProofPageRepository(store);
    const backupRun = buildBackupRun();
    const proofPayload = buildProofPayload();

    await repository.create({
      userId: "user-1",
      visibility: "unlisted",
      revokedAt: null,
      backupRun,
      proofPayload,
    });
    proofPayload.snapshotCounts.tweets = 999;

    expect(store.rows[0]?.proof_page).toMatchObject({
      user_id: "user-1",
      x_account_id: "x-account-1",
      slug: "backup-run-1",
      visibility: "unlisted",
      public_payload: {
        snapshotCounts: { tweets: 3, profileSnapshots: 1 },
        redactionPolicyVersion: "v1",
      },
      redaction_policy_version: "v1",
    });

    await expect(repository.findByRunId("backup-run-1")).resolves.toMatchObject({
      userId: "user-1",
      visibility: "unlisted",
      revokedAt: null,
      backupRun: {
        id: "backup-run-1",
        xAccountId: "x-account-1",
        estimatedCostUsd: 0.42,
      },
      proofPayload: {
        snapshotCounts: { tweets: 3, profileSnapshots: 1 },
      },
    });
  });

  it("updates proof page visibility by backup run without leaking table names", async () => {
    const store = new InMemorySupabaseProofPageStore();
    const repository = new SupabaseProofPageRepository(store);

    await repository.create({
      userId: "user-1",
      visibility: "public",
      revokedAt: null,
      backupRun: buildBackupRun(),
      proofPayload: buildProofPayload(),
    });

    const updated = await repository.updateVisibility(
      "backup-run-1",
      "revoked",
      "2026-06-26T04:30:00.000Z",
    );

    expect(updated).toMatchObject({
      userId: "user-1",
      visibility: "revoked",
      revokedAt: "2026-06-26T04:30:00.000Z",
      backupRun: { id: "backup-run-1" },
    });
  });

  it("keeps proof page revoke visibility and compliance event persistence in one store transaction", async () => {
    const store = new InMemorySupabaseProofPageStore();
    const repository = new SupabaseProofPageRepository(store);

    await repository.create({
      userId: "user-1",
      visibility: "public",
      revokedAt: null,
      backupRun: buildBackupRun(),
      proofPayload: buildProofPayload(),
    });

    await repository.updateVisibilityAndRecordComplianceEvent(
      "backup-run-1",
      "revoked",
      "2026-06-26T04:30:00.000Z",
      {
        eventType: "proof_page_revoked",
        source: "user_request",
        xAccountId: "x-account-1",
        details: {
          runId: "backup-run-1",
          userId: "user-1",
          previousVisibility: "public",
          newVisibility: "revoked",
        },
        createdAt: "2026-06-26T04:30:00.000Z",
      },
    );

    expect(store.rows[0]?.proof_page).toMatchObject({
      backup_run_id: "backup-run-1",
      visibility: "revoked",
      revoked_at: "2026-06-26T04:30:00.000Z",
    });
    expect(store.contentComplianceEventRows).toEqual([
      expect.objectContaining({
        x_account_id: "x-account-1",
        event_type: "proof_page_revoked",
        source: "user_request",
        created_at: "2026-06-26T04:30:00.000Z",
      }),
    ]);
    expect(store.transactionCalls).toHaveLength(1);
  });

  it("rolls back proof page visibility when revoke compliance event persistence fails", async () => {
    const store = new InMemorySupabaseProofPageStore();
    const repository = new SupabaseProofPageRepository(store);

    await repository.create({
      userId: "user-1",
      visibility: "public",
      revokedAt: null,
      backupRun: buildBackupRun(),
      proofPayload: buildProofPayload(),
    });

    store.failNextContentComplianceEventInsert = true;

    await expect(
      repository.updateVisibilityAndRecordComplianceEvent(
        "backup-run-1",
        "revoked",
        "2026-06-26T04:30:00.000Z",
        {
          eventType: "proof_page_revoked",
          source: "user_request",
          xAccountId: "x-account-1",
          details: {
            runId: "backup-run-1",
            userId: "user-1",
            previousVisibility: "public",
            newVisibility: "revoked",
          },
          createdAt: "2026-06-26T04:30:00.000Z",
        },
      ),
    ).rejects.toThrow("insert_content_compliance_event_failed");

    expect(store.rows[0]?.proof_page).toMatchObject({
      visibility: "public",
      revoked_at: undefined,
    });
    expect(store.contentComplianceEventRows).toHaveLength(0);
  });
});

class InMemorySupabaseProofPageStore implements SupabaseProofPageStore {
  readonly rows: SupabaseProofPageEntryRow[] = [];
  readonly contentComplianceEventRows: Array<{
    id: string;
    x_account_id: string;
    tweet_snapshot_id?: string;
    proof_page_id?: string;
    event_type: "proof_page_revoked";
    source: "x_api" | "user_request" | "admin_review";
    details: Record<string, unknown>;
    resolved_at?: string;
    created_at: string;
  }> = [];
  readonly transactionCalls: string[] = [];
  failNextContentComplianceEventInsert = false;

  async insertProofPage(
    row: {
      backup_run: SupabaseBackupRunRow;
      proof_page: Omit<SupabaseProofPageRow, "id" | "created_at" | "updated_at"> & {
        id?: string;
        created_at?: string;
        updated_at?: string;
      };
    },
  ): Promise<SupabaseProofPageEntryRow> {
    const entry = {
      backup_run: { ...row.backup_run },
      proof_page: {
        ...row.proof_page,
        id: row.proof_page.id ?? randomUUID(),
        created_at: row.proof_page.created_at ?? "2026-06-26T04:00:00.000Z",
        updated_at: row.proof_page.updated_at ?? "2026-06-26T04:00:00.000Z",
      },
    };
    this.rows.push(cloneEntryRow(entry));
    return cloneEntryRow(entry);
  }

  async findProofPageByRunId(runId: string): Promise<SupabaseProofPageEntryRow | null> {
    const entry = this.rows.find((row) => row.proof_page.backup_run_id === runId);
    return entry ? cloneEntryRow(entry) : null;
  }

  async listProofPagesByUser(userId: string): Promise<SupabaseProofPageEntryRow[]> {
    return this.rows
      .filter((row) => row.proof_page.user_id === userId)
      .sort((left, right) => right.proof_page.created_at.localeCompare(left.proof_page.created_at))
      .map(cloneEntryRow);
  }

  async updateProofPageVisibility(input: {
    backup_run_id: string;
    visibility: SupabaseProofPageRow["visibility"];
    revoked_at: string | null;
    updated_at: string;
  }): Promise<SupabaseProofPageEntryRow | null> {
    const entry = this.rows.find((row) => row.proof_page.backup_run_id === input.backup_run_id);

    if (!entry) {
      return null;
    }

    entry.proof_page.visibility = input.visibility;
    entry.proof_page.revoked_at = input.revoked_at ?? undefined;
    entry.proof_page.updated_at = input.updated_at;
    return cloneEntryRow(entry);
  }

  async updateProofPageVisibilityAndRecordContentComplianceEvent(input: {
    proof_page: {
      backup_run_id: string;
      visibility: SupabaseProofPageRow["visibility"];
      revoked_at: string | null;
      updated_at: string;
    };
    content_compliance_event: {
      id?: string;
      x_account_id: string;
      tweet_snapshot_id?: string;
      proof_page_id?: string;
      event_type: "proof_page_revoked";
      source: "x_api" | "user_request" | "admin_review";
      details: Record<string, unknown>;
      resolved_at?: string;
      created_at?: string;
    };
  }): Promise<SupabaseProofPageEntryRow | null> {
    this.transactionCalls.push("updateProofPageVisibilityAndRecordContentComplianceEvent");
    const rowsBefore = this.rows.map(cloneEntryRow);
    const eventsBefore = this.contentComplianceEventRows.map((row) => ({ ...row, details: { ...row.details } }));

    try {
      const entry = await this.updateProofPageVisibility(input.proof_page);

      if (!entry) {
        return null;
      }

      if (this.failNextContentComplianceEventInsert) {
        this.failNextContentComplianceEventInsert = false;
        throw new Error("insert_content_compliance_event_failed");
      }

      this.contentComplianceEventRows.push({
        ...input.content_compliance_event,
        id: input.content_compliance_event.id ?? randomUUID(),
        created_at: input.content_compliance_event.created_at ?? "2026-06-26T04:00:00.000Z",
        details: { ...input.content_compliance_event.details },
      });
      return entry;
    } catch (error) {
      this.rows.splice(0, this.rows.length, ...rowsBefore);
      this.contentComplianceEventRows.splice(0, this.contentComplianceEventRows.length, ...eventsBefore);
      throw error;
    }
  }
}

function buildBackupRun(): BackupRun {
  return {
    id: "backup-run-1",
    xAccountId: "x-account-1",
    status: "completed",
    startedAt: "2026-06-26T03:55:00.000Z",
    completedAt: "2026-06-26T04:00:00.000Z",
    tweetLimit: 100,
    tweetsCaptured: 3,
    profilesCaptured: 1,
    apiUnitsUsed: 4,
    estimatedCostUsd: 0.42,
    createdAt: "2026-06-26T03:55:00.000Z",
  };
}

function buildProofPayload(): ProofPublicPayload {
  return {
    version: "v1",
    xUserId: "x-user-1",
    username: "xguard_user",
    backedUpFrom: "2026-06-26T03:55:00.000Z",
    backedUpUntil: "2026-06-26T04:00:00.000Z",
    snapshotCounts: {
      tweets: 3,
      profileSnapshots: 1,
    },
    representativeTweets: [],
    redactionPolicyVersion: "v1",
  };
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
    estimated_cost_usd: backupRun.estimatedCostUsd.toFixed(2),
    created_at: backupRun.createdAt,
  };
}

function cloneEntryRow(row: SupabaseProofPageEntryRow): SupabaseProofPageEntryRow {
  return {
    backup_run: { ...row.backup_run },
    proof_page: {
      ...row.proof_page,
      public_payload: {
        ...row.proof_page.public_payload,
        snapshotCounts: { ...row.proof_page.public_payload.snapshotCounts },
        publicMetrics: row.proof_page.public_payload.publicMetrics
          ? { ...row.proof_page.public_payload.publicMetrics }
          : undefined,
        representativeTweets: row.proof_page.public_payload.representativeTweets.map((tweet) => ({
          ...tweet,
          publicMetrics: tweet.publicMetrics ? { ...tweet.publicMetrics } : undefined,
        })),
      },
    },
  };
}
