import type { BackupRun, ProofPageVisibility, ProofPublicPayload } from "../../../shared/types.js";

export interface BackupProofEntry {
  userId: string;
  visibility: ProofPageVisibility;
  revokedAt: string | null;
  backupRun: BackupRun;
  proofPayload: ProofPublicPayload;
}

export interface BackupProofRepository {
  saveBackupProof(entry: BackupProofEntry): Promise<void>;
  findBackupProof(runId: string): Promise<BackupProofEntry | null>;
}

export class InMemoryBackupProofRepository implements BackupProofRepository {
  readonly entries = new Map<string, BackupProofEntry>();

  async saveBackupProof(entry: BackupProofEntry): Promise<void> {
    this.entries.set(entry.backupRun.id, entry);
  }

  async findBackupProof(runId: string): Promise<BackupProofEntry | null> {
    return this.entries.get(runId) ?? null;
  }
}
