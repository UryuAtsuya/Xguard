import type { BackupRun, ProofPublicPayload } from "../../../shared/types.js";
import type { XApiClient } from "../clients/xApiClient.js";
import { createInMemoryApiUsageLedgerService, type ApiUsageLedgerService } from "./apiUsageLedger.js";
import { buildProofPublicPayload } from "./proofDtoBuilder.js";

export interface BackupRunResult {
  backupRun: BackupRun;
  proofPayload: ProofPublicPayload;
}

export class MockBackupService {
  constructor(
    private readonly xApiClient: XApiClient,
    private readonly usageLedger: ApiUsageLedgerService = createInMemoryApiUsageLedgerService(),
  ) {}

  async runBackup(tweetLimit: number): Promise<BackupRunResult> {
    const startedAt = new Date().toISOString();
    const account = await this.xApiClient.getAuthenticatedUser();
    const backupRun = await this.usageLedger.startBackupRun({
      xAccountId: account.id,
      tweetLimit,
      startedAt,
    });
    const [profileSnapshot, tweetSnapshots] = await Promise.all([
      this.xApiClient.getProfileSnapshot(account.id),
      this.xApiClient.getRecentTweets(account.id, tweetLimit),
    ]);
    const completedAt = new Date().toISOString();

    await this.usageLedger.recordApiUsage({
      userId: account.userId,
      xAccountId: account.id,
      backupRunId: backupRun.id,
      endpoint: "GET /2/users/me",
      resourceType: "user",
      resourceCount: 1,
      ownedRead: true,
      rateLimitLimit: 300,
      rateLimitRemaining: 299,
      statusCode: 200,
      occurredAt: completedAt,
    });
    await this.usageLedger.recordApiUsage({
      userId: account.userId,
      xAccountId: account.id,
      backupRunId: backupRun.id,
      endpoint: "GET /2/users/:id/tweets",
      resourceType: "post",
      resourceCount: tweetSnapshots.length,
      ownedRead: true,
      rateLimitLimit: 1_500,
      rateLimitRemaining: 1_499,
      statusCode: 200,
      occurredAt: completedAt,
    });
    const completedBackupRun: BackupRun = await this.usageLedger.completeBackupRun({
      backupRunId: backupRun.id,
      completedAt,
      tweetsCaptured: tweetSnapshots.length,
      profilesCaptured: 1,
    });

    return {
      backupRun: completedBackupRun,
      proofPayload: buildProofPublicPayload({
        account,
        profileSnapshots: [profileSnapshot],
        tweetSnapshots,
      }),
    };
  }
}
