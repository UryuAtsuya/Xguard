import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ContentComplianceEvent } from "../../../shared/types.js";
import { createApp } from "../app.js";
import { createRuntimeConfig } from "../config/runtimeConfig.js";
import type { ContentComplianceEventRepository } from "../repositories/contentComplianceEventRepository.js";
import type {
  SupabaseContentComplianceEventRow,
  SupabaseContentComplianceEventStore,
} from "../repositories/supabaseContentComplianceEventRepository.js";
import type {
  SupabaseProofPageEntryRow,
  SupabaseProofPageRow,
  SupabaseProofPageStore,
} from "../repositories/proofPageRepository.js";
import type { SupabaseBackupRunRow } from "../repositories/supabaseApiUsageLedgerRepository.js";

describe("backup and proof auth boundary", () => {
  it("rejects unauthenticated backup and proof access", async () => {
    const app = createApp();

    expect(await invokeRoute(app, "post", "/api/backup/run", { body: { tweetLimit: 1 } })).toMatchObject({
      statusCode: 401,
      body: { error: "authentication_required" },
    });
    expect(await invokeRoute(app, "get", "/api/backup/status/:runId", { params: { runId: "missing-run" } })).toMatchObject({
      statusCode: 401,
      body: { error: "authentication_required" },
    });
    expect(await invokeRoute(app, "get", "/api/recovery/:runId/proof", { params: { runId: "missing-run" } })).toMatchObject({
      statusCode: 401,
      body: { error: "authentication_required" },
    });
    expect(
      await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
        body: { visibility: "public" },
        params: { runId: "missing-run" },
      }),
    ).toMatchObject({
      statusCode: 401,
      body: { error: "authentication_required" },
    });
    expect(await invokeRoute(app, "get", "/api/admin/database-snapshot")).toMatchObject({
      statusCode: 401,
      body: { error: "admin_authentication_required" },
    });
  });

  it("lets an owner create and read their backup status", async () => {
    const app = createApp();
    const sessionToken = await createSession(app);
    const backupResponse = await invokeRoute(app, "post", "/api/backup/run", {
      authorization: `Bearer ${sessionToken}`,
      body: { tweetLimit: 1 },
    });
    const runId = getRunId(backupResponse.body);

    const statusResponse = await invokeRoute(app, "get", "/api/backup/status/:runId", {
      authorization: `Bearer ${sessionToken}`,
      params: { runId },
    });

    expect(backupResponse.statusCode).toBe(201);
    expect(statusResponse.statusCode).toBeUndefined();
  });

  it("routes proof page persistence through the configured Supabase repository", async () => {
    const proofPageStore = new RecordingSupabaseProofPageStore();
    const app = createApp(createRuntimeConfig(), { proofPageStore });
    const sessionToken = await createSession(app);
    const runId = await createBackupRun(app, sessionToken);

    const visibilityResponse = await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
      authorization: `Bearer ${sessionToken}`,
      body: { visibility: "public" },
      params: { runId },
    });
    const proofResponse = await invokeRoute(app, "get", "/api/recovery/:runId/proof", {
      authorization: `Bearer ${sessionToken}`,
      params: { runId },
    });

    expect(proofPageStore.rows).toHaveLength(1);
    expect(proofPageStore.rows[0]?.proof_page).toMatchObject({
      backup_run_id: runId,
      user_id: "user_fixture_001",
      visibility: "public",
      public_payload: expect.objectContaining({
        redactionPolicyVersion: "v1",
      }),
    });
    expect(visibilityResponse.body).toMatchObject({ runId, visibility: "public", revokedAt: null });
    expect(proofResponse.statusCode).toBeUndefined();
    expect(JSON.stringify(proofResponse.body)).not.toContain("accessToken");
    expect(JSON.stringify(proofResponse.body)).not.toContain("refreshToken");
  });

  it("does not accept a customer session token on the admin snapshot endpoint", async () => {
    const app = createApp();
    const sessionToken = await createSession(app);
    const runId = await createBackupRun(app, sessionToken);
    await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
      authorization: `Bearer ${sessionToken}`,
      body: { visibility: "revoked" },
      params: { runId },
    });

    const snapshotResponse = await invokeRoute(app, "get", "/api/admin/database-snapshot", {
      authorization: `Bearer ${sessionToken}`,
    });

    expect(snapshotResponse.statusCode).toBe(403);
    expect(snapshotResponse.body).toEqual({ error: "customer_session_not_allowed" });
  });

  it("keeps proof payload private by default", async () => {
    const app = createApp();
    const sessionToken = await createSession(app);
    const runId = await createBackupRun(app, sessionToken);

    expect(
      await invokeRoute(app, "get", "/api/recovery/:runId/proof", {
        authorization: `Bearer ${sessionToken}`,
        params: { runId },
      }),
    ).toMatchObject({ statusCode: 404, body: { error: "proof_payload_not_found" } });
  });

  it("lets an owner read public proof without exposing token material", async () => {
    const app = createApp();
    const sessionToken = await createSession(app);
    const runId = await createBackupRun(app, sessionToken);
    const visibilityResponse = await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
      authorization: `Bearer ${sessionToken}`,
      body: { visibility: "public" },
      params: { runId },
    });

    const proofResponse = await invokeRoute(app, "get", "/api/recovery/:runId/proof", {
      authorization: `Bearer ${sessionToken}`,
      params: { runId },
    });

    expect(visibilityResponse.statusCode).toBeUndefined();
    expect(visibilityResponse.body).toMatchObject({ runId, visibility: "public", revokedAt: null });
    expect(proofResponse.statusCode).toBeUndefined();
    expect(JSON.stringify(proofResponse.body)).not.toContain("vault://");
    expect(JSON.stringify(proofResponse.body)).not.toContain("accessToken");
    expect(JSON.stringify(proofResponse.body)).not.toContain("refreshToken");
  });

  it("lets an owner mark proof unlisted and read it", async () => {
    const app = createApp();
    const sessionToken = await createSession(app);
    const runId = await createBackupRun(app, sessionToken);

    expect(
      await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
        authorization: `Bearer ${sessionToken}`,
        body: { visibility: "unlisted" },
        params: { runId },
      }),
    ).toMatchObject({ body: { runId, visibility: "unlisted", revokedAt: null } });
    expect(
      await invokeRoute(app, "get", "/api/recovery/:runId/proof", {
        authorization: `Bearer ${sessionToken}`,
        params: { runId },
      }),
    ).toMatchObject({ statusCode: undefined });
  });

  it("rejects another user's backup status and proof access", async () => {
    const app = createApp();
    const ownerToken = await createSession(app);
    const otherToken = "test-session-other-user";
    await app.locals.sessionRepository.save(otherToken, "user_other_001");
    const backupResponse = await invokeRoute(app, "post", "/api/backup/run", {
      authorization: `Bearer ${ownerToken}`,
      body: { tweetLimit: 1 },
    });
    const runId = getRunId(backupResponse.body);

    expect(
      await invokeRoute(app, "get", "/api/backup/status/:runId", {
        authorization: `Bearer ${otherToken}`,
        params: { runId },
      }),
    ).toMatchObject({ statusCode: 403, body: { error: "forbidden" } });
    expect(
      await invokeRoute(app, "get", "/api/recovery/:runId/proof", {
        authorization: `Bearer ${otherToken}`,
        params: { runId },
      }),
    ).toMatchObject({ statusCode: 403, body: { error: "forbidden" } });
    expect(
      await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
        authorization: `Bearer ${otherToken}`,
        body: { visibility: "public" },
        params: { runId },
      }),
    ).toMatchObject({ statusCode: 403, body: { error: "forbidden" } });
  });

  it("hides private and revoked proof payloads from the owner", async () => {
    const app = createApp();
    const sessionToken = await createSession(app);
    const privateRunId = await createBackupRun(app, sessionToken);
    const revokedRunId = await createBackupRun(app, sessionToken);

    const revokeResponse = await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
      authorization: `Bearer ${sessionToken}`,
      body: { visibility: "revoked" },
      params: { runId: revokedRunId },
    });

    expect(revokeResponse.statusCode).toBeUndefined();
    expect(revokeResponse.body).toMatchObject({ runId: revokedRunId, visibility: "revoked" });
    expect(
      await invokeRoute(app, "get", "/api/recovery/:runId/proof", {
        authorization: `Bearer ${sessionToken}`,
        params: { runId: privateRunId },
      }),
    ).toMatchObject({ statusCode: 404, body: { error: "proof_payload_not_found" } });
    expect(
      await invokeRoute(app, "get", "/api/recovery/:runId/proof", {
        authorization: `Bearer ${sessionToken}`,
        params: { runId: revokedRunId },
      }),
    ).toMatchObject({ statusCode: 404, body: { error: "proof_payload_not_found" } });
  });

  it("does not reopen a revoked proof payload", async () => {
    const app = createApp();
    const sessionToken = await createSession(app);
    const runId = await createBackupRun(app, sessionToken);

    await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
      authorization: `Bearer ${sessionToken}`,
      body: { visibility: "revoked" },
      params: { runId },
    });

    expect(
      await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
        authorization: `Bearer ${sessionToken}`,
        body: { visibility: "public" },
        params: { runId },
      }),
    ).toMatchObject({ statusCode: 409, body: { error: "proof_payload_revoked" } });
  });

  it("records one inspectable compliance event for the first successful revocation", async () => {
    const app = createApp();
    const sessionToken = "test-session-proof-revocation";
    const userId = "user_proof_revocation";
    await app.locals.sessionRepository.save(sessionToken, userId);
    const runId = await createBackupRun(app, sessionToken);

    await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
      authorization: `Bearer ${sessionToken}`,
      body: { visibility: "public" },
      params: { runId },
    });
    const revokeResponse = await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
      authorization: `Bearer ${sessionToken}`,
      body: { visibility: "revoked" },
      params: { runId },
    });
    await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
      authorization: `Bearer ${sessionToken}`,
      body: { visibility: "revoked" },
      params: { runId },
    });

    const events = await getProofPageComplianceEvents(app);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "proof_page_revoked",
      source: "user_request",
      xAccountId: "11111111-1111-4111-8111-111111111111",
      details: {
        runId,
        userId,
        previousVisibility: "public",
        newVisibility: "revoked",
        occurredAt: (revokeResponse.body as { revokedAt: string }).revokedAt,
      },
    });
    expect(Date.parse(events[0].details.occurredAt as string)).not.toBeNaN();
    expect(Date.parse(events[0].createdAt)).not.toBeNaN();
  });

  it("routes proof revocation compliance events through the configured Supabase proof page transaction store", async () => {
    const contentComplianceEventStore = new RecordingSupabaseContentComplianceEventStore();
    const proofPageStore = new RecordingSupabaseProofPageStore();
    const app = createApp(
      createRuntimeConfig({
        CONTENT_COMPLIANCE_EVENT_REPOSITORY: "supabase",
      }),
      { contentComplianceEventStore, proofPageStore },
    );
    const sessionToken = "test-session-proof-supabase-revocation";
    await app.locals.sessionRepository.save(sessionToken, "user_proof_supabase_revocation");
    const runId = await createBackupRun(app, sessionToken);

    await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
      authorization: `Bearer ${sessionToken}`,
      body: { visibility: "revoked" },
      params: { runId },
    });

    expect(proofPageStore.visibilityUpdates).toHaveLength(0);
    expect(proofPageStore.revocationTransactions).toHaveLength(1);
    expect(proofPageStore.revocationTransactions[0]).toMatchObject({
      proof_page: {
        backup_run_id: runId,
        visibility: "revoked",
      },
      content_compliance_event: {
        x_account_id: "11111111-1111-4111-8111-111111111111",
        event_type: "proof_page_revoked",
        source: "user_request",
        details: {
          runId,
          userId: "user_proof_supabase_revocation",
          previousVisibility: "private",
          newVisibility: "revoked",
        },
      },
    });
    expect(contentComplianceEventStore.rows).toHaveLength(0);
  });

  it("fails startup when Supabase compliance storage lacks a proof page transaction store", () => {
    expect(() =>
      createApp(
        createRuntimeConfig({
          CONTENT_COMPLIANCE_EVENT_REPOSITORY: "supabase",
        }),
        { contentComplianceEventStore: new RecordingSupabaseContentComplianceEventStore() },
      ),
    ).toThrow("invalid_runtime_env:PROOF_PAGE_REPOSITORY_TRANSACTION_STORE");
  });

  it("fails startup when Supabase compliance event storage is selected without a store", () => {
    expect(() =>
      createApp(
        createRuntimeConfig({
          CONTENT_COMPLIANCE_EVENT_REPOSITORY: "supabase",
        }),
      ),
    ).toThrow("invalid_runtime_env:CONTENT_COMPLIANCE_EVENT_REPOSITORY_STORE");
  });

  it("does not record compliance events for rejected visibility requests", async () => {
    const app = createApp();
    const ownerToken = "test-session-proof-owner";
    const otherToken = "test-session-proof-other";
    await app.locals.sessionRepository.save(ownerToken, "user_proof_owner");
    await app.locals.sessionRepository.save(otherToken, "user_proof_other");
    const runId = await createBackupRun(app, ownerToken);

    await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
      body: { visibility: "revoked" },
      params: { runId },
    });
    await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
      authorization: `Bearer ${ownerToken}`,
      body: { visibility: "private" },
      params: { runId },
    });
    await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
      authorization: `Bearer ${ownerToken}`,
      body: { visibility: "revoked" },
      params: { runId: "missing-run" },
    });
    await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
      authorization: `Bearer ${otherToken}`,
      body: { visibility: "revoked" },
      params: { runId },
    });

    await expect(getProofPageComplianceEvents(app)).resolves.toHaveLength(0);

    await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
      authorization: `Bearer ${ownerToken}`,
      body: { visibility: "revoked" },
      params: { runId },
    });
    await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
      authorization: `Bearer ${ownerToken}`,
      body: { visibility: "public" },
      params: { runId },
    });

    await expect(getProofPageComplianceEvents(app)).resolves.toHaveLength(1);
  });

  it("rejects unsupported proof visibility changes", async () => {
    const app = createApp();
    const sessionToken = await createSession(app);
    const runId = await createBackupRun(app, sessionToken);

    expect(
      await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
        authorization: `Bearer ${sessionToken}`,
        body: { visibility: "private" },
        params: { runId },
      }),
    ).toMatchObject({ statusCode: 400, body: { error: "invalid_proof_visibility_request" } });
  });

  it("keeps missing run ids as not found after authentication", async () => {
    const app = createApp();
    const sessionToken = await createSession(app);

    expect(
      await invokeRoute(app, "get", "/api/backup/status/:runId", {
        authorization: `Bearer ${sessionToken}`,
        params: { runId: "missing-run" },
      }),
    ).toMatchObject({ statusCode: 404, body: { error: "backup_run_not_found" } });
    expect(
      await invokeRoute(app, "get", "/api/recovery/:runId/proof", {
        authorization: `Bearer ${sessionToken}`,
        params: { runId: "missing-run" },
      }),
    ).toMatchObject({ statusCode: 404, body: { error: "proof_payload_not_found" } });
    expect(
      await invokeRoute(app, "patch", "/api/recovery/:runId/proof/visibility", {
        authorization: `Bearer ${sessionToken}`,
        body: { visibility: "public" },
        params: { runId: "missing-run" },
      }),
    ).toMatchObject({ statusCode: 404, body: { error: "proof_payload_not_found" } });
  });

  it("rejects invalid session tokens", async () => {
    const app = createApp();

    expect(
      await invokeRoute(app, "post", "/api/backup/run", {
        authorization: "Bearer invalid-session",
        body: { tweetLimit: 1 },
      }),
    ).toMatchObject({ statusCode: 401, body: { error: "invalid_session" } });
  });
});

async function createSession(app: ReturnType<typeof createApp>): Promise<string> {
  const startResponse = await invokeRoute(app, "get", "/api/x/oauth/start");
  const callbackResponse = await invokeRoute(app, "get", "/api/x/oauth/callback", {
    query: { code: `code-${randomUUID()}`, state: getState(startResponse.body) },
  });

  return getSessionToken(callbackResponse.body);
}

async function createBackupRun(app: ReturnType<typeof createApp>, sessionToken: string): Promise<string> {
  const backupResponse = await invokeRoute(app, "post", "/api/backup/run", {
    authorization: `Bearer ${sessionToken}`,
    body: { tweetLimit: 1 },
  });

  return getRunId(backupResponse.body);
}

type HttpMethod = "get" | "patch" | "post";

interface RouteInvocationOptions {
  authorization?: string;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
}

interface RouteResponseRecorder {
  statusCode: number | undefined;
  body: unknown;
  headers: Record<string, string>;
  set: (headerName: string, value: string) => RouteResponseRecorder;
  status: (statusCode: number) => RouteResponseRecorder;
  json: (body: unknown) => void;
}

async function invokeRoute(
  app: ReturnType<typeof createApp>,
  method: HttpMethod,
  path: string,
  options: RouteInvocationOptions = {},
): Promise<RouteResponseRecorder> {
  const route = findRegisteredRoute(app, method, path);
  const response = createRouteResponseRecorder();
  const request = createRouteRequest(options);
  let index = 0;
  const next = async (): Promise<void> => {
    const layer = route.stack[index++];
    if (!layer) {
      return;
    }
    await layer.handle(request, response, next);
  };

  await next();
  await waitForResponse(response);
  return response;
}

function findRegisteredRoute(
  app: ReturnType<typeof createApp>,
  method: HttpMethod,
  path: string,
): { stack: Array<{ handle: (request: unknown, response: RouteResponseRecorder, next: () => Promise<void>) => Promise<void> | void }> } {
  const router = app.router as {
    stack: Array<{
      route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: Array<{ handle: (request: unknown, response: RouteResponseRecorder, next: () => Promise<void>) => Promise<void> | void }>;
      };
    }>;
  };
  const route = router.stack.find((layer) => layer.route?.path === path && layer.route.methods[method])?.route;

  if (!route) {
    throw new Error(`missing ${method.toUpperCase()} route: ${path}`);
  }

  return route;
}

function createRouteResponseRecorder(): RouteResponseRecorder {
  const response = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
    headers: {} as Record<string, string>,
    set(headerName: string, value: string) {
      this.headers[headerName.toLowerCase()] = value;
      return this;
    },
    status(statusCode: number) {
      this.statusCode = statusCode;
      return this;
    },
    json(body: unknown) {
      this.body = body;
    },
  };

  return response;
}

function createRouteRequest(options: RouteInvocationOptions) {
  return {
    body: options.body,
    params: options.params ?? {},
    query: options.query ?? {},
    get(headerName: string) {
      return headerName.toLowerCase() === "authorization" ? options.authorization : undefined;
    },
  };
}

function getState(body: unknown): string {
  return (body as { state: string }).state;
}

async function waitForResponse(response: RouteResponseRecorder): Promise<void> {
  for (let attempts = 0; attempts < 20; attempts += 1) {
    if (response.body !== undefined || response.statusCode !== undefined) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function getSessionToken(body: unknown): string {
  return (body as { sessionToken: string }).sessionToken;
}

function getRunId(body: unknown): string {
  return (body as { backupRun: { id: string } }).backupRun.id;
}

async function getProofPageComplianceEvents(app: ReturnType<typeof createApp>): Promise<ContentComplianceEvent[]> {
  const repository = app.locals.contentComplianceEventRepository as ContentComplianceEventRepository;
  return repository.listByXAccount("11111111-1111-4111-8111-111111111111");
}

class RecordingSupabaseProofPageStore implements SupabaseProofPageStore {
  readonly rows: SupabaseProofPageEntryRow[] = [];
  readonly visibilityUpdates: Array<{
    backup_run_id: string;
    visibility: SupabaseProofPageRow["visibility"];
    revoked_at: string | null;
    updated_at: string;
  }> = [];
  readonly revocationTransactions: Array<{
    proof_page: {
      backup_run_id: string;
      visibility: SupabaseProofPageRow["visibility"];
      revoked_at: string | null;
      updated_at: string;
    };
    content_compliance_event: Omit<SupabaseContentComplianceEventRow, "id" | "created_at"> & {
      id?: string;
      created_at?: string;
    };
  }> = [];

  async insertProofPage(row: {
    backup_run: SupabaseBackupRunRow;
    proof_page: Omit<SupabaseProofPageRow, "id" | "created_at" | "updated_at"> & {
      id?: string;
      created_at?: string;
      updated_at?: string;
    };
  }): Promise<SupabaseProofPageEntryRow> {
    const storedRow: SupabaseProofPageEntryRow = {
      backup_run: { ...row.backup_run },
      proof_page: {
        ...row.proof_page,
        id: row.proof_page.id ?? randomUUID(),
        created_at: row.proof_page.created_at ?? row.backup_run.created_at,
        updated_at: row.proof_page.updated_at ?? row.backup_run.completed_at ?? row.backup_run.created_at,
      },
    };
    this.rows.push(cloneProofPageEntryRow(storedRow));
    return cloneProofPageEntryRow(storedRow);
  }

  async findProofPageByRunId(runId: string): Promise<SupabaseProofPageEntryRow | null> {
    const row = this.rows.find((entry) => entry.proof_page.backup_run_id === runId);
    return row ? cloneProofPageEntryRow(row) : null;
  }

  async listProofPagesByUser(userId: string): Promise<SupabaseProofPageEntryRow[]> {
    return this.rows
      .filter((entry) => entry.proof_page.user_id === userId)
      .sort((left, right) => right.proof_page.created_at.localeCompare(left.proof_page.created_at))
      .map(cloneProofPageEntryRow);
  }

  async updateProofPageVisibility(input: {
    backup_run_id: string;
    visibility: SupabaseProofPageRow["visibility"];
    revoked_at: string | null;
    updated_at: string;
  }): Promise<SupabaseProofPageEntryRow | null> {
    this.visibilityUpdates.push({ ...input });
    return this.applyProofPageVisibility(input);
  }

  async updateProofPageVisibilityAndRecordContentComplianceEvent(input: {
    proof_page: {
      backup_run_id: string;
      visibility: SupabaseProofPageRow["visibility"];
      revoked_at: string | null;
      updated_at: string;
    };
    content_compliance_event: Omit<SupabaseContentComplianceEventRow, "id" | "created_at"> & {
      id?: string;
      created_at?: string;
    };
  }): Promise<SupabaseProofPageEntryRow | null> {
    this.revocationTransactions.push({
      proof_page: { ...input.proof_page },
      content_compliance_event: {
        ...input.content_compliance_event,
        details: { ...input.content_compliance_event.details },
      },
    });
    return this.applyProofPageVisibility(input.proof_page);
  }

  private applyProofPageVisibility(input: {
    backup_run_id: string;
    visibility: SupabaseProofPageRow["visibility"];
    revoked_at: string | null;
    updated_at: string;
  }): SupabaseProofPageEntryRow | null {
    const row = this.rows.find((entry) => entry.proof_page.backup_run_id === input.backup_run_id);

    if (!row) {
      return null;
    }

    row.proof_page.visibility = input.visibility;
    row.proof_page.revoked_at = input.revoked_at ?? undefined;
    row.proof_page.updated_at = input.updated_at;
    return cloneProofPageEntryRow(row);
  }
}

class RecordingSupabaseContentComplianceEventStore implements SupabaseContentComplianceEventStore {
  readonly rows: SupabaseContentComplianceEventRow[] = [];

  async insertContentComplianceEvent(
    row: Omit<SupabaseContentComplianceEventRow, "id" | "created_at"> & {
      id?: string;
      created_at?: string;
    },
  ): Promise<SupabaseContentComplianceEventRow> {
    const storedRow: SupabaseContentComplianceEventRow = {
      ...row,
      id: row.id ?? randomUUID(),
      created_at: row.created_at ?? new Date().toISOString(),
    };
    this.rows.push(storedRow);
    return { ...storedRow, details: { ...storedRow.details } };
  }

  async listContentComplianceEventsByXAccount(xAccountId: string): Promise<SupabaseContentComplianceEventRow[]> {
    return this.rows
      .filter((row) => row.x_account_id === xAccountId)
      .map((row) => ({ ...row, details: { ...row.details } }));
  }
}

function cloneProofPageEntryRow(row: SupabaseProofPageEntryRow): SupabaseProofPageEntryRow {
  return {
    backup_run: { ...row.backup_run },
    proof_page: {
      ...row.proof_page,
      public_payload: {
        ...row.proof_page.public_payload,
        snapshotCounts: { ...row.proof_page.public_payload.snapshotCounts },
        publicMetrics: row.proof_page.public_payload.publicMetrics
          ? { ...row.proof_page.public_payload.publicMetrics }
          : undefined,
        representativeTweets: row.proof_page.public_payload.representativeTweets.map((tweet) => ({
          ...tweet,
          publicMetrics: tweet.publicMetrics ? { ...tweet.publicMetrics } : undefined,
        })),
      },
    },
  };
}
