import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

describe("Make development commands", () => {
  it("starts backend, customer, and admin from the default make target", async () => {
    const makeResult = await runCommand("make", ["--dry-run"]);

    expect(makeResult).toMatchObject({ code: 0, stderr: "" });
    expect(makeResult.stdout).toContain("node scripts/dev-processes.mjs all");

    const plan = await runCommand(process.execPath, [
      resolve(repositoryRoot, "scripts/dev-processes.mjs"),
      "--dry-run",
      "all",
    ]);

    expect(plan).toEqual({
      code: 0,
      stdout:
        "backend\tnpm run dev:api\n" +
        "customer\tnpm run dev:web:customer\n" +
        "admin\tnpm run dev:web:admin\n",
      stderr: "",
    });
  });

  it("starts both frontend apps without the backend from make frontend", async () => {
    const makeResult = await runCommand("make", ["--dry-run", "frontend"]);

    expect(makeResult).toMatchObject({ code: 0, stderr: "" });
    expect(makeResult.stdout).toContain("node scripts/dev-processes.mjs frontend");

    const plan = await runCommand(process.execPath, [
      resolve(repositoryRoot, "scripts/dev-processes.mjs"),
      "--dry-run",
      "frontend",
    ]);

    expect(plan.stdout).toBe(
      "customer\tnpm run dev:web:customer\n" + "admin\tnpm run dev:web:admin\n",
    );
    expect(plan.stderr).toBe("");
    expect(plan.code).toBe(0);
  });

  it.each([
    ["backend", "dev:api"],
    ["customer", "dev:web:customer"],
    ["admin", "dev:web:admin"],
  ])("maps make %s to only its matching npm script", async (target, npmScript) => {
    const makeResult = await runCommand("make", ["--dry-run", target]);
    const plan = await runCommand(process.execPath, [
      resolve(repositoryRoot, "scripts/dev-processes.mjs"),
      "--dry-run",
      target,
    ]);

    expect(makeResult).toMatchObject({ code: 0, stderr: "" });
    expect(makeResult.stdout).toContain(`node scripts/dev-processes.mjs ${target}`);
    expect(plan).toEqual({
      code: 0,
      stdout: `${target}\tnpm run ${npmScript}\n`,
      stderr: "",
    });
  });

  it("rejects unknown targets without starting a process", async () => {
    const result = await runCommand(process.execPath, [
      resolve(repositoryRoot, "scripts/dev-processes.mjs"),
      "unknown",
    ]);

    expect(result).toEqual({
      code: 1,
      stdout: "",
      stderr: "usage: node scripts/dev-processes.mjs [--dry-run] <all|frontend|backend|customer|admin>\n",
    });
  });

  it("returns a failure when npm cannot be started", async () => {
    const result = await runCommand(
      process.execPath,
      [resolve(repositoryRoot, "scripts/dev-processes.mjs"), "backend"],
      { PATH: "" },
    );

    expect(result).toEqual({
      code: 1,
      stdout: "[dev] starting backend: npm run dev:api\n",
      stderr: "[dev] backend failed to start\n",
    });
  });

  it("fails instead of silently moving either frontend to a different port", async () => {
    const customerConfig = await readFile(
      resolve(repositoryRoot, "frontend/vite.customer.config.ts"),
      "utf8",
    );
    const adminConfig = await readFile(
      resolve(repositoryRoot, "frontend/vite.admin.config.ts"),
      "utf8",
    );

    expect(customerConfig).toMatch(/port: 5173,\s+strictPort: true,/);
    expect(adminConfig).toMatch(/port: 5174,\s+strictPort: true,/);
  });
});

async function runCommand(
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveResult) => {
    execFile(
      command,
      args,
      { cwd: repositoryRoot, env: environment, timeout: 3_000 },
      (error, stdout, stderr) => {
        resolveResult({
          code: error && "code" in error && typeof error.code === "number" ? error.code : 0,
          stdout,
          stderr,
        });
      },
    );
  });
}
