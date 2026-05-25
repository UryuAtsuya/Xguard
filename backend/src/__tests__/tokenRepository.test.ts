import { describe, expect, it } from "vitest";
import { InMemoryTokenRepository } from "../repositories/tokenRepository.js";
import { SupabaseTokenRepository, type SupabaseOAuthConnectionRow, type SupabaseTokenStore } from "../repositories/supabaseTokenRepository.js";

describe("Token repository boundary", () => {
  it("stores token references and can move an account to auth_expired", async () => {
    const repository = new InMemoryTokenRepository();

    await repository.saveXToken({
      xAccountId: "x-account-1",
      provider: "x",
      scope: ["tweet.read", "users.read", "offline.access"],
      accessTokenRef: "vault://x/oauth/access/1",
      refreshTokenRef: "vault://x/oauth/refresh/1",
    });

    await repository.markAuthExpired("x-account-1", "refresh_failed", "2026-05-25T04:30:00.000Z");
    const token = await repository.findXToken("x-account-1");

    expect(token?.status).toBe("auth_expired");
    expect(token?.failureReason).toBe("refresh_failed");
    expect(token?.accessTokenRef).toBe("vault://x/oauth/access/1");
    expect(token?.accessTokenRef).not.toContain("sk-");
  });

  it("keeps revoked Supabase token rows out of read paths", async () => {
    const store = new InMemorySupabaseTokenStore();
    const repository = new SupabaseTokenRepository(store);

    await repository.saveXToken({
      xAccountId: "x-account-2",
      provider: "x",
      scope: ["tweet.read", "users.read", "offline.access"],
      accessTokenRef: "vault://x/oauth/access/2",
    });

    await repository.deleteXToken("x-account-2", "2026-05-25T04:35:00.000Z");

    expect(await repository.findXToken("x-account-2")).toBeNull();
    expect(store.rows.get("x-account-2")?.status).toBe("revoked");
  });
});

class InMemorySupabaseTokenStore implements SupabaseTokenStore {
  readonly rows = new Map<string, SupabaseOAuthConnectionRow>();

  async upsertOAuthConnection(row: SupabaseOAuthConnectionRow): Promise<void> {
    this.rows.set(row.x_account_id, row);
  }

  async findOAuthConnection(xAccountId: string): Promise<SupabaseOAuthConnectionRow | null> {
    return this.rows.get(xAccountId) ?? null;
  }

  async markOAuthConnectionAuthExpired(input: {
    xAccountId: string;
    reason: string;
    checkedAt: string;
  }): Promise<void> {
    const row = this.rows.get(input.xAccountId);

    if (!row) {
      return;
    }

    this.rows.set(input.xAccountId, {
      ...row,
      status: "auth_expired",
      auth_expired_at: input.checkedAt,
      failure_reason: input.reason,
      updated_at: input.checkedAt,
    });
  }

  async revokeOAuthConnection(input: { xAccountId: string; revokedAt: string }): Promise<void> {
    const row = this.rows.get(input.xAccountId);

    if (!row) {
      return;
    }

    this.rows.set(input.xAccountId, {
      ...row,
      status: "revoked",
      access_token_ref: "vault://revoked",
      refresh_token_ref: undefined,
      revoked_at: input.revokedAt,
      updated_at: input.revokedAt,
    });
  }
}
