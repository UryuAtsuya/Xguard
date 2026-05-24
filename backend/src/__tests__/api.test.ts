import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("XGuard API prototype", () => {
  it("runs a mock backup and serves its proof DTO", async () => {
    const app = createApp();
    const backupResponse = await request(app).post("/api/backup/run").send({ tweetLimit: 2 }).expect(201);

    expect(backupResponse.body.backupRun.status).toBe("completed");
    expect(backupResponse.body.proofPayload.representativeTweets).toHaveLength(2);

    const runId = backupResponse.body.backupRun.id;
    const proofResponse = await request(app).get(`/api/recovery/${runId}/proof`).expect(200);
    expect(proofResponse.body.username).toBe("xguard_creator");
  });
});
