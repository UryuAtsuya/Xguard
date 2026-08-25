import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerApp } from "./CustomerApp";
import { completeOAuthCallback, fetchCustomerSession, fetchHealth, runBackup, startOAuth } from "./api";

vi.mock("./api", () => ({
  completeOAuthCallback: vi.fn(),
  fetchCustomerSession: vi.fn(),
  fetchHealth: vi.fn(),
  startOAuth: vi.fn(),
  runBackup: vi.fn(),
}));

const mockedCompleteOAuthCallback = vi.mocked(completeOAuthCallback);
const mockedFetchCustomerSession = vi.mocked(fetchCustomerSession);
const mockedFetchHealth = vi.mocked(fetchHealth);
const mockedStartOAuth = vi.mocked(startOAuth);
const mockedRunBackup = vi.mocked(runBackup);

describe("CustomerApp", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.resetAllMocks();
    window.history.pushState({}, "", "/");
    mockedFetchHealth.mockResolvedValue({
      ok: true,
      service: "xguard-api",
      mode: "prototype",
      xOAuthMode: "mock",
      timestamp: "2026-07-19T00:00:00.000Z",
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
        userId: "user_fixture_001",
        xUserId: "1234567890",
        username: "xguard_creator",
        displayName: "XGuard Creator",
        status: "connected",
        connectedAt: "2026-07-19T00:00:00.000Z",
      },
      sessionToken: "customer-session",
      tokenStorage: "repository-ref-only",
      writesEnabled: false,
    });
    mockedFetchCustomerSession.mockResolvedValue({
      connectedAccount: {
        id: "xacct_fixture_001",
        userId: "user_fixture_001",
        xUserId: "1234567890",
        username: "xguard_creator",
        displayName: "XGuard Creator",
        status: "connected",
        connectedAt: "2026-07-19T00:00:00.000Z",
      },
      writesEnabled: false,
    });
    mockedRunBackup.mockResolvedValue({
      backupRun: {
        id: "backup-1",
        xAccountId: "xacct_fixture_001",
        status: "completed",
        startedAt: "2026-07-19T00:00:00.000Z",
        completedAt: "2026-07-19T00:00:01.000Z",
        tweetLimit: 25,
        tweetsCaptured: 2,
        profilesCaptured: 1,
        apiUnitsUsed: 3,
        estimatedCostUsd: 0.02,
        createdAt: "2026-07-19T00:00:00.000Z",
      },
      proofPayload: {
        version: "v1",
        xUserId: "1234567890",
        username: "xguard_creator",
        displayName: "XGuard Creator",
        backedUpFrom: "2026-07-19T00:00:00.000Z",
        backedUpUntil: "2026-07-19T00:00:01.000Z",
        snapshotCounts: { tweets: 2, profileSnapshots: 1 },
        representativeTweets: [],
        redactionPolicyVersion: "v1",
      },
    });
  });

  it("keeps the existing customer backup flow", async () => {
    render(<CustomerApp />);

    expect(screen.getByText("Xの発信を、非公開で保全")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "積み上げた発信を、あなたの手元に。" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "保全をはじめる" })).toHaveAttribute("href", "#start");
    expect(screen.getByRole("link", { name: "保存される内容を見る" })).toHaveAttribute("href", "#saved-records");
    expect(screen.getByText("読み取り専用")).toBeInTheDocument();
    expect(screen.getByText("パスワード不要")).toBeInTheDocument();
    expect(screen.getByText("初期非公開")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "保全サンプル" })).toHaveTextContent("最大25件");
    expect(screen.getByRole("region", { name: "保全サンプル" })).toHaveTextContent("非公開で保管");
    expect(screen.getByRole("region", { name: "XGuardの接続権限" })).toHaveTextContent("取得する");
    expect(screen.getByRole("region", { name: "XGuardの接続権限" })).toHaveTextContent("プロフィール・直近の投稿");
    expect(screen.getByRole("region", { name: "XGuardの接続権限" })).toHaveTextContent("取得しない");
    expect(screen.getByRole("region", { name: "XGuardの接続権限" })).toHaveTextContent("投稿・DM・フォロー操作");
    expect(screen.queryByText("Private account archive")).not.toBeInTheDocument();
    expect(screen.getByText("パスワードをXGuardに入力することはありません。", { exact: false })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Xで本人確認する" })).toBeEnabled());
    fireEvent.change(screen.getByRole("textbox", { name: "保全するXアカウント" }), {
      target: { value: "xguard_creator" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Xで本人確認する" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "プロフィールと投稿を保全する" })).toBeEnabled());
    expect(mockedStartOAuth).toHaveBeenCalledWith("xguard_creator");
    fireEvent.click(screen.getByRole("button", { name: "プロフィールと投稿を保全する" }));

    await waitFor(() => {
      expect(mockedRunBackup).toHaveBeenCalledWith(25, "customer-session");
      expect(screen.getByText("投稿 2件を保全済み")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Admin/)).not.toBeInTheDocument();
  }, 10_000);

  it("resumes a configured OAuth callback from a one-time URL fragment and removes it", async () => {
    const resumedSessionToken = "a".repeat(43);
    window.history.pushState({}, "", `/#xguard_session=${resumedSessionToken}`);

    render(<CustomerApp />);

    await waitFor(() => expect(screen.getByRole("button", { name: "プロフィールと投稿を保全する" })).toBeEnabled());
    expect(mockedFetchCustomerSession).toHaveBeenCalledWith(resumedSessionToken);
    expect(window.location.hash).toBe("");
    expect(screen.getByText("@xguard_creator")).toBeInTheDocument();
  });

  it("shows a safe retry message after denied X consent and removes provider state from the URL", async () => {
    window.history.pushState({}, "", "/#xguard_oauth_error=consent_denied");

    render(<CustomerApp />);

    expect(await screen.findByText("Xでの本人確認がキャンセルされました。接続する場合はもう一度お試しください。")).toBeInTheDocument();
    expect(window.location.hash).toBe("");
    expect(mockedFetchCustomerSession).not.toHaveBeenCalled();
  });

  it.each(["/admin", "/login", "/unknown"])("renders a customer-side 404 for %s", (path) => {
    window.history.pushState({}, "", path);
    render(<CustomerApp />);

    expect(screen.getByRole("heading", { name: "ページが見つかりません" })).toBeInTheDocument();
    expect(mockedFetchHealth).not.toHaveBeenCalled();
  });
});
