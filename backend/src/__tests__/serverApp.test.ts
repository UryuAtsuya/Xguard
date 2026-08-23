import { describe, expect, it } from "vitest";
import { createRuntimeConfig } from "../config/runtimeConfig.js";
import { SupabaseContentComplianceEventHttpStore } from "../repositories/supabaseContentComplianceEventHttpStore.js";
import { SupabaseOAuthStateHttpStore } from "../repositories/supabaseOAuthStateHttpStore.js";
import { SupabaseProofPageHttpStore } from "../repositories/supabaseProofPageHttpStore.js";
import { LiveBackupService } from "../services/liveBackupService.js";
import { LiveXOAuthTokenExchangeService } from "../services/xOAuthTokenExchangeService.js";
import { createServerAppOptions } from "../serverApp.js";

describe("server app composition", () => {
  it("keeps content compliance event storage in memory by default", () => {
    const options = createServerAppOptions(createRuntimeConfig({}), {});

    expect(options).toEqual({});
  });

  it("wires Supabase OAuth state store from service-role env", () => {
    const options = createServerAppOptions(
      createRuntimeConfig({
        OAUTH_STATE_REPOSITORY: "supabase",
      }),
      {
        SUPABASE_URL: "https://xguard.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      },
    );

    expect(options.oauthStateRepository).toBeInstanceOf(SupabaseOAuthStateHttpStore);
    expect(options.contentComplianceEventStore).toBeUndefined();
    expect(options.proofPageStore).toBeUndefined();
  });

  it("wires Supabase proof page and compliance stores from service-role env", () => {
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
    expect(options.proofPageStore).toBeInstanceOf(SupabaseProofPageHttpStore);
  });

  it("fails startup when Supabase OAuth state mode lacks service-role env", () => {
    expect(() =>
      createServerAppOptions(
        createRuntimeConfig({
          OAUTH_STATE_REPOSITORY: "supabase",
        }),
        {
          SUPABASE_URL: "https://xguard.supabase.co",
        },
      ),
    ).toThrow("invalid_runtime_env:SUPABASE_SERVICE_ROLE_KEY");
  });

  it("fails startup when Supabase compliance mode lacks service-role env", () => {
    expect(() =>
      createServerAppOptions(
        createRuntimeConfig({
          CONTENT_COMPLIANCE_EVENT_REPOSITORY: "supabase",
        }),
        {
          SUPABASE_URL: "https://xguard.supabase.co",
        },
      ),
    ).toThrow("invalid_runtime_env:SUPABASE_SERVICE_ROLE_KEY");
  });

  it("wires live X OAuth and backup without requiring Supabase when X is configured", () => {
    const options = createServerAppOptions(
      createRuntimeConfig({
        X_CLIENT_ID: "real-client-id",
        X_CLIENT_SECRET: "real-client-secret",
        CUSTOMER_APP_URL: "https://app.xguard.example.com",
      }),
      {
        X_CLIENT_SECRET: "real-client-secret",
        X_TOKEN_SECRET_STORE_DIR: "/tmp/xguard-test-token-store",
        X_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
      },
    );

    expect(options.xOAuthTokenExchangeService).toBeInstanceOf(LiveXOAuthTokenExchangeService);
    expect(options.backupService).toBeInstanceOf(LiveBackupService);
    expect(options.oauthStateRepository).toBeUndefined();
  });

  it("fails startup when live X OAuth lacks its backend-only secret storage env", () => {
    const config = createRuntimeConfig({
      X_CLIENT_ID: "real-client-id",
      X_CLIENT_SECRET: "real-client-secret",
      CUSTOMER_APP_URL: "https://app.xguard.example.com",
    });

    expect(() => createServerAppOptions(config, { X_CLIENT_SECRET: "real-client-secret" })).toThrow(
      "invalid_runtime_env:X_TOKEN_SECRET_STORE_DIR",
    );
  });
});
