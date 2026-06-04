import cors, { type CorsOptions } from "cors";
import { createHash, timingSafeEqual } from "node:crypto";
import express from "express";
import { z } from "zod";
import { MockXApiClient } from "./clients/xApiClient.js";
import { createRuntimeConfig, type RuntimeConfig } from "./config/runtimeConfig.js";
import { fixtureAccount, fixtureProfile, fixtureTweets } from "./fixtures/mockXData.js";
import { InMemoryTokenRepository, V0_READ_ONLY_X_SCOPES } from "./repositories/tokenRepository.js";
import { createInMemoryApiUsageLedgerService } from "./services/apiUsageLedger.js";
import { MockBackupService } from "./services/mockBackupService.js";

export const V0_READ_ONLY_OAUTH_SCOPES = V0_READ_ONLY_X_SCOPES;

export interface OAuthStatusResponse {
  exposure: RuntimeConfig["oauthStatusExposure"];
  mode: RuntimeConfig["xOAuth"]["mode"];
  callbackUrl: string;
  scopes: string[];
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  writesEnabled: false;
  missingEnv: string[];
}

export function buildOAuthStatusResponse(config: RuntimeConfig = createRuntimeConfig()): OAuthStatusResponse {
  return {
    exposure: config.oauthStatusExposure,
    mode: config.xOAuth.mode,
    callbackUrl: config.xOAuth.callbackUrl,
    scopes: [...V0_READ_ONLY_OAUTH_SCOPES],
    clientIdConfigured: config.xOAuth.mode === "configured",
    clientSecretConfigured: config.xOAuth.clientSecretConfigured,
    writesEnabled: false,
    missingEnv: config.xOAuth.mode === "mock" ? [...config.xOAuth.missingEnv] : [],
  };
}

export function buildOAuthStartResponse(config: RuntimeConfig = createRuntimeConfig()) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.xOAuth.clientId,
    redirect_uri: config.xOAuth.callbackUrl,
    scope: V0_READ_ONLY_OAUTH_SCOPES.join(" "),
    state: "mock-state",
    code_challenge: "mock-code-challenge",
    code_challenge_method: "plain",
  });

  return {
    authorizationUrl: `https://x.com/i/oauth2/authorize?${params.toString()}`,
    scopes: [...V0_READ_ONLY_OAUTH_SCOPES],
    state: "mock-state",
    mode: config.xOAuth.mode,
    callbackUrl: config.xOAuth.callbackUrl,
    writesEnabled: false,
  };
}

export const buildMockOAuthStartResponse = buildOAuthStartResponse;

export function buildCorsOptions(config: RuntimeConfig = createRuntimeConfig()): CorsOptions {
  if (!config.corsAllowedOrigins) {
    return {};
  }

  const allowedOrigins = new Set(config.corsAllowedOrigins);

  return {
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.has(origin));
    },
  };
}

export function createApp(config: RuntimeConfig = createRuntimeConfig()) {
  const app = express();
  const tokenRepository = new InMemoryTokenRepository();
  const usageLedger = createInMemoryApiUsageLedgerService();
  const backupService = new MockBackupService(new MockXApiClient(fixtureAccount, fixtureProfile, fixtureTweets), usageLedger);
  const backupRuns = new Map<string, Awaited<ReturnType<MockBackupService["runBackup"]>>>();

  app.use(cors(buildCorsOptions(config)));
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      service: "xguard-api",
      mode: "prototype",
      xOAuthMode: config.xOAuth.mode,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/x/oauth/start", (_request, response) => {
    response.json(buildOAuthStartResponse(config));
  });

  app.get("/api/x/oauth/status", (request, response) => {
    response.set("Cache-Control", "no-store");

    if (
      config.oauthStatusExposure === "disabled" ||
      !matchesToken(config.oauthStatusDiagnosticToken, request.get("x-xguard-diagnostic-token"))
    ) {
      response.status(404).json({ error: "oauth_status_not_found" });
      return;
    }

    response.json(buildOAuthStatusResponse(config));
  });

  app.get("/api/x/oauth/callback", async (request, response) => {
    const query = z.object({ code: z.string().min(1), state: z.string().min(1) }).safeParse(request.query);

    if (!query.success) {
      response.status(400).json({ error: "invalid_oauth_callback", details: query.error.flatten().fieldErrors });
      return;
    }

    await tokenRepository.saveXToken({
      xAccountId: fixtureAccount.id,
      provider: "x",
      scope: [...V0_READ_ONLY_OAUTH_SCOPES],
      accessTokenRef: "vault://x/oauth/access/mock",
      refreshTokenRef: "vault://x/oauth/refresh/mock",
    });

    response.json({
      connectedAccount: fixtureAccount,
      tokenStorage: "repository-ref-only",
      writesEnabled: false,
    });
  });

  app.post("/api/backup/run", async (request, response) => {
    const body = z.object({ tweetLimit: z.number().int().min(1).max(100).default(25) }).safeParse(request.body ?? {});

    if (!body.success) {
      response.status(400).json({ error: "invalid_backup_request", details: body.error.flatten().fieldErrors });
      return;
    }

    const result = await backupService.runBackup(body.data.tweetLimit);
    backupRuns.set(result.backupRun.id, result);
    response.status(201).json(result);
  });

  app.get("/api/backup/status/:runId", (request, response) => {
    const result = backupRuns.get(request.params.runId);

    if (!result) {
      response.status(404).json({ error: "backup_run_not_found" });
      return;
    }

    response.json(result.backupRun);
  });

  app.get("/api/recovery/:runId/proof", (request, response) => {
    const result = backupRuns.get(request.params.runId);

    if (!result) {
      response.status(404).json({ error: "proof_payload_not_found" });
      return;
    }

    response.json(result.proofPayload);
  });

  return app;
}

function matchesToken(expected: string | undefined, actual: string | undefined): boolean {
  if (!expected || !actual) {
    return false;
  }

  const expectedDigest = createHash("sha256").update(expected).digest();
  const actualDigest = createHash("sha256").update(actual).digest();
  return timingSafeEqual(expectedDigest, actualDigest);
}
