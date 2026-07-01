import cors, { type CorsOptions } from "cors";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { MockXApiClient } from "./clients/xApiClient.js";
import { createRuntimeConfig, type RuntimeConfig } from "./config/runtimeConfig.js";
import { fixtureAccount, fixtureProfile, fixtureTweets } from "./fixtures/mockXData.js";
import { InMemoryOAuthStateRepository } from "./repositories/oauthStateRepository.js";
import { InMemorySessionRepository } from "./repositories/sessionRepository.js";
import { InMemoryTokenRepository, V0_READ_ONLY_X_SCOPES } from "./repositories/tokenRepository.js";
import { InMemoryProofPageRepository } from "./repositories/proofPageRepository.js";
import {
  InMemoryContentComplianceEventRepository,
  type ContentComplianceEventRepository,
} from "./repositories/contentComplianceEventRepository.js";
import {
  SupabaseContentComplianceEventRepository,
  type SupabaseContentComplianceEventStore,
} from "./repositories/supabaseContentComplianceEventRepository.js";
import { createInMemoryApiUsageLedgerService } from "./services/apiUsageLedger.js";
import { MockBackupService } from "./services/mockBackupService.js";
import {
  createDefaultXOAuthTokenExchangeService,
  type XOAuthTokenExchangeService,
} from "./services/xOAuthTokenExchangeService.js";
import type { AdminDatabaseSnapshot, AdminDatabaseTableSummary, ContentComplianceEvent } from "../../shared/types.js";

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

export interface OAuthStartProofKey {
  state: string;
  codeChallenge: string;
  codeVerifier: string;
  expiresAt: Date;
}

export function createOAuthStartProofKey(config: RuntimeConfig = createRuntimeConfig()): OAuthStartProofKey {
  const codeVerifier = randomBytes(config.oauthPkceVerifierBytes).toString("base64url");

  return {
    state: randomBytes(32).toString("base64url"),
    codeVerifier,
    codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url"),
    expiresAt: new Date(Date.now() + config.oauthStateTtlSeconds * 1000),
  };
}

export function buildOAuthStartResponse(
  config: RuntimeConfig = createRuntimeConfig(),
  proofKey: OAuthStartProofKey = createOAuthStartProofKey(config),
) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.xOAuth.clientId,
    redirect_uri: config.xOAuth.callbackUrl,
    scope: V0_READ_ONLY_OAUTH_SCOPES.join(" "),
    state: proofKey.state,
    code_challenge: proofKey.codeChallenge,
    code_challenge_method: "S256",
  });

  return {
    authorizationUrl: `https://x.com/i/oauth2/authorize?${params.toString()}`,
    scopes: [...V0_READ_ONLY_OAUTH_SCOPES],
    state: proofKey.state,
    codeChallenge: proofKey.codeChallenge,
    codeChallengeMethod: "S256" as const,
    stateExpiresAt: proofKey.expiresAt.toISOString(),
    mode: config.xOAuth.mode,
    callbackUrl: config.xOAuth.callbackUrl,
    writesEnabled: false,
  };
}

export const buildMockOAuthStartResponse = buildOAuthStartResponse;

export interface CreateAppOptions {
  xOAuthTokenExchangeService?: XOAuthTokenExchangeService;
  contentComplianceEventStore?: SupabaseContentComplianceEventStore;
}

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

export function createApp(config: RuntimeConfig = createRuntimeConfig(), options: CreateAppOptions = {}) {
  const app = express();
  const tokenRepository = new InMemoryTokenRepository();
  const oauthStateRepository = new InMemoryOAuthStateRepository();
  const sessionRepository = new InMemorySessionRepository();
  const xOAuthTokenExchangeService =
    options.xOAuthTokenExchangeService ?? createDefaultXOAuthTokenExchangeService(config);
  const contentComplianceEventRepository = createContentComplianceEventRepository(config, options);
  const usageLedger = createInMemoryApiUsageLedgerService();
  const backupService = new MockBackupService(new MockXApiClient(fixtureAccount, fixtureProfile, fixtureTweets), usageLedger);
  const proofPageRepository = new InMemoryProofPageRepository();

  app.use(cors(buildCorsOptions(config)));
  app.use(express.json());
  app.locals.sessionRepository = sessionRepository;
  app.locals.tokenRepository = tokenRepository;
  app.locals.proofPageRepository = proofPageRepository;
  app.locals.contentComplianceEventRepository = contentComplianceEventRepository;

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      service: "xguard-api",
      mode: "prototype",
      xOAuthMode: config.xOAuth.mode,
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/x/oauth/start", async (_request, response) => {
    const proofKey = createOAuthStartProofKey(config);

    await oauthStateRepository.save({
      state: proofKey.state,
      codeVerifier: proofKey.codeVerifier,
      expiresAt: proofKey.expiresAt,
    });

    response.json(buildOAuthStartResponse(config, proofKey));
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

    const state = await oauthStateRepository.consume(query.data.state);

    if (!state.ok) {
      response.status(403).json({
        error: state.reason === "expired" ? "expired_oauth_state" : "invalid_oauth_state",
      });
      return;
    }

    const exchange = await xOAuthTokenExchangeService.exchange({
      code: query.data.code,
      codeVerifier: state.record.codeVerifier,
      callbackUrl: config.xOAuth.callbackUrl,
      scopes: V0_READ_ONLY_OAUTH_SCOPES,
    });

    if (!exchange.ok) {
      response.status(501).json({ error: "x_oauth_token_exchange_not_implemented" });
      return;
    }

    await tokenRepository.saveXToken(exchange.token);

    const sessionToken = randomBytes(32).toString("base64url");
    await sessionRepository.save(sessionToken, exchange.connectedAccount.userId);

    response.json({
      connectedAccount: exchange.connectedAccount,
      sessionToken,
      tokenStorage: "repository-ref-only",
      writesEnabled: false,
    });
  });

  app.post("/api/backup/run", requireAuth(sessionRepository), async (request, response) => {
    const body = z.object({ tweetLimit: z.number().int().min(1).max(100).default(25) }).safeParse(request.body ?? {});

    if (!body.success) {
      response.status(400).json({ error: "invalid_backup_request", details: body.error.flatten().fieldErrors });
      return;
    }

    const result = await backupService.runBackup(body.data.tweetLimit);
    await proofPageRepository.create({
      userId: getAuthenticatedUserId(request),
      visibility: "private",
      revokedAt: null,
      ...result,
    });
    response.status(201).json(result);
  });

  app.get("/api/backup/status/:runId", requireAuth(sessionRepository), async (request, response) => {
    const entry = await proofPageRepository.findByRunId(getStringParam(request, "runId"));

    if (!entry) {
      response.status(404).json({ error: "backup_run_not_found" });
      return;
    }

    if (entry.userId !== getAuthenticatedUserId(request)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }

    response.json(entry.backupRun);
  });

  app.get("/api/admin/database-snapshot", requireAuth(sessionRepository), async (request, response) => {
    response.set("Cache-Control", "no-store");
    response.json(await buildAdminDatabaseSnapshot(getAuthenticatedUserId(request), proofPageRepository, contentComplianceEventRepository));
  });

  app.patch("/api/recovery/:runId/proof/visibility", requireAuth(sessionRepository), async (request, response) => {
    const body = z.object({ visibility: z.enum(["unlisted", "public", "revoked"]) }).safeParse(request.body ?? {});

    if (!body.success) {
      response.status(400).json({ error: "invalid_proof_visibility_request", details: body.error.flatten().fieldErrors });
      return;
    }

    const runId = getStringParam(request, "runId");
    const entry = await proofPageRepository.findByRunId(runId);

    if (!entry) {
      response.status(404).json({ error: "proof_payload_not_found" });
      return;
    }

    if (entry.userId !== getAuthenticatedUserId(request)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }

    if (entry.revokedAt && body.data.visibility !== "revoked") {
      response.status(409).json({ error: "proof_payload_revoked" });
      return;
    }

    const revokedAt =
      body.data.visibility === "revoked" ? entry.revokedAt ?? new Date().toISOString() : null;
    if (body.data.visibility === "revoked" && entry.visibility !== "revoked") {
      await contentComplianceEventRepository.record({
        eventType: "proof_page_revoked",
        source: "user_request",
        xAccountId: entry.backupRun.xAccountId,
        details: {
          runId,
          userId: entry.userId,
          previousVisibility: entry.visibility,
          newVisibility: "revoked",
          occurredAt: revokedAt!,
        },
        createdAt: new Date().toISOString(),
      });
    }

    const updatedEntry = await proofPageRepository.updateVisibility(runId, body.data.visibility, revokedAt);

    if (!updatedEntry) {
      response.status(404).json({ error: "proof_payload_not_found" });
      return;
    }

    response.json({
      runId,
      visibility: updatedEntry.visibility,
      revokedAt: updatedEntry.revokedAt,
    });
  });

  app.get("/api/recovery/:runId/proof", requireAuth(sessionRepository), async (request, response) => {
    const entry = await proofPageRepository.findByRunId(getStringParam(request, "runId"));

    if (!entry) {
      response.status(404).json({ error: "proof_payload_not_found" });
      return;
    }

    if (entry.userId !== getAuthenticatedUserId(request)) {
      response.status(403).json({ error: "forbidden" });
      return;
    }

    if (entry.visibility === "private" || entry.revokedAt) {
      response.status(404).json({ error: "proof_payload_not_found" });
      return;
    }

    response.json(entry.proofPayload);
  });

  return app;
}

function createContentComplianceEventRepository(
  config: RuntimeConfig,
  options: CreateAppOptions,
): ContentComplianceEventRepository {
  if (config.contentComplianceEventRepository === "memory") {
    return new InMemoryContentComplianceEventRepository();
  }

  if (!options.contentComplianceEventStore) {
    throw new Error("invalid_runtime_env:CONTENT_COMPLIANCE_EVENT_REPOSITORY_STORE");
  }

  return new SupabaseContentComplianceEventRepository(options.contentComplianceEventStore);
}

async function buildAdminDatabaseSnapshot(
  userId: string,
  proofPageRepository: InMemoryProofPageRepository,
  contentComplianceEventRepository: ContentComplianceEventRepository,
): Promise<AdminDatabaseSnapshot> {
  const proofEntries = await proofPageRepository.listByUser(userId);
  const xAccountIds = [...new Set(proofEntries.map((entry) => entry.backupRun.xAccountId))];
  const contentComplianceEvents = (
    await Promise.all(xAccountIds.map((xAccountId) => contentComplianceEventRepository.listByXAccount(xAccountId)))
  ).flat();
  const backupRuns = proofEntries.map((entry) => entry.backupRun);
  const proofPages = proofEntries.map((entry) => ({
    runId: entry.backupRun.id,
    userId: entry.userId,
    xAccountId: entry.backupRun.xAccountId,
    visibility: entry.visibility,
    revokedAt: entry.revokedAt,
    createdAt: entry.backupRun.createdAt,
    updatedAt: entry.revokedAt ?? entry.backupRun.completedAt ?? entry.backupRun.createdAt,
  }));

  return {
    generatedAt: new Date().toISOString(),
    tables: [
      tableSummary("backup_runs", backupRuns.length, backupRuns.map((run) => run.completedAt ?? run.createdAt)),
      tableSummary("proof_pages", proofPages.length, proofPages.map((proofPage) => proofPage.updatedAt)),
      tableSummary("content_compliance_events", contentComplianceEvents.length, contentComplianceEvents.map((event) => event.createdAt)),
    ],
    backupRuns,
    proofPages,
    contentComplianceEvents: contentComplianceEvents.sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
  };
}

function tableSummary(
  name: string,
  rowCount: number,
  updatedAtValues: Array<string | undefined>,
): AdminDatabaseTableSummary {
  return {
    name,
    rowCount,
    source: "repository",
    writable: false,
    lastUpdatedAt: updatedAtValues.filter((value): value is string => Boolean(value)).sort().at(-1),
  };
}

interface AuthenticatedRequest extends Request {
  userId?: string;
}

function requireAuth(sessionRepository: InMemorySessionRepository) {
  return async (request: AuthenticatedRequest, response: Response, next: NextFunction): Promise<void> => {
    const auth = request.get("Authorization");
    const token = auth?.startsWith("Bearer ") ? auth.slice(7) : undefined;

    if (!token) {
      response.status(401).json({ error: "authentication_required" });
      return;
    }

    const userId = await sessionRepository.lookup(token);

    if (!userId) {
      response.status(401).json({ error: "invalid_session" });
      return;
    }

    request.userId = userId;
    next();
  };
}

function getAuthenticatedUserId(request: Request): string {
  const userId = (request as AuthenticatedRequest).userId;

  if (!userId) {
    throw new Error("authenticated_user_missing");
  }

  return userId;
}

function getStringParam(request: Request, paramName: string): string {
  const value = request.params[paramName];
  return Array.isArray(value) ? value[0] : value;
}

function matchesToken(expected: string | undefined, actual: string | undefined): boolean {
  if (!expected || !actual) {
    return false;
  }

  const expectedDigest = createHash("sha256").update(expected).digest();
  const actualDigest = createHash("sha256").update(actual).digest();
  return timingSafeEqual(expectedDigest, actualDigest);
}
