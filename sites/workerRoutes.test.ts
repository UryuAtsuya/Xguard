import { describe, expect, it } from "vitest";
// JavaScript worker entry points intentionally remain runtime-native modules.
// @ts-expect-error no declaration file is required for the Worker bundle
import adminWorker from "./admin/worker.mjs";
// @ts-expect-error no declaration file is required for the Worker bundle
import customerWorker from "./customer-worker.mjs";

function environment() {
  return {
    ASSETS: {
      async fetch(request: Request) {
        const path = new URL(request.url).pathname;
        if (path === "/index.html" || path.startsWith("/assets/")) {
          return new Response("asset", { status: 200 });
        }
        return new Response("missing", { status: 404 });
      },
    },
  };
}

describe("Sites route boundaries", () => {
  it.each(["/admin", "/login", "/unknown"])("keeps customer %s as an HTTP 404", async (path) => {
    const response = await customerWorker.fetch(
      new Request(`https://app.example.com${path}`, {
        headers: { Accept: "text/html" },
      }),
      environment(),
    );
    expect(response.status).toBe(404);
  });

  it("serves the customer root without a broad SPA fallback", async () => {
    const response = await customerWorker.fetch(
      new Request("https://app.example.com/", { headers: { Accept: "text/html" } }),
      environment(),
    );
    expect(response.status).toBe(200);
  });

  it.each(["/", "/login", "/auth/callback", "/team"])("allows admin app route %s", async (path) => {
    const response = await adminWorker.fetch(
      new Request(`https://admin.example.com${path}`, {
        headers: { Accept: "text/html" },
      }),
      environment(),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
  });

  it("keeps unknown admin routes as HTTP 404", async () => {
    const response = await adminWorker.fetch(
      new Request("https://admin.example.com/unknown", {
        headers: { Accept: "text/html" },
      }),
      environment(),
    );
    expect(response.status).toBe(404);
  });
});
