export interface StoredXToken {
  xAccountId: string;
  provider: "x";
  scope: string[];
  accessTokenRef: string;
  refreshTokenRef?: string;
  expiresAt?: string;
  status?: "active" | "auth_expired" | "revoked";
  authExpiredAt?: string;
  revokedAt?: string;
  failureReason?: string;
}

export interface TokenRepository {
  saveXToken(token: StoredXToken): Promise<void>;
  findXToken(xAccountId: string): Promise<StoredXToken | null>;
  markAuthExpired(xAccountId: string, reason: string, checkedAt: string): Promise<void>;
  deleteXToken(xAccountId: string, revokedAt: string): Promise<void>;
}

export class InMemoryTokenRepository implements TokenRepository {
  private readonly tokens = new Map<string, StoredXToken>();

  async saveXToken(token: StoredXToken): Promise<void> {
    this.tokens.set(token.xAccountId, { ...token, status: token.status ?? "active" });
  }

  async findXToken(xAccountId: string): Promise<StoredXToken | null> {
    const token = this.tokens.get(xAccountId);

    return token ? { ...token, scope: [...token.scope] } : null;
  }

  async markAuthExpired(xAccountId: string, reason: string, checkedAt: string): Promise<void> {
    const token = this.tokens.get(xAccountId);

    if (!token) {
      return;
    }

    this.tokens.set(xAccountId, {
      ...token,
      status: "auth_expired",
      authExpiredAt: checkedAt,
      failureReason: reason,
    });
  }

  async deleteXToken(xAccountId: string, revokedAt: string): Promise<void> {
    const token = this.tokens.get(xAccountId);

    if (!token) {
      return;
    }

    this.tokens.set(xAccountId, {
      ...token,
      status: "revoked",
      accessTokenRef: "vault://revoked",
      refreshTokenRef: undefined,
      revokedAt,
    });
  }
}
