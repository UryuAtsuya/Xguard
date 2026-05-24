import type { BackupRun, ProofPublicPayload } from "../../../shared/types.js";
import type { XApiClient } from "../clients/xApiClient.js";
import { buildProofPublicPayload } from "./proofDtoBuilder.js";

export interface BackupRunResult {
  backupRun: BackupRun;
  proofPayload: ProofPublicPayload;
}

export class MockBackupService {
  constructor(private readonly xApiClient: XApiClient) {}

  async runBackup(tweetLimit: number): Promise<BackupRunResult> {
    const startedAt = new Date().toISOString();
    const account = await this.xApiClient.getAuthenticatedUser();
    const [profileSnapshot, tweetSnapshots] = await Promise.all([
      this.xApiClient.getProfileSnapshot(account.id),
      this.xApiClient.getRecentTweets(account.id, tweetLimit),
    ]);
    const completedAt = new Date().toISOString();

    const backupRun: BackupRun = {
      id: crypto.randomUUID(),
      xAccountId: account.id,
      status: "completed",
      startedAt,
      completedAt,
      tweetLimit,
      tweetsCaptured: tweetSnapshots.length,
      profilesCaptured: 1,
      apiUnitsUsed: 2,
      estimatedCostUsd: 0,
      rateLimitRemaining: 299,
      createdAt: startedAt,
    };

    return {
      backupRun,
      proofPayload: buildProofPublicPayload({
        account,
        profileSnapshots: [profileSnapshot],
        tweetSnapshots,
      }),
    };
  }
}
