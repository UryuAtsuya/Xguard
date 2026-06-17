import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          service: "xguard-api",
          mode: "prototype",
          xOAuthMode: "mock",
          timestamp: "2026-06-17T00:00:00.000Z",
        }),
      })),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("shows the night-work cast recovery mockup", () => {
    render(<App />);

    expect(screen.getByText("消える前に、営業再開キットを残す。")).toBeInTheDocument();
    expect(screen.getByText("復旧キットを見る")).toBeInTheDocument();
    expect(screen.getByText("アカウントで困っている")).toBeInTheDocument();
    expect(screen.getByAltText("プロフィールと保存状態のプレビュー")).toBeInTheDocument();
  });

  it("shows the live prototype flow controls", async () => {
    render(<App />);

    expect(screen.getByText("実 API で backup と proof まで確認する。")).toBeInTheDocument();
    expect(screen.getByText("Read-only X 接続")).toBeInTheDocument();
    expect(screen.getByText("Backup 実行").closest("button")).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByText("prototype / OAuth mock")).toBeInTheDocument();
    });
  });

  it("runs the mock backup and proof publish flow from the console", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/health")) {
        return jsonResponse({
          ok: true,
          service: "xguard-api",
          mode: "prototype",
          xOAuthMode: "mock",
          timestamp: "2026-06-17T00:00:00.000Z",
        });
      }

      if (url.endsWith("/api/x/oauth/start")) {
        return jsonResponse({
          authorizationUrl: "https://x.com/i/oauth2/authorize?state=state-1",
          scopes: ["tweet.read", "users.read", "offline.access"],
          state: "state-1",
          mode: "mock",
          callbackUrl: "http://localhost:4000/api/x/oauth/callback",
          writesEnabled: false,
        });
      }

      if (url.includes("/api/x/oauth/callback")) {
        return jsonResponse({
          connectedAccount: { id: "x_account_001", username: "xguard_creator" },
          sessionToken: "session-1",
          tokenStorage: "repository-ref-only",
          writesEnabled: false,
        });
      }

      if (url.endsWith("/api/backup/run")) {
        expect(init?.headers).toMatchObject({ authorization: "Bearer session-1" });
        return jsonResponse({
          backupRun: {
            id: "run-1",
            xAccountId: "x_account_001",
            status: "completed",
            completedAt: "2026-06-17T00:01:00.000Z",
            tweetLimit: 25,
            tweetsCaptured: 2,
            profilesCaptured: 1,
            apiUnitsUsed: 2,
            estimatedCostUsd: 0.02,
            createdAt: "2026-06-17T00:00:00.000Z",
          },
        });
      }

      if (url.endsWith("/api/recovery/run-1/proof/visibility")) {
        expect(init?.headers).toMatchObject({ authorization: "Bearer session-1" });
        return jsonResponse({ runId: "run-1", visibility: "public", revokedAt: null });
      }

      if (url.endsWith("/api/recovery/run-1/proof")) {
        expect(init?.headers).toMatchObject({ authorization: "Bearer session-1" });
        return jsonResponse({
          version: "v1",
          xUserId: "x_user_001",
          username: "xguard_creator",
          displayName: "XGuard Creator",
          backedUpFrom: "2026-06-17T00:00:00.000Z",
          backedUpUntil: "2026-06-17T00:01:00.000Z",
          snapshotCounts: { tweets: 2, profileSnapshots: 1 },
          representativeTweets: [
            {
              tweetId: "tweet-1",
              text: "XGuard proof preview",
              postedAt: "2026-06-17T00:00:00.000Z",
            },
          ],
          redactionPolicyVersion: "v1",
        });
      }

      return jsonResponse({ error: "not_found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    fireEvent.click(getButtonByText("Read-only X 接続"));
    await waitFor(() => {
      expect(screen.getByText("X 接続済み")).toBeInTheDocument();
    });

    fireEvent.click(getButtonByText("Backup 実行"));
    await waitFor(() => {
      expect(screen.getByText("2 posts")).toBeInTheDocument();
    });

    fireEvent.click(getButtonByText("Proof 公開"));
    await waitFor(() => {
      expect(screen.getByText("XGuard proof preview")).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/backup/run", expect.any(Object));
  });

  it("includes archive and operator surfaces for design review", () => {
    render(<App />);

    expect(screen.getByText("X風ではなく、再利用しやすい順に整理。")).toBeInTheDocument();
    expect(screen.getByText("運営側は、高密度に要対応だけを見る。")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "要対応ユーザー一覧" })).toBeInTheDocument();
  });
});

function getButtonByText(text: string): HTMLButtonElement {
  const button = screen.getByText(text).closest("button");

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`button_not_found:${text}`);
  }

  return button;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
