import { createHash } from "node:crypto";
import type { XAccount } from "../../../shared/types.js";
import { LiveXApiClient } from "../clients/liveXApiClient.js";
import type { RuntimeConfig } from "../config/runtimeConfig.js";
import { fixtureAccount } from "../fixtures/mockXData.js";
import type { StoredXToken } from "../repositories/tokenRepository.js";
import { V0_READ_ONLY_X_SCOPES } from "../repositories/tokenRepository.js";
import type { XOAuthTokenSecretStore } from "../repositories/xOAuthTokenSecretStore.js";

export interface XOAuthTokenExchangeInput {
  code: string;
  codeVerifier: string;
  callbackUrl: string;
  scopes: readonly string[];
  expectedUsername?: string;
}

export type XOAuthTokenExchangeResult =
  | {
      ok: true;
      connectedAccount: XAccount;
      token: StoredXToken;
    }
  | {
      ok: false;
      reason:
        | "not_implemented"
        | "expected_username_missing"
        | "scope_mismatch"
        | "token_exchange_failed"
        | "x_api_failed"
        | "account_mismatch"
        | "secret_storage_failed";
    };

export interface XOAuthTokenExchangeService {
  exchange(input: XOAuthTokenExchangeInput): Promise<XOAuthTokenExchangeResult>;
}

export function createDefaultXOAuthTokenExchangeService(config: RuntimeConfig): XOAuthTokenExchangeService {
  if (config.nodeEnv === "production" && config.xOAuth.mode === "configured") {
    return new UnavailableXOAuthTokenExchangeService();
  }

  return new PrototypeXOAuthTokenExchangeService();
}

export class UnavailableXOAuthTokenExchangeService implements XOAuthTokenExchangeService {
  async exchange(): Promise<XOAuthTokenExchangeResult> {
    return { ok: false, reason: "not_implemented" };
  }
}

export class PrototypeXOAuthTokenExchangeService implements XOAuthTokenExchangeService {
  async exchange(input: XOAuthTokenExchangeInput): Promise<XOAuthTokenExchangeResult> {
    return {
      ok: true,
      connectedAccount: fixtureAccount,
      token: {
        xAccountId: fixtureAccount.id,
        provider: "x",
        scope: [...V0_READ_ONLY_X_SCOPES],
        ...buildPrototypeOAuthTokenRefs(input.code, input.codeVerifier),
      },
    };
  }
}

export class LiveXOAuthTokenExchangeService implements XOAuthTokenExchangeService {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tokenSecretStore: XOAuthTokenSecretStore;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(options: {
    clientId: string;
    clientSecret: string;
    tokenSecretStore: XOAuthTokenSecretStore;
    fetchImpl?: typeof fetch;
    now?: () => Date;
  }) {
    this.clientId = requireValue("X_CLIENT_ID", options.clientId);
    this.clientSecret = requireValue("X_CLIENT_SECRET", options.clientSecret);
    this.tokenSecretStore = options.tokenSecretStore;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async exchange(input: XOAuthTokenExchangeInput): Promise<XOAuthTokenExchangeResult> {
    const expectedUsername = normalizeUsername(input.expectedUsername);
    if (!expectedUsername) {
      return { ok: false, reason: "expected_username_missing" };
    }
    if (!hasExactV0Scopes(input.scopes)) {
      return { ok: false, reason: "scope_mismatch" };
    }

    let exchanged: LiveTokenResponse;
    try {
      exchanged = await this.requestTokens(input);
    } catch {
      return { ok: false, reason: "token_exchange_failed" };
    }

    const scopes = exchanged.scope === undefined ? [...input.scopes] : parseScope(exchanged.scope);
    if (!hasExactV0Scopes(scopes)) {
      await this.revokeTokensBestEffort(exchanged);
      return { ok: false, reason: "scope_mismatch" };
    }
    if (!exchanged.refresh_token?.trim()) {
      await this.revokeTokenBestEffort(exchanged.access_token);
      return { ok: false, reason: "token_exchange_failed" };
    }

    let connectedAccount: XAccount;
    try {
      connectedAccount = await new LiveXApiClient({
        accessToken: exchanged.access_token,
        fetchImpl: this.fetchImpl,
        now: this.now,
      }).getAuthenticatedUser();
    } catch {
      await this.revokeTokensBestEffort(exchanged);
      return { ok: false, reason: "x_api_failed" };
    }

    if (normalizeUsername(connectedAccount.username) !== expectedUsername) {
      await this.revokeTokensBestEffort(exchanged);
      return { ok: false, reason: "account_mismatch" };
    }

    const expiresAt =
      exchanged.expires_in === undefined
        ? undefined
        : new Date(this.now().getTime() + exchanged.expires_in * 1000).toISOString();

    let refs;
    try {
      refs = await this.tokenSecretStore.save({
        xAccountId: connectedAccount.id,
        accessToken: exchanged.access_token,
        refreshToken: exchanged.refresh_token,
        scope: scopes,
        expiresAt,
      });
    } catch {
      await this.revokeTokensBestEffort(exchanged);
      return { ok: false, reason: "secret_storage_failed" };
    }

    return {
      ok: true,
      connectedAccount,
      token: {
        xAccountId: connectedAccount.id,
        provider: "x",
        scope: scopes,
        accessTokenRef: refs.accessTokenRef,
        refreshTokenRef: refs.refreshTokenRef,
        expiresAt,
      },
    };
  }

  private async requestTokens(input: XOAuthTokenExchangeInput): Promise<LiveTokenResponse> {
    const response = await this.fetchImpl("https://api.x.com/2/oauth2/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        code: input.code,
        grant_type: "authorization_code",
        client_id: this.clientId,
        redirect_uri: input.callbackUrl,
        code_verifier: input.codeVerifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error("x_oauth_token_endpoint_failed");
    }

    const value = await response.json();
    return parseLiveTokenResponse(value);
  }

  private async revokeTokensBestEffort(tokens: LiveTokenResponse): Promise<void> {
    await this.revokeTokenBestEffort(tokens.access_token);
    if (tokens.refresh_token) {
      await this.revokeTokenBestEffort(tokens.refresh_token);
    }
  }

  private async revokeTokenBestEffort(token: string): Promise<void> {
    try {
      await this.fetchImpl("https://api.x.com/2/oauth2/revoke", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({ token, client_id: this.clientId }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      // Best effort only. Never include token material in errors or logs.
    }
  }
}

function buildPrototypeOAuthTokenRefs(code: string, codeVerifier: string) {
  const tokenRefSeed = createHash("sha256").update(`${code}:${codeVerifier}`).digest("hex").slice(0, 24);

  return {
    accessTokenRef: `vault://x/oauth/access/prototype-${tokenRefSeed}`,
    refreshTokenRef: `vault://x/oauth/refresh/prototype-${tokenRefSeed}`,
  };
}

interface LiveTokenResponse {
  token_type: "bearer";
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
}

function parseLiveTokenResponse(value: unknown): LiveTokenResponse {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;

  if (
    !record ||
    typeof record.token_type !== "string" ||
    record.token_type.toLowerCase() !== "bearer" ||
    typeof record.access_token !== "string" ||
    !record.access_token.trim() ||
    (record.refresh_token !== undefined && typeof record.refresh_token !== "string") ||
    (record.expires_in !== undefined &&
      (typeof record.expires_in !== "number" || !Number.isInteger(record.expires_in) || record.expires_in <= 0)) ||
    (record.scope !== undefined && typeof record.scope !== "string")
  ) {
    throw new Error("x_oauth_invalid_token_response");
  }

  return {
    token_type: "bearer",
    access_token: record.access_token,
    refresh_token: record.refresh_token as string | undefined,
    expires_in: record.expires_in as number | undefined,
    scope: record.scope as string | undefined,
  };
}

function parseScope(value: string): string[] {
  return value.split(/\s+/).map((scope) => scope.trim()).filter(Boolean);
}

function hasExactV0Scopes(scopes: readonly string[]): boolean {
  const unique = new Set(scopes);
  return (
    unique.size === V0_READ_ONLY_X_SCOPES.length &&
    V0_READ_ONLY_X_SCOPES.every((scope) => unique.has(scope))
  );
}

function normalizeUsername(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/^@/, "").toLowerCase();
  return normalized || undefined;
}

function requireValue(name: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`invalid_runtime_env:${name}`);
  }
  return trimmed;
}
