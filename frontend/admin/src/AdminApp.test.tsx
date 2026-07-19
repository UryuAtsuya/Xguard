import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Session } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminApp } from "./AdminApp";
import {
  fetchAdminDatabaseSnapshot,
  fetchAdminMembers,
  fetchAdminSession,
} from "./api";
import {
  exchangeMagicLinkCode,
  getCurrentSession,
  sendMagicLink,
  signOutAdmin,
} from "./auth";

vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return {
    ...actual,
    fetchAdminDatabaseSnapshot: vi.fn(),
    fetchAdminMembers: vi.fn(),
    fetchAdminSession: vi.fn(),
    inviteAdminMember: vi.fn(),
    updateAdminMember: vi.fn(),
  };
});

vi.mock("./auth", () => ({
  exchangeMagicLinkCode: vi.fn(),
  getCurrentSession: vi.fn(),
  sendMagicLink: vi.fn(),
  signOutAdmin: vi.fn(),
}));

const session = { access_token: "admin-jwt" } as Session;
const owner = {
  id: "owner-id",
  email: "owner@example.com",
  role: "owner" as const,
  status: "active" as const,
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
};

describe("AdminApp", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.resetAllMocks();
    window.history.pushState({}, "", "/login");
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    vi.mocked(exchangeMagicLinkCode).mockResolvedValue(session);
    vi.mocked(fetchAdminSession).mockResolvedValue({ member: owner });
    vi.mocked(fetchAdminDatabaseSnapshot).mockResolvedValue({
      generatedAt: "2026-07-19T00:00:00.000Z",
      tables: [
        { name: "backup_runs", rowCount: 2, source: "repository", writable: false },
        { name: "proof_pages", rowCount: 1, source: "repository", writable: false },
        { name: "content_compliance_events", rowCount: 0, source: "repository", writable: false },
      ],
      backupRuns: [],
      proofPages: [],
      contentComplianceEvents: [],
    });
    vi.mocked(fetchAdminMembers).mockResolvedValue({ members: [owner] });
    vi.mocked(sendMagicLink).mockResolvedValue();
    vi.mocked(signOutAdmin).mockResolvedValue();
  });

  it("shows only the invited-email magic-link login", async () => {
    render(<AdminApp />);
    await screen.findByRole("heading", { name: "管理画面へログイン" });

    fireEvent.change(screen.getByRole("textbox", { name: "メールアドレス" }), {
      target: { value: "owner@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "magic linkを送信" }));

    await waitFor(() => expect(sendMagicLink).toHaveBeenCalledWith("owner@example.com"));
  });

  it("exchanges the PKCE callback and verifies membership before rendering dashboard", async () => {
    window.history.pushState({}, "", "/auth/callback?code=one-time-code");
    render(<AdminApp />);

    await waitFor(() => {
      expect(exchangeMagicLinkCode).toHaveBeenCalledWith("one-time-code");
      expect(fetchAdminSession).toHaveBeenCalledWith("admin-jwt");
      expect(fetchAdminDatabaseSnapshot).toHaveBeenCalledWith("admin-jwt");
    });
    expect(await screen.findByRole("heading", { name: "運用ダッシュボード" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "運用指標" })).toBeInTheDocument();
    expect(screen.getByText("最近の保全処理")).toBeInTheDocument();
    expect(screen.getByText("backup_runs")).toBeInTheDocument();
  });

  it("shows a safe recovery message when magic-link exchange fails", async () => {
    window.history.pushState({}, "", "/auth/callback?code=expired-code");
    vi.mocked(exchangeMagicLinkCode).mockRejectedValueOnce(new Error("expired"));
    render(<AdminApp />);

    expect(await screen.findByRole("heading", { name: "認証に失敗しました" })).toBeInTheDocument();
    expect(screen.getByText(/magic linkを再発行/)).toBeInTheDocument();
  });

  it("renders owner-only member management at /team", async () => {
    window.history.pushState({}, "", "/team");
    vi.mocked(getCurrentSession).mockResolvedValue(session);
    render(<AdminApp />);

    expect(await screen.findByRole("heading", { name: "Team" })).toBeInTheDocument();
    expect(fetchAdminMembers).toHaveBeenCalledWith("admin-jwt");
    await waitFor(() => expect(screen.getAllByText("owner@example.com")).toHaveLength(2));
  });

  it("renders unknown admin routes as 404", () => {
    window.history.pushState({}, "", "/unknown");
    render(<AdminApp />);
    expect(screen.getByRole("heading", { name: "404" })).toBeInTheDocument();
  });
});
