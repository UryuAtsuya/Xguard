import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

describe("backend deployment assets", () => {
  it("defines a reproducible non-root Node.js 22 backend image", async () => {
    const dockerfile = await readRepositoryFile("Dockerfile");

    expect(dockerfile).toContain("FROM node:22-bookworm-slim AS builder");
    expect(dockerfile).toContain("FROM node:22-bookworm-slim AS runner");
    expect(dockerfile).toContain("RUN npm ci");
    expect(dockerfile).toContain("RUN npm run build:api");
    expect(dockerfile).toContain("RUN npm prune --omit=dev");
    expect(dockerfile).toContain("USER xguard");
    expect(dockerfile).toContain("HEALTHCHECK");
    expect(dockerfile).toContain('CMD ["node", "dist/backend/src/server.js"]');
    expect(dockerfile).not.toContain("COPY . .");
    expect(dockerfile).not.toMatch(/(?:SECRET|TOKEN|KEY)=\S+/);
  });

  it("configures Railway to build the backend Dockerfile and gate traffic on health", async () => {
    const railway = JSON.parse(await readRepositoryFile("railway.json")) as {
      build?: { builder?: string; dockerfilePath?: string };
      deploy?: { healthcheckPath?: string };
    };

    expect(railway.build).toEqual({ builder: "DOCKERFILE", dockerfilePath: "Dockerfile" });
    expect(railway.deploy?.healthcheckPath).toBe("/health");
  });

  it("exposes a production start command and explicit public bind address", async () => {
    const packageJson = JSON.parse(await readRepositoryFile("package.json")) as {
      scripts?: Record<string, string>;
    };
    const server = await readRepositoryFile("backend/src/server.ts");

    expect(packageJson.scripts?.start).toBe("node dist/backend/src/server.js");
    expect(server).toContain('app.listen(config.port, "0.0.0.0"');
  });

  it("keeps a container runtime smoke in the release CI path", async () => {
    const packageJson = JSON.parse(await readRepositoryFile("package.json")) as {
      scripts?: Record<string, string>;
    };
    const workflow = await readRepositoryFile(".github/workflows/ci.yml");
    const smokeScript = await readRepositoryFile("scripts/smoke-backend-container.sh");

    expect(packageJson.scripts?.["check:backend-container"]).toBe(
      "bash scripts/smoke-backend-container.sh",
    );
    expect(workflow).toContain("Backend container smoke");
    expect(workflow).toContain("npm run check:backend-container");
    expect(workflow).toContain("npm run build:sites:customer");
    expect(workflow).toContain("npm run build:sites:admin");
    expect(smokeScript).toContain("--read-only");
    expect(smokeScript).toContain("--cap-drop=ALL");
    expect(smokeScript).toContain("/health");
    expect(smokeScript).not.toContain("set -x");
  });

  it("keeps local state, credentials, and unrelated frontend artifacts out of the image context", async () => {
    const dockerignore = await readRepositoryFile(".dockerignore");

    for (const ignored of [
      ".git",
      ".env",
      "node_modules",
      "dist",
      ".playwright-cli",
      "output/playwright",
      "frontend",
      "sites",
    ]) {
      expect(dockerignore.split("\n")).toContain(ignored);
    }
  });

  it("fails Sites builds without a public backend URL and never echoes the supplied value", async () => {
    const missing = await runSitesPreflight("customer", {});
    const invalid = await runSitesPreflight("customer", {
      VITE_XGUARD_API_BASE_URL: "http://private-value.example.com",
    });

    expect(missing).toMatchObject({ code: 1, stderr: "missing_sites_env:VITE_XGUARD_API_BASE_URL\n" });
    expect(invalid).toMatchObject({ code: 1, stderr: "invalid_sites_env:VITE_XGUARD_API_BASE_URL\n" });
    expect(invalid.stderr).not.toContain("private-value");
  });

  it("accepts only the public admin build contract without printing public configuration", async () => {
    const result = await runSitesPreflight("admin", {
      VITE_XGUARD_API_BASE_URL: "https://api.staging.example.com",
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_value",
      VITE_ADMIN_REDIRECT_URL: "https://admin.staging.example.com/auth/callback",
    });

    expect(result).toEqual({ code: 0, stdout: "sites_admin_environment_verified\n", stderr: "" });
    expect(result.stdout).not.toContain("staging.example.com");
    expect(result.stdout).not.toContain("sb_publishable");

    const rejectedSecret = await runSitesPreflight("admin", {
      VITE_XGUARD_API_BASE_URL: "https://api.staging.example.com",
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_secret_private-value",
      VITE_ADMIN_REDIRECT_URL: "https://admin.staging.example.com/auth/callback",
    });
    expect(rejectedSecret).toMatchObject({
      code: 1,
      stderr: "invalid_sites_env:VITE_SUPABASE_PUBLISHABLE_KEY\n",
    });
    expect(rejectedSecret.stderr).not.toContain("private-value");

    const leakedBackendSecret = await runSitesPreflight("admin", {
      VITE_XGUARD_API_BASE_URL: "https://api.staging.example.com",
      VITE_SUPABASE_URL: "https://project.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_value",
      VITE_ADMIN_REDIRECT_URL: "https://admin.staging.example.com/auth/callback",
      SUPABASE_SERVICE_ROLE_KEY: "backend-secret-value",
    });
    expect(leakedBackendSecret).toMatchObject({
      code: 1,
      stderr: "forbidden_sites_env:SUPABASE_SERVICE_ROLE_KEY\n",
    });
    expect(leakedBackendSecret.stderr).not.toContain("backend-secret-value");
  });
});

async function readRepositoryFile(path: string): Promise<string> {
  return readFile(resolve(repositoryRoot, path), "utf8");
}

async function runSitesPreflight(
  target: string,
  environment: NodeJS.ProcessEnv,
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolveResult) => {
    execFile(
      process.execPath,
      [resolve(repositoryRoot, "scripts/sites-build-preflight.mjs"), target],
      { env: environment },
      (error, stdout, stderr) => {
        resolveResult({ code: error && "code" in error && typeof error.code === "number" ? error.code : 0, stdout, stderr });
      },
    );
  });
}
