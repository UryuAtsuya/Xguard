import { describe, expect, it } from "vitest";
import { createRuntimeConfig } from "../config/runtimeConfig.js";
import { SupabaseContentComplianceEventHttpStore } from "../repositories/supabaseContentComplianceEventHttpStore.js";
import { createServerAppOptions } from "../serverApp.js";

describe("server app composition", () => {
  it("keeps content compliance event storage in memory by default", () => {
    const options = createServerAppOptions(createRuntimeConfig({}), {});

    expect(options).toEqual({});
  });

  it("wires Supabase content compliance event storage when explicitly selected", () => {
    const options = createServerAppOptions(
      createRuntimeConfig({
        CONTENT_COMPLIANCE_EVENT_REPOSITORY: "supabase",
      }),
      {
        SUPABASE_URL: "https://xguard.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      },
    );

    expect(options.contentComplianceEventStore).toBeInstanceOf(SupabaseContentComplianceEventHttpStore);
  });

  it("fails startup when Supabase mode is selected without Supabase runtime env", () => {
    expect(() =>
      createServerAppOptions(
        createRuntimeConfig({
          CONTENT_COMPLIANCE_EVENT_REPOSITORY: "supabase",
        }),
        {},
      ),
    ).toThrow("invalid_runtime_env:SUPABASE_URL");
  });
});
