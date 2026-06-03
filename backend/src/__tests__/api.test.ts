import { describe, expect, it } from "vitest";
import { buildOAuthStartResponse, buildMockOAuthStartResponse, buildOAuthStatusResponse, createApp } from "../app.js";
import { MockXApiClient } from "../clients/xApiClient.js";
import { createRuntimeConfig } from "../config/runtimeConfig.js";
import { fixtureAccount, fixtureProfile, fixtureTweets } from "../fixtures/mockXData.js";
import { MockBackupService } from "../services/mockBackupService.js";

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
      port: 4000,
      appBaseUrl: "http://localhost:4000",
      xOAuth: {
        mode: "configured",
        clientId: "real-client-id",
        callbackUrl: "https://xguard.example.com/api/x/oauth/callback",
        clientSecretConfigured: true,
      },
      oauthStatusExposure: "deployment_diagnostic",
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
    expect(JSON.stringify(response)).not.toContain("vault://");
    expect(JSON.stringify(response)).not.toContain("token");
    expect(Object.keys(response).sort()).toEqual(oauthStatusKeys);
    expect(response.scopes).not.toEqual(expect.arrayContaining(disallowedOAuthScopes));
  });

  it("serves OAuth status over GET without changing the OAuth start response", async () => {
    const config = {
      port: 4000,
      appBaseUrl: "https://xguard.example.com",
      xOAuth: {
        mode: "configured" as const,
        clientId: "real-client-id",
        callbackUrl: "https://xguard.example.com/api/x/oauth/callback",
        clientSecretConfigured: true,
      },
      oauthStatusExposure: "deployment_diagnostic" as const,
    };

    const statusRoute = findRegisteredGetRoute(createApp(config), "/api/x/oauth/status");
    const statusResponse = createRouteResponseRecorder();
    statusRoute.stack[0].handle({}, statusResponse);
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
    expect(JSON.stringify(statusResponse.body)).not.toContain("vault://");
    for (const scope of disallowedOAuthScopes) {
      expect(JSON.stringify(statusResponse.body)).not.toContain(scope);
    }
    expect(startResponse.authorizationUrl).toContain("client_id=real-client-id");
    expect(startResponse).not.toHaveProperty("clientSecretConfigured");
  });

  it("disables OAuth status by default in production", async () => {
    const config = createRuntimeConfig({
      NODE_ENV: "production",
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
    expect(JSON.stringify(statusResponse.body)).not.toContain("real-client-id");
    expect(JSON.stringify(statusResponse.body)).not.toContain("super-secret-value");
    expect(JSON.stringify(statusResponse.body)).not.toContain("vault://");
  });

  it("enables OAuth status in production only when deployment diagnostic exposure is explicit", async () => {
    const config = createRuntimeConfig({
      NODE_ENV: "production",
      PORT: "4000",
      APP_BASE_URL: "https://xguard.example.com",
      X_CLIENT_ID: "real-client-id",
      X_CLIENT_SECRET: "super-secret-value",
      X_OAUTH_STATUS_EXPOSURE: "deployment_diagnostic",
    });

    const statusRoute = findRegisteredGetRoute(createApp(config), "/api/x/oauth/status");
    const statusResponse = createRouteResponseRecorder();
    statusRoute.stack[0].handle({}, statusResponse);

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
  status: (statusCode: number) => RouteResponseRecorder;
  json: (body: unknown) => void;
};

function createRouteResponseRecorder(): RouteResponseRecorder {
  const response = {
    statusCode: undefined as number | undefined,
    body: undefined as unknown,
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
