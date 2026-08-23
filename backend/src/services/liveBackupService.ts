import { LiveXApiClient } from "../clients/liveXApiClient.js";
import { V0_READ_ONLY_X_SCOPES } from "../repositories/tokenRepository.js";
import type { XOAuthTokenSecretStore } from "../repositories/xOAuthTokenSecretStore.js";
import { createInMemoryApiUsageLedgerService, type ApiUsageLedgerService } from "./apiUsageLedger.js";
import { MockBackupService, type BackupRunResult } from "./mockBackupService.js";

export class LiveBackupService {
  private readonly tokenSecretStore: XOAuthTokenSecretStore;
  private readonly fetchImpl?: typeof fetch;
  private readonly now?: () => Date;
  private readonly usageLedger: ApiUsageLedgerService;

  constructor(options: {
    tokenSecretStore: XOAuthTokenSecretStore;
    fetchImpl?: typeof fetch;
    now?: () => Date;
    usageLedger?: ApiUsageLedgerService;
  }) {
    this.tokenSecretStore = options.tokenSecretStore;
    this.fetchImpl = options.fetchImpl;
    this.now = options.now;
    this.usageLedger = options.usageLedger ?? createInMemoryApiUsageLedgerService();
  }

  async runBackup(tweetLimit: number, xAccountId?: string): Promise<BackupRunResult> {
    if (!xAccountId) {
      throw new Error("live_backup_x_account_required");
    }

    const secret = await this.tokenSecretStore.load(xAccountId);
    if (!secret) {
      throw new Error("live_backup_token_not_found");
    }
    if (!V0_READ_ONLY_X_SCOPES.every((scope) => secret.scope.includes(scope))) {
      throw new Error("live_backup_required_scope_missing");
    }

    const client = new LiveXApiClient({
      accessToken: secret.accessToken,
      fetchImpl: this.fetchImpl,
      now: this.now,
    });
    return new MockBackupService(client, this.usageLedger).runBackup(tweetLimit);
  }
}
