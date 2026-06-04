import request from "supertest";
import { describe, expect, it } from "vitest";
import {
  buildCorsOptions,
  buildOAuthStartResponse,
  buildMockOAuthStartResponse,
  buildOAuthStatusResponse,
  createApp,
} from "../app.js";
import { MockXApiClient } from "../clients/xApiClient.js";
import { createRuntimeConfig } from "../config/runtimeConfig.js";
import { fixtureAccount, fixtureProfile, fixtureTweets } from "../fixtures/mockXData.js";
import { MockBackupService } from "../services/mockBackupService.js";

const httpIt = process.env.CODEX_SANDBOX ? it.skip : it;
const diagnosticToken = "0123456789abcdef0123456789abcdef";

describe("XGuard API prototype", () => {
  const oauthStatusKeys = [
    "callbackUrl",
    "clientIdConfigured",
    "clientSecretConfigured",
    "exposure",
    "missingEnv",
    "mode",
    "scopes",
    "writesEnabled",
  ];
  const disallowedOAuthScopes = [
    "tweet.write",
    "follows.read",
    "follows.write",
    "dm.read",
    "dm.write",
    "direct_messages.read",
    "direct_messages.write",
  ];

  it("keeps the mock OAuth scope read-only and minimum for v0", async () => {
    const response = buildMockOAuthStartResponse();

    expect(response.scopes).toEqual(["tweet.read", "users.read", "offline.access"]);
    expect(response.scopes).not.toContain("follows.read");
    expect(response.mode).toBe("mock");
    expect(response.writesEnabled).toBe(false);
  });

  it("uses configured X OAuth env values when they are available", async () => {
    const response = buildOAuthStartResponse({
      nodeEnv: "test",
      port: 4000,
      appBaseUrl: "http://localhost:4000",
      corsAllowedOrigins: undefined,
      xOAuth: {
        mode: "configured",
        clientId: "real-client-id",
        callbackUrl: "https://xguard.example.com/api/x/oauth/callback",
        clientSecretConfigured: true,
      },
      oauthStatusExposure: "deployment_diagnostic",
      oauthStatusDiagnosticToken: "0123456789abcdef0123456789abcdef",
    });
    const authorizationUrl = new URL(response.authorizationUrl);

    expect(response.mode).toBe("configured");
    expect(authorizationUrl.searchParams.get("client_id")).toBe("real-client-id");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe("https://xguard.example.com/api/x/oauth/callback");
    expect(authorizationUrl.searchParams.get("scope")).toBe("tweet.read users.read offline.access");
  });

  it("reports configured OAuth status without exposing secret material", async () => {
    const config = createRuntimeConfig({
      PORT: "4000",
      APP_BASE_URL: "https://xguard.example.com",
      X_CLIENT_ID: "real-client-id",
      X_CLIENT_SECRET: "super-secret-value",
      X_CALLBACK_URL: "https://xguard.example.com/api/x/oauth/callback",
      X_OAUTH_STATUS_EXPOSURE: "deployment_diagnostic",
      X_OAUTH_STATUS_DIAGNOSTIC_TOKEN: "0123456789abcdef0123456789abcdef",
    });

    const response = buildOAuthStatusResponse(config);

    expect(response).toEqual({
      mode: "configured",
      exposure: "deployment_diagnostic",
      callbackUrl: "https://xguard.example.com/api/x/oauth/callback",
      scopes: ["tweet.read", "users.read", "offline.access"],
      clientIdConfigured: true,
      clientSecretConfigured: true,
      writesEnabled: false,
      missingEnv: [],
    });
    expect(JSON.stringify(response)).not.toContain("real-client-id");
    expect(JSON.stringify(response)).not.toContain("super-secret-value");
    expect(JSON.stringify(response)).not.toContain("0123456789abcdef0123456789abcdef");
    expect(JSON.stringify(response)).not.toContain("vault://");
    expect(JSON.stringify(response)).not.toContain("token");
    expect(Object.keys(response).sort()).toEqual(oauthStatusKeys);
    expect(response.scopes).not.toEqual(expect.arrayContaining(disallowedOAuthScopes));
  });

  it("serves OAuth status over GET without changing the OAuth start response", async () => {
    const config = {
      nodeEnv: "test",
      port: 4000,
      appBaseUrl: "https://xguard.example.com",
      corsAllowedOrigins: undefined,
      xOAuth: {
        mode: "configured" as const,
        clientId: "real-client-id",
        callbackUrl: "https://xguard.example.com/api/x/oauth/callback",
        clientSecretConfigured: true,
      },
      oauthStatusExposure: "deployment_diagnostic" as const,
      oauthStatusDiagnosticToken: "0123456789abcdef0123456789abcdef",
    };

    const statusRoute = findRegisteredGetRoute(createApp(config), "/api/x/oauth/status");
    const statusResponse = createRouteResponseRecorder();
    statusRoute.stack[0].handle(createRouteRequest("0123456789abcdef0123456789abcdef"), statusResponse);
    const startResponse = buildOAuthStartResponse(config);

    expect(statusResponse.statusCode).toBeUndefined();
    expect(statusResponse.body).toEqual({
      mode: "configured",
      exposure: "deployment_diagnostic",
      callbackUrl: "https://xguard.example.com/api/x/oauth/callback",
      scopes: ["tweet.read", "users.read", "offline.access"],
      clientIdConfigured: true,
      clientSecretConfigured: true,
      writesEnabled: false,
      missingEnv: [],
    });
    expect(Object.keys(statusResponse.body as Record<string, unknown>).sort()).toEqual(oauthStatusKeys);
    expect(statusResponse.body).not.toHaveProperty("authorizationUrl");
    expect(JSON.stringify(statusResponse.body)).not.toContain("real-client-id");
    expect(JSON.stringify(statusResponse.body)).not.toContain("super-secret-value");
    expect(JSON.stringify(statusResponse.body)).not.toContain("0123456789abcdef0123456789abcdef");
    expect(JSON.stringify(statusResponse.body)).not.toContain("vault://");
    expect(statusResponse.headers).toEqual({ "cache-control": "no-store" });
    for (const scope of disallowedOAuthScopes) {
      expect(JSON.stringify(statusResponse.body)).not.toContain(scope);
    }
    expect(startResponse.authorizationUrl).toContain("client_id=real-client-id");
    expect(startResponse).not.toHaveProperty("clientSecretConfigured");
  });

  it("disables OAuth status by default when exposure is not explicit", async () => {
    const config = createRuntimeConfig({
      PORT: "4000",
      APP_BASE_URL: "https://xguard.example.com",
      X_CLIENT_ID: "real-client-id",
      X_CLIENT_SECRET: "super-secret-value",
    });

    expect(config.oauthStatusExposure).toBe("disabled");

    const statusRoute = findRegisteredGetRoute(createApp(config), "/api/x/oauth/status");
    const statusResponse = createRouteResponseRecorder();
    statusRoute.stack[0].handle({}, statusResponse);

    expect(statusResponse.statusCode).toBe(404);
    expect(statusResponse.body).toEqual({ error: "oauth_status_not_found" });
    expect(statusResponse.headers).toEqual({ "cache-control": "no-store" });
    expect(JSON.stringify(statusResponse.body)).not.toContain("real-client-id");
    expect(JSON.stringify(statusResponse.body)).not.toContain("super-secret-value");
    expect(JSON.stringify(statusResponse.body)).not.toContain("0123456789abcdef0123456789abcdef");
    expect(JSON.stringify(statusResponse.body)).not.toContain("vault://");
  });

  it("keeps OAuth status disabled when non-production explicitly opts out", async () => {
    const config = createRuntimeConfig({
      NODE_ENV: "test",
      PORT: "4000",
      APP_BASE_URL: "https://xguard.example.com",
      X_CLIENT_ID: "real-client-id",
      X_OAUTH_STATUS_EXPOSURE: "disabled",
    });

    const statusRoute = findRegisteredGetRoute(createApp(config), "/api/x/oauth/status");
    const statusResponse = createRouteResponseRecorder();
    statusRoute.stack[0].handle({}, statusResponse);

    expect(statusResponse.statusCode).toBe(404);
    expect(statusResponse.body).toEqual({ error: "oauth_status_not_found" });
  });

  it("enables OAuth status in production only when deployment diagnostic exposure is explicit", async () => {
    const config = createRuntimeConfig({
      NODE_ENV: "production",
      PORT: "4000",
      APP_BASE_URL: "https://xguard.example.com",
      X_CLIENT_ID: "real-client-id",
      X_CLIENT_SECRET: "super-secret-value",
      X_OAUTH_STATUS_EXPOSURE: "deployment_diagnostic",
      X_OAUTH_STATUS_DIAGNOSTIC_TOKEN: "0123456789abcdef0123456789abcdef",
    });

    const statusRoute = findRegisteredGetRoute(createApp(config), "/api/x/oauth/status");
    const statusResponse = createRouteResponseRecorder();
    statusRoute.stack[0].handle(createRouteRequest("0123456789abcdef0123456789abcdef"), statusResponse);

    expect(statusResponse.statusCode).toBeUndefined();
    expect(statusResponse.body).toEqual({
      mode: "configured",
      exposure: "deployment_diagnostic",
      callbackUrl: "https://xguard.example.com/api/x/oauth/callback",
      scopes: ["tweet.read", "users.read", "offline.access"],
      clientIdConfigured: true,
      clientSecretConfigured: true,
      writesEnabled: false,
      missingEnv: [],
    });
    expect(Object.keys(statusResponse.body as Record<string, unknown>).sort()).toEqual(oauthStatusKeys);
    expect(JSON.stringify(statusResponse.body)).not.toContain("real-client-id");
    expect(JSON.stringify(statusResponse.body)).not.toContain("super-secret-value");
    expect(JSON.stringify(statusResponse.body)).not.toContain("vault://");
    expect(JSON.stringify(statusResponse.body)).not.toContain("token");
    expect(statusResponse.headers).toEqual({ "cache-control": "no-store" });
  });

  it("does not expose deployment diagnostic OAuth status without the matching header token", async () => {
    const config = createRuntimeConfig({
      NODE_ENV: "production",
      APP_BASE_URL: "https://xguard.example.com",
      X_CLIENT_ID: "real-client-id",
      X_OAUTH_STATUS_EXPOSURE: "deployment_diagnostic",
      X_OAUTH_STATUS_DIAGNOSTIC_TOKEN: "0123456789abcdef0123456789abcdef",
    });
    const statusRoute = findRegisteredGetRoute(createApp(config), "/api/x/oauth/status");
    const missingTokenResponse = createRouteResponseRecorder();
    const wrongLengthTokenResponse = createRouteResponseRecorder();
    const sameLengthWrongTokenResponse = createRouteResponseRecorder();
    statusRoute.stack[0].handle(createRouteRequest(), missingTokenResponse);
    statusRoute.stack[0].handle(createRouteRequest("wrong-token"), wrongLengthTokenResponse);
    statusRoute.stack[0].handle(createRouteRequest("0123456789abcdef0123456789abcdee"), sameLengthWrongTokenResponse);

    expect(missingTokenResponse.statusCode).toBe(404);
    expect(missingTokenResponse.body).toEqual({ error: "oauth_status_not_found" });
    expect(wrongLengthTokenResponse.statusCode).toBe(404);
    expect(wrongLengthTokenResponse.body).toEqual({ error: "oauth_status_not_found" });
    expect(sameLengthWrongTokenResponse.statusCode).toBe(404);
    expect(sameLengthWrongTokenResponse.body).toEqual({ error: "oauth_status_not_found" });
    expect(missingTokenResponse.headers).toEqual({ "cache-control": "no-store" });
    expect(wrongLengthTokenResponse.headers).toEqual({ "cache-control": "no-store" });
    expect(sameLengthWrongTokenResponse.headers).toEqual({ "cache-control": "no-store" });
  });

  httpIt("rejects missing and mismatched diagnostic tokens at the HTTP boundary", async () => {
    const config = createRuntimeConfig({
      NODE_ENV: "production",
      APP_BASE_URL: "https://xguard.example.com",
      X_CLIENT_ID: "real-client-id",
      X_OAUTH_STATUS_EXPOSURE: "deployment_diagnostic",
      X_OAUTH_STATUS_DIAGNOSTIC_TOKEN: diagnosticToken,
    });
    const app = createApp(config);

    const missingTokenResponse = await request(app).get("/api/x/oauth/status");
    const mismatchedTokenResponse = await request(app)
      .get("/api/x/oauth/status")
      .set("x-xguard-diagnostic-token", "0123456789abcdef0123456789abcdee");

    for (const response of [missingTokenResponse, mismatchedTokenResponse]) {
      expect(response.status).toBe(404);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.body).toEqual({ error: "oauth_status_not_found" });
      expect(response.text).not.toContain(diagnosticToken);
    }
  });

  httpIt("serves deployment diagnostic status at the HTTP boundary only for the matching token", async () => {
    const config = createRuntimeConfig({
      NODE_ENV: "production",
      APP_BASE_URL: "https://xguard.example.com",
      X_CLIENT_ID: "real-client-id",
      X_CLIENT_SECRET: "super-secret-value",
      X_OAUTH_STATUS_EXPOSURE: "deployment_diagnostic",
      X_OAUTH_STATUS_DIAGNOSTIC_TOKEN: diagnosticToken,
    });

    const response = await request(createApp(config))
      .get("/api/x/oauth/status")
      .set("x-xguard-diagnostic-token", diagnosticToken);

    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toMatchObject({
      exposure: "deployment_diagnostic",
      scopes: ["tweet.read", "users.read", "offline.access"],
      writesEnabled: false,
    });
    expect(response.text).not.toContain("real-client-id");
    expect(response.text).not.toContain("super-secret-value");
    expect(response.text).not.toContain(diagnosticToken);
  });

  it("keeps deployment diagnostic OAuth status unavailable when its token is unset outside production", async () => {
    const config = {
      nodeEnv: "test",
      port: 4000,
      appBaseUrl: "https://xguard.example.com",
      corsAllowedOrigins: undefined,
      xOAuth: {
        mode: "mock" as const,
        clientId: "mock" as const,
        callbackUrl: "https://xguard.example.com/api/x/oauth/callback",
        clientSecretConfigured: false as const,
        missingEnv: ["X_CLIENT_ID"],
      },
      oauthStatusExposure: "deployment_diagnostic" as const,
      oauthStatusDiagnosticToken: undefined,
    };
    const statusRoute = findRegisteredGetRoute(createApp(config), "/api/x/oauth/status");
    const statusResponse = createRouteResponseRecorder();

    statusRoute.stack[0].handle(createRouteRequest("0123456789abcdef0123456789abcdef"), statusResponse);

    expect(statusResponse.statusCode).toBe(404);
    expect(statusResponse.body).toEqual({ error: "oauth_status_not_found" });
    expect(statusResponse.headers).toEqual({ "cache-control": "no-store" });
  });

  it("rejects deployment diagnostic exposure without a sufficiently strong token", async () => {
    expect(() =>
      createRuntimeConfig({
        NODE_ENV: "test",
        X_OAUTH_STATUS_EXPOSURE: "deployment_diagnostic",
      }),
    ).toThrow("invalid_runtime_env:X_OAUTH_STATUS_DIAGNOSTIC_TOKEN");
    expect(() =>
      createRuntimeConfig({
        NODE_ENV: "production",
        X_OAUTH_STATUS_EXPOSURE: "deployment_diagnostic",
        X_OAUTH_STATUS_DIAGNOSTIC_TOKEN: " ",
      }),
    ).toThrow("invalid_runtime_env:X_OAUTH_STATUS_DIAGNOSTIC_TOKEN");
    expect(() =>
      createRuntimeConfig({
        NODE_ENV: "production",
        X_OAUTH_STATUS_EXPOSURE: "deployment_diagnostic",
        X_OAUTH_STATUS_DIAGNOSTIC_TOKEN: "too-short",
      }),
    ).toThrow("invalid_runtime_env:X_OAUTH_STATUS_DIAGNOSTIC_TOKEN");
  });

  it("rejects unsupported OAuth status exposure values", async () => {
    expect(() =>
      createRuntimeConfig({
        X_OAUTH_STATUS_EXPOSURE: "public",
      }),
    ).toThrow("invalid_runtime_env:X_OAUTH_STATUS_EXPOSURE");
  });

  it("limits CORS to configured origins in production", async () => {
    const config = createRuntimeConfig({
      NODE_ENV: "production",
      APP_BASE_URL: "https://app.xguard.example.com/app",
    });
    const corsOptions = buildCorsOptions(config);
    const allowed = await evaluateCorsOrigin(corsOptions.origin, "https://app.xguard.example.com");
    const sameOriginOrServer = await evaluateCorsOrigin(corsOptions.origin, undefined);
    const rejected = await evaluateCorsOrigin(corsOptions.origin, "https://evil.example.com");

    expect(config.corsAllowedOrigins).toEqual(["https://app.xguard.example.com"]);
    expect(allowed).toBe(true);
    expect(sameOriginOrServer).toBe(true);
    expect(rejected).toBe(false);
  });

  it("accepts comma-separated CORS origins", async () => {
    const config = createRuntimeConfig({
      CORS_ORIGINS: "https://app.xguard.example.com, https://admin.xguard.example.com/path",
    });
    const corsOptions = buildCorsOptions(config);

    expect(config.corsAllowedOrigins).toEqual(["https://app.xguard.example.com", "https://admin.xguard.example.com"]);
    expect(await evaluateCorsOrigin(corsOptions.origin, "https://admin.xguard.example.com")).toBe(true);
    expect(await evaluateCorsOrigin(corsOptions.origin, "https://other.example.com")).toBe(false);
  });

  it("builds the fallback callback URL without a doubled slash", async () => {
    const config = createRuntimeConfig({
      PORT: "4000",
      APP_BASE_URL: "http://localhost:4000",
    });

    expect(config.xOAuth.callbackUrl).toBe("http://localhost:4000/api/x/oauth/callback");
  });

  it("runs a mock backup and serves its proof DTO", async () => {
    const backupService = new MockBackupService(new MockXApiClient(fixtureAccount, fixtureProfile, fixtureTweets));
    const backupResponse = await backupService.runBackup(2);

    expect(backupResponse.backupRun.status).toBe("completed");
    expect(backupResponse.proofPayload.representativeTweets).toHaveLength(2);
    expect(backupResponse.proofPayload.username).toBe("xguard_creator");
  });
});

function findRegisteredGetRoute(
  app: ReturnType<typeof createApp>,
  path: string,
): { stack: Array<{ handle: (request: unknown, response: { json: (body: unknown) => void }) => void }> } {
  const router = app.router as {
    stack: Array<{
      route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: Array<{ handle: (request: unknown, response: { json: (body: unknown) => void }) => void }>;
      };
    }>;
  };
  const route = router.stack.find((layer) => layer.route?.path === path && layer.route.methods.get)?.route;

  if (!route) {
    throw new Error(`missing GET route: ${path}`);
  }

  return route;
}

type RouteResponseRecorder = {
  statusCode: number | undefined;
  body: unknown;
  headers: Record<string, string>;
  set: (headerName: string, value: string) => RouteResponseRecorder;
  status: (statusCode: number) => RouteResponseRecorder;
  json: (body: unknown) => void;
};

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

function createRouteRequest(oauthStatusDiagnosticToken?: string) {
  return {
    get(headerName: string) {
      return headerName.toLowerCase() === "x-xguard-diagnostic-token" ? oauthStatusDiagnosticToken : undefined;
    },
  };
}

async function evaluateCorsOrigin(
  originOption: ReturnType<typeof buildCorsOptions>["origin"],
  requestOrigin: string | undefined,
): Promise<unknown> {
  if (typeof originOption !== "function") {
    return originOption;
  }

  return await new Promise((resolve, reject) => {
    originOption(requestOrigin, (error, allow) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(allow);
    });
  });
}
