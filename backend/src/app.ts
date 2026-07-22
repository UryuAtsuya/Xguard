import cors, { type CorsOptions } from "cors";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { z } from "zod";
import type { AdminRole } from "../../shared/admin.js";
import { MockXApiClient } from "./clients/xApiClient.js";
import { createRuntimeConfig, type RuntimeConfig } from "./config/runtimeConfig.js";
import { fixtureAccount, fixtureProfile, fixtureTweets } from "./fixtures/mockXData.js";
import { InMemoryOAuthStateRepository, type OAuthStateRepository } from "./repositories/oauthStateRepository.js";
import { InMemorySessionRepository } from "./repositories/sessionRepository.js";
import { InMemoryTokenRepository, V0_READ_ONLY_X_SCOPES } from "./repositories/tokenRepository.js";
import {
  InMemoryProofPageRepository,
  SupabaseProofPageRepository,
  type ProofPageRepository,
  type SupabaseProofPageStore,
} from "./repositories/proofPageRepository.js";
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
import type { AdminDatabaseSnapshot, AdminDatabaseTableSummary } from "../../shared/types.js";
import {
  RejectingAdminTokenVerifier,
  type AdminTokenVerifier,
  type VerifiedAdminIdentity,
} from "./admin/adminAuth.js";
import {
  InMemoryAdminMemberRepository,
  type AdminMemberRepository,
  type StoredAdminMember,
  toPublicAdminMember,
} from "./admin/adminMemberRepository.js";
import {
  UnavailableAdminInviteService,
  type AdminInviteService,
} from "./admin/adminInviteService.js";
import { AdminService, AdminServiceError } from "./admin/adminService.js";

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
  oauthStateRepository?: OAuthStateRepository;
  proofPageStore?: SupabaseProofPageStore;
  contentComplianceEventStore?: SupabaseContentComplianceEventStore;
  adminTokenVerifier?: AdminTokenVerifier;
  adminMemberRepository?: AdminMemberRepository;
  adminInviteService?: AdminInviteService;
}

export function buildCorsOptions(
  config: RuntimeConfig = createRuntimeConfig(),
  audience: "customer" | "admin" = "customer",
): CorsOptions {
  const configuredOrigins =
    audience === "admin"
      ? config.adminCorsAllowedOrigins
      : config.customerCorsAllowedOrigins ?? config.corsAllowedOrigins;

  if (!configuredOrigins) {
    return {};
  }

  const allowedOrigins = new Set(configuredOrigins);

  return {
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.has(origin));
    },
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
  };
}

export function createApp(config: RuntimeConfig = createRuntimeConfig(), options: CreateAppOptions = {}) {
  const app = express();
  const tokenRepository = new InMemoryTokenRepository();
  const oauthStateRepository = createOAuthStateRepository(config, options);
  const sessionRepository = new InMemorySessionRepository();
  const xOAuthTokenExchangeService =
    options.xOAuthTokenExchangeService ?? createDefaultXOAuthTokenExchangeService(config);
  const contentComplianceEventRepository = createContentComplianceEventRepository(config, options);
  const usageLedger = createInMemoryApiUsageLedgerService();
  const backupService = new MockBackupService(new MockXApiClient(fixtureAccount, fixtureProfile, fixtureTweets), usageLedger);
  const proofPageRepository = createProofPageRepository(config, options);
  const adminMemberRepository = options.adminMemberRepository ?? new InMemoryAdminMemberRepository();
  const adminService = new AdminService(
    adminMemberRepository,
    options.adminInviteService ?? new UnavailableAdminInviteService(),
  );
  const adminTokenVerifier = options.adminTokenVerifier ?? new RejectingAdminTokenVerifier();
  const requireAdminSession = requireAdmin(adminTokenVerifier, adminService, sessionRepository);
  const customerCors = cors(buildCorsOptions(config, "customer"));
  const adminCors = cors(buildCorsOptions(config, "admin"));
  const invitationRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  app.disable("x-powered-by");
  app.enable("case sensitive routing");
  app.use(helmet());
  app.use((request, response, next) => {
    const corsMiddleware = request.path.startsWith("/api/admin") ? adminCors : customerCors;
    corsMiddleware(request, response, next);
  });
  app.use(express.json({ limit: "32kb" }));
  app.locals.sessionRepository = sessionRepository;
  app.locals.tokenRepository = tokenRepository;
  app.locals.proofPageRepository = proofPageRepository;
  app.locals.contentComplianceEventRepository = contentComplianceEventRepository;
  app.locals.adminMemberRepository = adminMemberRepository;

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

  app.get("/api/admin/session", requireAdminSession, (request, response) => {
    response.set("Cache-Control", "no-store");
    response.json({ member: toPublicAdminMember(getAdminMember(request)) });
  });

  app.get(
    "/api/admin/members",
    requireAdminSession,
    requireAdminRole("owner"),
    async (_request, response) => {
      response.set("Cache-Control", "no-store");
      const members = await adminService.listMembers();
      response.json({ members: members.map(toPublicAdminMember) });
    },
  );

  app.post(
    "/api/admin/members/invitations",
    invitationRateLimit,
    requireAdminSession,
    requireAdminRole("owner"),
    async (request, response) => {
      const body = z
        .object({
          email: z.string().trim().email().max(254),
          role: z.enum(["owner", "operator", "viewer"]),
        })
        .strict()
        .safeParse(request.body ?? {});

      if (!body.success) {
        response.status(400).json({
          error: "invalid_admin_invitation",
          details: body.error.flatten().fieldErrors,
        });
        return;
      }

      try {
        const member = await adminService.inviteMember({
          actor: getAdminMember(request),
          email: body.data.email,
          role: body.data.role,
          redirectTo:
            config.adminAuth?.mode === "supabase"
              ? config.adminAuth.redirectUrl
              : "http://localhost:5174/auth/callback",
        });
        response.set("Cache-Control", "no-store");
        response.status(202).json({ member: toPublicAdminMember(member) });
      } catch (error) {
        respondAdminError(error, response);
      }
    },
  );

  app.patch(
    "/api/admin/members/:memberId",
    requireAdminSession,
    requireAdminRole("owner"),
    async (request, response) => {
      const body = z
        .object({
          role: z.enum(["owner", "operator", "viewer"]).optional(),
          status: z.enum(["active", "disabled"]).optional(),
        })
        .strict()
        .refine((value) => Boolean(value.role || value.status), {
          message: "role_or_status_required",
        })
        .safeParse(request.body ?? {});

      if (!body.success) {
        response.status(400).json({
          error: "invalid_admin_member_update",
          details: body.error.flatten().fieldErrors,
        });
        return;
      }

      try {
        const member = await adminService.updateMember({
          actor: getAdminMember(request),
          memberId: getStringParam(request, "memberId"),
          role: body.data.role,
          status: body.data.status,
        });
        response.set("Cache-Control", "no-store");
        response.json({ member: toPublicAdminMember(member) });
      } catch (error) {
        respondAdminError(error, response);
      }
    },
  );

  app.get("/api/admin/database-snapshot", requireAdminSession, async (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.json(await buildAdminDatabaseSnapshot(proofPageRepository, contentComplianceEventRepository));
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
    const revocationEvent =
      body.data.visibility === "revoked" && entry.visibility !== "revoked"
        ? {
            eventType: "proof_page_revoked" as const,
            source: "user_request" as const,
            xAccountId: entry.backupRun.xAccountId,
            details: {
              runId,
              userId: entry.userId,
              previousVisibility: entry.visibility,
              newVisibility: "revoked",
              occurredAt: revokedAt!,
            },
            createdAt: new Date().toISOString(),
          }
        : undefined;

    const updatedEntry =
      revocationEvent && proofPageRepository.updateVisibilityAndRecordComplianceEvent
        ? await proofPageRepository.updateVisibilityAndRecordComplianceEvent(
            runId,
            body.data.visibility,
            revokedAt,
            revocationEvent,
          )
        : await proofPageRepository.updateVisibility(runId, body.data.visibility, revokedAt);

    if (!updatedEntry) {
      response.status(404).json({ error: "proof_payload_not_found" });
      return;
    }

    if (revocationEvent && !proofPageRepository.updateVisibilityAndRecordComplianceEvent) {
      await contentComplianceEventRepository.record(revocationEvent);
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

  app.use((_request, response) => {
    response.status(404).json({ error: "not_found" });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (response.headersSent) {
      return;
    }

    console.error("xguard_request_failed", error instanceof Error ? error.message : "unknown");
    response.status(500).json({ error: "internal_server_error" });
  });

  return app;
}

function createOAuthStateRepository(config: RuntimeConfig, options: CreateAppOptions): OAuthStateRepository {
  if (options.oauthStateRepository) {
    return options.oauthStateRepository;
  }

  if (config.oauthStateRepository === "supabase") {
    throw new Error("invalid_runtime_env:OAUTH_STATE_REPOSITORY_STORE");
  }

  return new InMemoryOAuthStateRepository();
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

function createProofPageRepository(
  config: RuntimeConfig,
  options: CreateAppOptions,
): ProofPageRepository {
  if (options.proofPageStore) {
    return new SupabaseProofPageRepository(options.proofPageStore);
  }

  if (config.contentComplianceEventRepository === "supabase") {
    throw new Error("invalid_runtime_env:PROOF_PAGE_REPOSITORY_TRANSACTION_STORE");
  }

  return new InMemoryProofPageRepository();
}

async function buildAdminDatabaseSnapshot(
  proofPageRepository: ProofPageRepository,
  contentComplianceEventRepository: ContentComplianceEventRepository,
): Promise<AdminDatabaseSnapshot> {
  const proofEntries = await proofPageRepository.listAll();
  const contentComplianceEvents = await contentComplianceEventRepository.listAll();
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

interface AdminAuthenticatedRequest extends Request {
  adminIdentity?: VerifiedAdminIdentity;
  adminMember?: StoredAdminMember;
}

function requireAdmin(
  adminTokenVerifier: AdminTokenVerifier,
  adminService: AdminService,
  customerSessionRepository: InMemorySessionRepository,
) {
  return async (
    request: AdminAuthenticatedRequest,
    response: Response,
    next: NextFunction,
  ): Promise<void> => {
    const authorization = request.get("Authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : undefined;

    if (!token) {
      response.status(401).json({ error: "admin_authentication_required" });
      return;
    }

    try {
      const identity = await adminTokenVerifier.verify(token);

      if (!identity) {
        if (await customerSessionRepository.lookup(token)) {
          response.status(403).json({ error: "customer_session_not_allowed" });
          return;
        }

        response.status(401).json({ error: "invalid_admin_token" });
        return;
      }

      const member = await adminService.resolveSession(identity);
      request.adminIdentity = identity;
      request.adminMember = member;
      next();
    } catch (error) {
      if (error instanceof AdminServiceError) {
        response.status(error.statusCode).json({ error: error.code });
        return;
      }

      next(error);
    }
  };
}

function requireAdminRole(...allowedRoles: AdminRole[]) {
  const allowed = new Set(allowedRoles);

  return (request: AdminAuthenticatedRequest, response: Response, next: NextFunction): void => {
    const member = request.adminMember;

    if (!member) {
      response.status(401).json({ error: "admin_authentication_required" });
      return;
    }

    if (!allowed.has(member.role)) {
      response.status(403).json({ error: "admin_role_required" });
      return;
    }

    next();
  };
}

function getAdminMember(request: Request): StoredAdminMember {
  const member = (request as AdminAuthenticatedRequest).adminMember;

  if (!member) {
    throw new Error("authenticated_admin_missing");
  }

  return member;
}

function respondAdminError(error: unknown, response: Response): void {
  if (error instanceof AdminServiceError) {
    response.status(error.statusCode).json({ error: error.code });
    return;
  }

  throw error;
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
