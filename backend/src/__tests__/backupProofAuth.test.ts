import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { BackupRunEntry } from "../app.js";
import { createApp } from "../app.js";

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
    const entry = app.locals.backupRuns.get(runId) as BackupRunEntry;
    app.locals.backupRuns.set(runId, { ...entry, visibility: "public" });

    const proofResponse = await invokeRoute(app, "get", "/api/recovery/:runId/proof", {
      authorization: `Bearer ${sessionToken}`,
      params: { runId },
    });

    expect(proofResponse.statusCode).toBeUndefined();
    expect(JSON.stringify(proofResponse.body)).not.toContain("vault://");
    expect(JSON.stringify(proofResponse.body)).not.toContain("accessToken");
    expect(JSON.stringify(proofResponse.body)).not.toContain("refreshToken");
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
  });

  it("hides private and revoked proof payloads from the owner", async () => {
    const app = createApp();
    const sessionToken = await createSession(app);
    const privateRunId = await createBackupRun(app, sessionToken);
    const revokedRunId = await createBackupRun(app, sessionToken);

    const privateEntry = app.locals.backupRuns.get(privateRunId) as BackupRunEntry;
    app.locals.backupRuns.set(privateRunId, { ...privateEntry, visibility: "private" });

    const revokedEntry = app.locals.backupRuns.get(revokedRunId) as BackupRunEntry;
    app.locals.backupRuns.set(revokedRunId, {
      ...revokedEntry,
      visibility: "revoked",
      revokedAt: "2026-06-06T04:30:00.000Z",
    });

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

type HttpMethod = "get" | "post";

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
