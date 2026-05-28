import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { fetchHealth, runBackup, startOAuth } from "./api";

vi.mock("./api", () => ({
  fetchHealth: vi.fn(),
  startOAuth: vi.fn(),
  runBackup: vi.fn(),
}));

const mockedFetchHealth = vi.mocked(fetchHealth);
const mockedStartOAuth = vi.mocked(startOAuth);
const mockedRunBackup = vi.mocked(runBackup);

describe("App", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.resetAllMocks();

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

  it("shows the mobile-first XGuard shell and API readiness", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "消える前に、証明を残す。" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Xを安全に接続/ })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("mock APIに接続済み")).toBeInTheDocument();
    });
  });

  it("runs the mock backup and shows proof preview data", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /バックアップを実行/ }));

    await waitFor(() => {
      expect(mockedRunBackup).toHaveBeenCalledWith(25);
      expect(screen.getByText("@xguard_creator")).toBeInTheDocument();
      expect(screen.getByText("証明ページDTOを作成済み")).toBeInTheDocument();
    });
  });
});
