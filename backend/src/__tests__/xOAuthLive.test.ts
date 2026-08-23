import { mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildLiveXAccountId } from "../clients/liveXApiClient.js";
import { EncryptedFileXOAuthTokenSecretStore } from "../repositories/xOAuthTokenSecretStore.js";
import { LiveBackupService } from "../services/liveBackupService.js";
import { LiveXOAuthTokenExchangeService } from "../services/xOAuthTokenExchangeService.js";

const encryptionKey = Buffer.alloc(32, 7).toString("base64");
const xUser = {
  id: "2244994945",
  username: "NightGuard",
  name: "Night Guard",
  profile_image_url: "https://pbs.twimg.com/profile_images/example.jpg",
  description: "静かに発信しています",
  public_metrics: {
    followers_count: 120,
    following_count: 42,
    tweet_count: 890,
    listed_count: 8,
  },
};

describe("live X OAuth boundary", () => {
  it("rejects broad token-store directories before changing permissions", () => {
    expect(() => new EncryptedFileXOAuthTokenSecretStore({ directory: "/", encryptionKey })).toThrow(
      "invalid_runtime_env:X_TOKEN_SECRET_STORE_DIR",
    );
    expect(() => new EncryptedFileXOAuthTokenSecretStore({ directory: process.cwd(), encryptionKey })).toThrow(
      "invalid_runtime_env:X_TOKEN_SECRET_STORE_DIR",
    );
  });

  it("encrypts token material at rest and returns only opaque references", async () => {
    const directory = await mkdtemp(join(tmpdir(), "xguard-token-store-"));
    const store = new EncryptedFileXOAuthTokenSecretStore({ directory, encryptionKey });

    const refs = await store.save({
      xAccountId: buildLiveXAccountId(xUser.id),
      accessToken: "access-token-material",
      refreshToken: "refresh-token-material",
      scope: ["tweet.read", "users.read", "offline.access"],
      expiresAt: "2026-08-23T08:00:00.000Z",
    });

    const files = await readdir(directory);
    expect(files).toHaveLength(1);
    const stored = await readFile(join(directory, files[0]), "utf8");
    expect(stored).not.toContain("access-token-material");
    expect(stored).not.toContain("refresh-token-material");
    expect(refs.accessTokenRef).toMatch(/^xguard-secret:\/\/x-oauth\/[a-f0-9]{64}\/access$/);
    expect(refs.refreshTokenRef).toMatch(/^xguard-secret:\/\/x-oauth\/[a-f0-9]{64}\/refresh$/);
    expect(await store.load(buildLiveXAccountId(xUser.id))).toEqual({
      accessToken: "access-token-material",
      refreshToken: "refresh-token-material",
      scope: ["tweet.read", "users.read", "offline.access"],
      expiresAt: "2026-08-23T08:00:00.000Z",
    });
  });

  it("exchanges the PKCE code, verifies the account, and stores raw tokens only behind the secret store", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const saved: unknown[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });

      if (url.endsWith("/2/oauth2/token")) {
        return jsonResponse({
          token_type: "bearer",
          expires_in: 7200,
          access_token: "live-access-token",
          refresh_token: "live-refresh-token",
          scope: "tweet.read users.read offline.access",
        });
      }

      if (url.startsWith("https://api.x.com/2/users/me")) {
        return jsonResponse({ data: xUser });
      }

      throw new Error("unexpected_test_request");
    });
    const service = new LiveXOAuthTokenExchangeService({
      clientId: "x-client-id",
      clientSecret: "x-client-secret",
      tokenSecretStore: {
        async save(input) {
          saved.push(input);
          return {
            accessTokenRef: "xguard-secret://x-oauth/ref/access",
            refreshTokenRef: "xguard-secret://x-oauth/ref/refresh",
          };
        },
        async load() {
          return null;
        },
      },
      fetchImpl,
      now: () => new Date("2026-08-23T06:00:00.000Z"),
    });

    const result = await service.exchange({
      code: "authorization-code",
      codeVerifier: "pkce-code-verifier",
      callbackUrl: "https://api.xguard.example.com/api/x/oauth/callback",
      scopes: ["tweet.read", "users.read", "offline.access"],
      expectedUsername: "nightguard",
    });

    expect(result).toEqual({
      ok: true,
      connectedAccount: expect.objectContaining({
        id: buildLiveXAccountId(xUser.id),
        xUserId: xUser.id,
        username: xUser.username,
      }),
      token: {
        xAccountId: buildLiveXAccountId(xUser.id),
        provider: "x",
        scope: ["tweet.read", "users.read", "offline.access"],
        accessTokenRef: "xguard-secret://x-oauth/ref/access",
        refreshTokenRef: "xguard-secret://x-oauth/ref/refresh",
        expiresAt: "2026-08-23T08:00:00.000Z",
      },
    });
    expect(calls[0].url).toBe("https://api.x.com/2/oauth2/token");
    expect(calls[0].init?.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from("x-client-id:x-client-secret").toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(String(calls[0].init?.body)).toContain("grant_type=authorization_code");
    expect(String(calls[0].init?.body)).toContain("code_verifier=pkce-code-verifier");
    expect(String(calls[0].init?.body)).toContain("redirect_uri=https%3A%2F%2Fapi.xguard.example.com%2Fapi%2Fx%2Foauth%2Fcallback");
    expect(saved).toEqual([
      {
        xAccountId: buildLiveXAccountId(xUser.id),
        accessToken: "live-access-token",
        refreshToken: "live-refresh-token",
        scope: ["tweet.read", "users.read", "offline.access"],
        expiresAt: "2026-08-23T08:00:00.000Z",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("live-access-token");
    expect(JSON.stringify(result)).not.toContain("live-refresh-token");
  });

  it("revokes a mismatched account token without saving it", async () => {
    const saved = vi.fn();
    const requests: string[] = [];
    const service = new LiveXOAuthTokenExchangeService({
      clientId: "x-client-id",
      clientSecret: "x-client-secret",
      tokenSecretStore: {
        save: saved,
        async load() {
          return null;
        },
      },
      fetchImpl: async (input) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith("/2/oauth2/token")) {
          return jsonResponse({
            token_type: "bearer",
            access_token: "mismatched-access-token",
            refresh_token: "mismatched-refresh-token",
            scope: "tweet.read users.read offline.access",
          });
        }
        if (url.startsWith("https://api.x.com/2/users/me")) {
          return jsonResponse({ data: xUser });
        }
        if (url.endsWith("/2/oauth2/revoke")) {
          return new Response(null, { status: 200 });
        }
        throw new Error("unexpected_test_request");
      },
    });

    await expect(service.exchange({
      code: "authorization-code",
      codeVerifier: "pkce-code-verifier",
      callbackUrl: "https://api.xguard.example.com/api/x/oauth/callback",
      scopes: ["tweet.read", "users.read", "offline.access"],
      expectedUsername: "different_user",
    })).resolves.toEqual({ ok: false, reason: "account_mismatch" });
    expect(saved).not.toHaveBeenCalled();
    expect(requests).toContain("https://api.x.com/2/oauth2/revoke");
    expect(requests.filter((url) => url.endsWith("/2/oauth2/revoke"))).toHaveLength(2);
  });

  it("rejects a token response without the refresh token required by offline.access", async () => {
    const saved = vi.fn();
    const requests: string[] = [];
    const service = new LiveXOAuthTokenExchangeService({
      clientId: "x-client-id",
      clientSecret: "x-client-secret",
      tokenSecretStore: {
        save: saved,
        async load() {
          return null;
        },
      },
      fetchImpl: async (input) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith("/2/oauth2/token")) {
          return jsonResponse({
            token_type: "bearer",
            access_token: "access-token-without-refresh",
            scope: "tweet.read users.read offline.access",
          });
        }
        if (url.endsWith("/2/oauth2/revoke")) {
          return new Response(null, { status: 200 });
        }
        throw new Error("unexpected_test_request");
      },
    });

    await expect(service.exchange({
      code: "authorization-code",
      codeVerifier: "pkce-code-verifier",
      callbackUrl: "https://api.xguard.example.com/api/x/oauth/callback",
      scopes: ["tweet.read", "users.read", "offline.access"],
      expectedUsername: "nightguard",
    })).resolves.toEqual({ ok: false, reason: "token_exchange_failed" });
    expect(saved).not.toHaveBeenCalled();
    expect(requests).toContain("https://api.x.com/2/oauth2/revoke");
  });

  it("uses the stored access token for live profile and recent-post backup", async () => {
    const xAccountId = buildLiveXAccountId(xUser.id);
    const requests: string[] = [];
    const service = new LiveBackupService({
      tokenSecretStore: {
        async save() {
          throw new Error("not_used");
        },
        async load(accountId) {
          expect(accountId).toBe(xAccountId);
          return {
            accessToken: "stored-access-token",
            refreshToken: "stored-refresh-token",
            scope: ["tweet.read", "users.read", "offline.access"],
          };
        },
      },
      fetchImpl: async (input, init) => {
        const url = String(input);
        requests.push(url);
        expect(init?.headers).toMatchObject({ Authorization: "Bearer stored-access-token" });
        if (url.startsWith("https://api.x.com/2/users/me")) {
          return jsonResponse({ data: xUser });
        }
        if (url.startsWith(`https://api.x.com/2/users/${xUser.id}/tweets`)) {
          return jsonResponse({
            data: [
              {
                id: "1900000000000000001",
                text: "保全対象の投稿です",
                created_at: "2026-08-22T21:00:00.000Z",
                public_metrics: {
                  like_count: 12,
                  retweet_count: 3,
                  reply_count: 2,
                  quote_count: 1,
                  bookmark_count: 4,
                  impression_count: 320,
                },
              },
            ],
          });
        }
        throw new Error("unexpected_test_request");
      },
    });

    const result = await service.runBackup(25, xAccountId);

    expect(result.backupRun.status).toBe("completed");
    expect(result.backupRun.tweetsCaptured).toBe(1);
    expect(result.proofPayload).toMatchObject({
      xUserId: xUser.id,
      username: xUser.username,
      representativeTweets: [
        expect.objectContaining({
          tweetId: "1900000000000000001",
          text: "保全対象の投稿です",
        }),
      ],
    });
    expect(requests).toHaveLength(2);
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
