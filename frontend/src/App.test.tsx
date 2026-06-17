import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";

describe("App", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the night-work cast recovery mockup", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "消える前に、営業再開キットを残す。" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /復旧キットを見る/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "アカウントで困っている" })).toBeInTheDocument();
    expect(screen.getByAltText("プロフィールと保存状態のプレビュー")).toBeInTheDocument();
  });

  it("includes archive and operator surfaces for design review", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "X風ではなく、再利用しやすい順に整理。" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "運営側は、高密度に要対応だけを見る。" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "要対応ユーザー一覧" })).toBeInTheDocument();
  });
});
