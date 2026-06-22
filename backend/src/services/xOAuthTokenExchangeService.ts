import { createHash } from "node:crypto";
import type { XAccount } from "../../../shared/types.js";
import type { RuntimeConfig } from "../config/runtimeConfig.js";
import { fixtureAccount } from "../fixtures/mockXData.js";
import type { StoredXToken } from "../repositories/tokenRepository.js";
import { V0_READ_ONLY_X_SCOPES } from "../repositories/tokenRepository.js";

export interface XOAuthTokenExchangeInput {
  code: string;
  codeVerifier: string;
  callbackUrl: string;
  scopes: readonly string[];
}

export type XOAuthTokenExchangeResult =
  | {
      ok: true;
      connectedAccount: XAccount;
      token: StoredXToken;
    }
  | {
      ok: false;
      reason: "not_implemented";
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

function buildPrototypeOAuthTokenRefs(code: string, codeVerifier: string) {
  const tokenRefSeed = createHash("sha256").update(`${code}:${codeVerifier}`).digest("hex").slice(0, 24);

  return {
    accessTokenRef: `vault://x/oauth/access/prototype-${tokenRefSeed}`,
    refreshTokenRef: `vault://x/oauth/refresh/prototype-${tokenRefSeed}`,
  };
}
