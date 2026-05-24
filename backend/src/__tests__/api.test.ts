import { describe, expect, it } from "vitest";
import { buildMockOAuthStartResponse } from "../app.js";
import { MockXApiClient } from "../clients/xApiClient.js";
import { fixtureAccount, fixtureProfile, fixtureTweets } from "../fixtures/mockXData.js";
import { MockBackupService } from "../services/mockBackupService.js";

describe("XGuard API prototype", () => {
  it("keeps the mock OAuth scope read-only and minimum for v0", async () => {
    const response = buildMockOAuthStartResponse();

    expect(response.scopes).toEqual(["tweet.read", "users.read", "offline.access"]);
    expect(response.scopes).not.toContain("follows.read");
    expect(response.writesEnabled).toBe(false);
  });

  it("runs a mock backup and serves its proof DTO", async () => {
    const backupService = new MockBackupService(new MockXApiClient(fixtureAccount, fixtureProfile, fixtureTweets));
    const backupResponse = await backupService.runBackup(2);

    expect(backupResponse.backupRun.status).toBe("completed");
    expect(backupResponse.proofPayload.representativeTweets).toHaveLength(2);
    expect(backupResponse.proofPayload.username).toBe("xguard_creator");
  });
});
