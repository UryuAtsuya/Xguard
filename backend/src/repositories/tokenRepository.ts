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

export const V0_READ_ONLY_X_SCOPES = ["tweet.read", "users.read", "offline.access"] as const;

const READ_ONLY_X_SCOPE_SET = new Set<string>(V0_READ_ONLY_X_SCOPES);

export function assertReadOnlyXScopes(scopes: readonly string[]): void {
  const disallowedScopes = scopes.filter((scope) => !READ_ONLY_X_SCOPE_SET.has(scope));

  if (disallowedScopes.length > 0) {
    throw new Error(`unsupported_x_scope:${disallowedScopes.join(",")}`);
  }
}

export class InMemoryTokenRepository implements TokenRepository {
  private readonly tokens = new Map<string, StoredXToken>();

  async saveXToken(token: StoredXToken): Promise<void> {
    assertReadOnlyXScopes(token.scope);
    this.tokens.set(token.xAccountId, { ...token, status: token.status ?? "active" });
  }

  async findXToken(xAccountId: string): Promise<StoredXToken | null> {
    const token = this.tokens.get(xAccountId);

    if (token) {
      assertReadOnlyXScopes(token.scope);
    }

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
