import { describe, expect, it } from "vitest";
import { createInMemoryApiUsageLedgerService, estimateXApiReadCostUsd } from "../services/apiUsageLedger.js";

describe("API usage ledger", () => {
  it("uses conservative X API read pricing until Developer Console values are confirmed", () => {
    expect(estimateXApiReadCostUsd("post", 25)).toBe(0.125);
    expect(estimateXApiReadCostUsd("user", 1)).toBe(0.01);
    expect(estimateXApiReadCostUsd("follower", 100)).toBe(1);
  });

  it("rejects invalid resource counts before estimating cost", () => {
    for (const resourceCount of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => estimateXApiReadCostUsd("post", resourceCount)).toThrow(
        "invalid_non_negative_integer:resourceCount",
      );
    }
  });

  it("attaches usage events and cost totals to a backup run", async () => {
    const ledger = createInMemoryApiUsageLedgerService();
    const backupRun = await ledger.startBackupRun({
      xAccountId: "x-account-1",
      tweetLimit: 2,
      startedAt: "2026-05-26T04:30:00.000Z",
    });

    await ledger.recordApiUsage({
      userId: "user-1",
      xAccountId: "x-account-1",
      backupRunId: backupRun.id,
      endpoint: "GET /2/users/me",
      resourceType: "user",
      resourceCount: 1,
      ownedRead: true,
      statusCode: 200,
      occurredAt: "2026-05-26T04:30:01.000Z",
    });
    await ledger.recordApiUsage({
      userId: "user-1",
      xAccountId: "x-account-1",
      backupRunId: backupRun.id,
      endpoint: "GET /2/users/:id/tweets",
      resourceType: "post",
      resourceCount: 2,
      ownedRead: true,
      rateLimitRemaining: 1499,
      rateLimitResetAt: "2026-05-26T04:45:00.000Z",
      statusCode: 200,
      occurredAt: "2026-05-26T04:30:02.000Z",
    });

    const completed = await ledger.completeBackupRun({
      backupRunId: backupRun.id,
      completedAt: "2026-05-26T04:30:03.000Z",
      tweetsCaptured: 2,
      profilesCaptured: 1,
    });

    expect(completed).toMatchObject({
      status: "completed",
      tweetsCaptured: 2,
      profilesCaptured: 1,
      apiUnitsUsed: 3,
      estimatedCostUsd: 0.02,
      rateLimitRemaining: 1499,
      rateLimitResetAt: "2026-05-26T04:45:00.000Z",
    });
  });

  it("rejects invalid backup and usage quantities before repository writes", async () => {
    const ledger = createInMemoryApiUsageLedgerService();
    const backupRun = await ledger.startBackupRun({
      xAccountId: "x-account-1",
      tweetLimit: 2,
      startedAt: "2026-05-27T04:30:00.000Z",
    });

    await expect(
      ledger.startBackupRun({
        xAccountId: "x-account-1",
        tweetLimit: -1,
        startedAt: "2026-05-27T04:30:00.000Z",
      }),
    ).rejects.toThrow("invalid_non_negative_integer:tweetLimit");
    await expect(
      ledger.recordApiUsage({
        userId: "user-1",
        xAccountId: "x-account-1",
        backupRunId: backupRun.id,
        endpoint: "GET /2/users/:id/tweets",
        resourceType: "post",
        resourceCount: 0.5,
        ownedRead: true,
        statusCode: 200,
        occurredAt: "2026-05-27T04:30:01.000Z",
      }),
    ).rejects.toThrow("invalid_non_negative_integer:resourceCount");
    await expect(
      ledger.recordApiUsage({
        userId: "user-1",
        xAccountId: "x-account-1",
        backupRunId: backupRun.id,
        endpoint: "GET /2/users/me",
        resourceType: "user",
        resourceCount: 1,
        ownedRead: true,
        rateLimitRemaining: Number.NaN,
        statusCode: 200,
        occurredAt: "2026-05-27T04:30:02.000Z",
      }),
    ).rejects.toThrow("invalid_non_negative_integer:rateLimitRemaining");
    await expect(
      ledger.completeBackupRun({
        backupRunId: backupRun.id,
        completedAt: "2026-05-27T04:30:03.000Z",
        tweetsCaptured: Number.POSITIVE_INFINITY,
        profilesCaptured: 1,
      }),
    ).rejects.toThrow("invalid_non_negative_integer:tweetsCaptured");
  });
});
