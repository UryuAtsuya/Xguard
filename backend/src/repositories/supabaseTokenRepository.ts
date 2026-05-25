import type { StoredXToken, TokenRepository } from "./tokenRepository.js";

export interface SupabaseOAuthConnectionRow {
  x_account_id: string;
  provider: "x";
  scope: string[];
  access_token_ref: string;
  refresh_token_ref?: string;
  expires_at?: string;
  status: "active" | "auth_expired" | "revoked";
  auth_expired_at?: string;
  revoked_at?: string;
  failure_reason?: string;
  updated_at: string;
}

export interface SupabaseTokenStore {
  upsertOAuthConnection(row: SupabaseOAuthConnectionRow): Promise<void>;
  findOAuthConnection(xAccountId: string): Promise<SupabaseOAuthConnectionRow | null>;
  markOAuthConnectionAuthExpired(input: {
    xAccountId: string;
    reason: string;
    checkedAt: string;
  }): Promise<void>;
  revokeOAuthConnection(input: {
    xAccountId: string;
    revokedAt: string;
  }): Promise<void>;
}

export class SupabaseTokenRepository implements TokenRepository {
  constructor(private readonly store: SupabaseTokenStore) {}

  async saveXToken(token: StoredXToken): Promise<void> {
    await this.store.upsertOAuthConnection({
      x_account_id: token.xAccountId,
      provider: token.provider,
      scope: [...token.scope],
      access_token_ref: token.accessTokenRef,
      refresh_token_ref: token.refreshTokenRef,
      expires_at: token.expiresAt,
      status: token.status ?? "active",
      auth_expired_at: token.authExpiredAt,
      revoked_at: token.revokedAt,
      failure_reason: token.failureReason,
      updated_at: new Date().toISOString(),
    });
  }

  async findXToken(xAccountId: string): Promise<StoredXToken | null> {
    const row = await this.store.findOAuthConnection(xAccountId);

    if (!row || row.status === "revoked") {
      return null;
    }

    return {
      xAccountId: row.x_account_id,
      provider: row.provider,
      scope: [...row.scope],
      accessTokenRef: row.access_token_ref,
      refreshTokenRef: row.refresh_token_ref,
      expiresAt: row.expires_at,
      status: row.status,
      authExpiredAt: row.auth_expired_at,
      revokedAt: row.revoked_at,
      failureReason: row.failure_reason,
    };
  }

  async markAuthExpired(xAccountId: string, reason: string, checkedAt: string): Promise<void> {
    await this.store.markOAuthConnectionAuthExpired({ xAccountId, reason, checkedAt });
  }

  async deleteXToken(xAccountId: string, revokedAt: string): Promise<void> {
    await this.store.revokeOAuthConnection({ xAccountId, revokedAt });
  }
}
