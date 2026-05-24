export interface StoredXToken {
  xAccountId: string;
  provider: "x";
  scope: string[];
  accessTokenRef: string;
  refreshTokenRef?: string;
  expiresAt?: string;
}

export interface TokenRepository {
  saveXToken(token: StoredXToken): Promise<void>;
  findXToken(xAccountId: string): Promise<StoredXToken | null>;
}

export class InMemoryTokenRepository implements TokenRepository {
  private readonly tokens = new Map<string, StoredXToken>();

  async saveXToken(token: StoredXToken): Promise<void> {
    this.tokens.set(token.xAccountId, token);
  }

  async findXToken(xAccountId: string): Promise<StoredXToken | null> {
    return this.tokens.get(xAccountId) ?? null;
  }
}
