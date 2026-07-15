import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { completeOAuthCallback, fetchAdminDatabaseSnapshot, fetchHealth, runBackup, startOAuth } from "./api";

vi.mock("./api", () => ({
  completeOAuthCallback: vi.fn(),
  fetchAdminDatabaseSnapshot: vi.fn(),
  fetchHealth: vi.fn(),
  startOAuth: vi.fn(),
  runBackup: vi.fn(),
}));

const mockedCompleteOAuthCallback = vi.mocked(completeOAuthCallback);
const mockedFetchAdminDatabaseSnapshot = vi.mocked(fetchAdminDatabaseSnapshot);
const mockedFetchHealth = vi.mocked(fetchHealth);
const mockedStartOAuth = vi.mocked(startOAuth);
const mockedRunBackup = vi.mocked(runBackup);

describe("App", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    window.history.pushState({}, "", "/");

    mockedFetchHealth.mockResolvedValue({
      ok: true,
      service: "xguard-api",
      mode: "prototype",
      xOAuthMode: "mock",
      timestamp: "2026-05-28T00:00:00.000Z",
    });

    mockedStartOAuth.mockResolvedValue({
      authorizationUrl: "https://x.com/i/oauth2/authorize?client_id=mock",
      scopes: ["tweet.read", "users.read", "offline.access"],
      state: "mock-state",
      mode: "mock",
      callbackUrl: "http://localhost:4000/api/x/oauth/callback",
      writesEnabled: false,
    });
    mockedCompleteOAuthCallback.mockResolvedValue({
      connectedAccount: {
        id: "xacct_fixture_001",
        username: "xguard_creator",
        displayName: "XGuard Creator",
      },
      sessionToken: "session-token-1",
      tokenStorage: "repository-ref-only",
      writesEnabled: false,
    });
    mockedFetchAdminDatabaseSnapshot.mockResolvedValue({
      generatedAt: "2026-05-28T00:00:02.000Z",
      tables: [
        {
          name: "backup_runs",
          rowCount: 1,
          source: "repository",
          writable: false,
          lastUpdatedAt: "2026-05-28T00:00:01.000Z",
        },
        {
          name: "proof_pages",
          rowCount: 1,
          source: "repository",
          writable: false,
          lastUpdatedAt: "2026-05-28T00:00:01.000Z",
        },
        {
          name: "content_compliance_events",
          rowCount: 0,
          source: "repository",
          writable: false,
        },
      ],
      backupRuns: [
        {
          id: "backup-1",
          xAccountId: "xacct_fixture_001",
          status: "completed",
          startedAt: "2026-05-28T00:00:00.000Z",
          completedAt: "2026-05-28T00:00:01.000Z",
          tweetLimit: 25,
          tweetsCaptured: 2,
          profilesCaptured: 1,
          apiUnitsUsed: 3,
          estimatedCostUsd: 0.02,
          rateLimitRemaining: 1499,
          createdAt: "2026-05-28T00:00:00.000Z",
        },
      ],
      proofPages: [
        {
          runId: "backup-1",
          userId: "user_fixture_001",
          xAccountId: "xacct_fixture_001",
          visibility: "private",
          revokedAt: null,
          createdAt: "2026-05-28T00:00:00.000Z",
          updatedAt: "2026-05-28T00:00:01.000Z",
        },
      ],
      contentComplianceEvents: [],
    });

    mockedRunBackup.mockResolvedValue({
      backupRun: {
        id: "backup-1",
        xAccountId: "xacct_fixture_001",
        status: "completed",
        startedAt: "2026-05-28T00:00:00.000Z",
        completedAt: "2026-05-28T00:00:01.000Z",
        tweetLimit: 25,
        tweetsCaptured: 2,
        profilesCaptured: 1,
        apiUnitsUsed: 3,
        estimatedCostUsd: 0.02,
        rateLimitRemaining: 1499,
        createdAt: "2026-05-28T00:00:00.000Z",
      },
      proofPayload: {
        version: "v1",
        xUserId: "1234567890",
        username: "xguard_creator",
        displayName: "XGuard Creator",
        profileSummary: "Creator building in public.",
        backedUpFrom: "2026-05-24T04:30:00.000Z",
        backedUpUntil: "2026-05-24T04:30:00.000Z",
        snapshotCounts: {
          tweets: 2,
          profileSnapshots: 1,
        },
        representativeTweets: [
          {
            tweetId: "1800000000000000001",
            text: "XGuard is a read-only backup and proof-page prototype.",
            postedAt: "2026-05-20T09:00:00.000Z",
          },
        ],
        redactionPolicyVersion: "v1",
      },
    });
  });

  it(
    "shows the mobile-first XGuard shell and API readiness",
    async () => {
      render(<App />);

      expect(screen.getByRole("heading", { name: "消える前に、証明を残す。" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Xを安全に接続/ })).toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "管理画面" })).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "管理側の画面" })).not.toBeInTheDocument();

      await waitFor(() => {
        expect(screen.getByText("mock APIに接続済み")).toBeInTheDocument();
      });
    },
    15_000,
  );

  it("runs the mock backup and shows proof preview data", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Xを安全に接続/ }));
    await waitFor(() => {
      expect(mockedCompleteOAuthCallback).toHaveBeenCalledWith("mock-authorization-code", "mock-state");
    });

    fireEvent.click(screen.getByRole("button", { name: /今すぐバックアップ/ }));

    await waitFor(() => {
      expect(mockedRunBackup).toHaveBeenCalledWith(25, "session-token-1");
      expect(screen.getAllByText("@xguard_creator").length).toBeGreaterThan(0);
      expect(screen.getByText("証明ページDTOを作成済み")).toBeInTheDocument();
    });
  });

  it("shows database snapshot tables in the admin console", async () => {
    window.history.pushState({}, "", "/admin");
    render(<App />);

    expect(screen.getByRole("link", { name: "顧客画面を確認" })).toHaveAttribute("href", "/");
    fireEvent.click(screen.getByRole("button", { name: "接続" }));

    await waitFor(() => {
      expect(mockedFetchAdminDatabaseSnapshot).toHaveBeenCalledWith("session-token-1");
      expect(screen.getByRole("region", { name: "管理側の画面" })).toBeInTheDocument();
      expect(screen.getByText("backup_runs")).toBeInTheDocument();
      expect(screen.getByText("proof_pages")).toBeInTheDocument();
      expect(screen.getByText("content_compliance_events")).toBeInTheDocument();
      expect(screen.getAllByText("DB snapshotを取得済み").length).toBeGreaterThan(0);
    });
  });
});
