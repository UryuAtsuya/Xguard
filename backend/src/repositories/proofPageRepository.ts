import type { BackupRun, ProofPageVisibility, ProofPublicPayload } from "../../../shared/types.js";

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
  updateVisibility(
    runId: string,
    visibility: ProofPageVisibility,
    revokedAt: string | null,
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

function cloneProofPageEntry(entry: ProofPageEntry): ProofPageEntry {
  return {
    ...entry,
    backupRun: { ...entry.backupRun },
    proofPayload: {
      ...entry.proofPayload,
      snapshotCounts: { ...entry.proofPayload.snapshotCounts },
      publicMetrics: entry.proofPayload.publicMetrics ? { ...entry.proofPayload.publicMetrics } : undefined,
      representativeTweets: entry.proofPayload.representativeTweets.map((tweet) => ({
        ...tweet,
        publicMetrics: tweet.publicMetrics ? { ...tweet.publicMetrics } : undefined,
      })),
    },
  };
}
