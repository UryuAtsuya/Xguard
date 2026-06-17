import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

    expect(screen.getByRole("heading", { name: "消える前に、営業再開キットを残す。" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /復旧キットを見る/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "アカウントで困っている" })).toBeInTheDocument();
    expect(screen.getByAltText("プロフィールと保存状態のプレビュー")).toBeInTheDocument();
  });

  it("shows the live prototype flow controls", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "実 API で backup と proof まで確認する。" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Read-only X 接続" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Backup 実行" })).toBeDisabled();

    await waitFor(() => {
      expect(screen.getByText("prototype / OAuth mock")).toBeInTheDocument();
    });
  });

  it("includes archive and operator surfaces for design review", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "X風ではなく、再利用しやすい順に整理。" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "運営側は、高密度に要対応だけを見る。" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "要対応ユーザー一覧" })).toBeInTheDocument();
  });
});
