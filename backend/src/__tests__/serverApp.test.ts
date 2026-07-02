import { describe, expect, it } from "vitest";
import { createRuntimeConfig } from "../config/runtimeConfig.js";
import { createServerAppOptions } from "../serverApp.js";

describe("server app composition", () => {
  it("keeps content compliance event storage in memory by default", () => {
    const options = createServerAppOptions(createRuntimeConfig({}), {});

    expect(options).toEqual({});
  });

  it("fails startup when Supabase mode lacks a proof page transaction store", () => {
    expect(() =>
      createServerAppOptions(
        createRuntimeConfig({
          CONTENT_COMPLIANCE_EVENT_REPOSITORY: "supabase",
        }),
        {
          SUPABASE_URL: "https://xguard.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
        },
      ),
    ).toThrow("invalid_runtime_env:PROOF_PAGE_REPOSITORY_TRANSACTION_STORE");
  });
});
