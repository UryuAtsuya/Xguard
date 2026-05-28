import { describe, expect, it } from "vitest";
import { buildOAuthStartResponse, buildMockOAuthStartResponse } from "../app.js";
import { MockXApiClient } from "../clients/xApiClient.js";
import { createRuntimeConfig } from "../config/runtimeConfig.js";
import { fixtureAccount, fixtureProfile, fixtureTweets } from "../fixtures/mockXData.js";
import { MockBackupService } from "../services/mockBackupService.js";

describe("XGuard API prototype", () => {
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
    });
    const authorizationUrl = new URL(response.authorizationUrl);

    expect(response.mode).toBe("configured");
    expect(authorizationUrl.searchParams.get("client_id")).toBe("real-client-id");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe("https://xguard.example.com/api/x/oauth/callback");
    expect(authorizationUrl.searchParams.get("scope")).toBe("tweet.read users.read offline.access");
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
