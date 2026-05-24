import cors from "cors";
import express from "express";
import { z } from "zod";
import { MockXApiClient } from "./clients/xApiClient.js";
import { fixtureAccount, fixtureProfile, fixtureTweets } from "./fixtures/mockXData.js";
import { InMemoryTokenRepository } from "./repositories/tokenRepository.js";
import { MockBackupService } from "./services/mockBackupService.js";

export const V0_READ_ONLY_OAUTH_SCOPES = ["tweet.read", "users.read", "offline.access"] as const;

export function buildMockOAuthStartResponse() {
  const scopeParam = V0_READ_ONLY_OAUTH_SCOPES.join("%20");

  return {
    authorizationUrl: `https://x.com/i/oauth2/authorize?client_id=mock&scope=${scopeParam}`,
    scopes: [...V0_READ_ONLY_OAUTH_SCOPES],
    state: "mock-state",
    writesEnabled: false,
  };
}

export function createApp() {
  const app = express();
  const tokenRepository = new InMemoryTokenRepository();
  const backupService = new MockBackupService(new MockXApiClient(fixtureAccount, fixtureProfile, fixtureTweets));
  const backupRuns = new Map<string, Awaited<ReturnType<MockBackupService["runBackup"]>>>();

  app.use(cors());
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      service: "xguard-api",
      mode: "prototype",
      timestamp: new Date().toISOString(),
    });
  });

  app.get("/api/x/oauth/start", (_request, response) => {
    response.json(buildMockOAuthStartResponse());
  });

  app.get("/api/x/oauth/callback", async (request, response) => {
    const query = z.object({ code: z.string().min(1), state: z.string().min(1) }).safeParse(request.query);

    if (!query.success) {
      response.status(400).json({ error: "invalid_oauth_callback", details: query.error.flatten().fieldErrors });
      return;
    }

    await tokenRepository.saveXToken({
      xAccountId: fixtureAccount.id,
      provider: "x",
      scope: [...V0_READ_ONLY_OAUTH_SCOPES],
      accessTokenRef: "vault://x/oauth/access/mock",
      refreshTokenRef: "vault://x/oauth/refresh/mock",
    });

    response.json({
      connectedAccount: fixtureAccount,
      tokenStorage: "repository-ref-only",
      writesEnabled: false,
    });
  });

  app.post("/api/backup/run", async (request, response) => {
    const body = z.object({ tweetLimit: z.number().int().min(1).max(100).default(25) }).safeParse(request.body ?? {});

    if (!body.success) {
      response.status(400).json({ error: "invalid_backup_request", details: body.error.flatten().fieldErrors });
      return;
    }

    const result = await backupService.runBackup(body.data.tweetLimit);
    backupRuns.set(result.backupRun.id, result);
    response.status(201).json(result);
  });

  app.get("/api/backup/status/:runId", (request, response) => {
    const result = backupRuns.get(request.params.runId);

    if (!result) {
      response.status(404).json({ error: "backup_run_not_found" });
      return;
    }

    response.json(result.backupRun);
  });

  app.get("/api/recovery/:runId/proof", (request, response) => {
    const result = backupRuns.get(request.params.runId);

    if (!result) {
      response.status(404).json({ error: "proof_payload_not_found" });
      return;
    }

    response.json(result.proofPayload);
  });

  return app;
}
