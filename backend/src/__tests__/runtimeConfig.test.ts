import { describe, expect, it } from "vitest";
import { createRuntimeConfig } from "../config/runtimeConfig.js";

const productionEnv = {
  NODE_ENV: "production",
  APP_BASE_URL: "https://xguard.example.com",
  X_CLIENT_ID: "real-client-id",
  X_CLIENT_SECRET: "super-secret-value",
  OAUTH_STATE_REPOSITORY: "memory",
  CONTENT_COMPLIANCE_EVENT_REPOSITORY: "memory",
  ADMIN_AUTH_MODE: "supabase",
  ADMIN_REDIRECT_URL: "https://admin.xguard.example.com/auth/callback",
};

describe("runtime confirmation gates", () => {
  it("accepts production when pricing and compliance are confirmed", () => {
    const config = createRuntimeConfig({
      ...productionEnv,
      PRICING_CONFIRMED: " true ",
      COMPLIANCE_CONFIRMED: "true",
    });

    expect(config.pricingConfirmed).toBe(true);
    expect(config.complianceConfirmed).toBe(true);
    expect(config.adminAuth).toEqual({
      mode: "supabase",
      redirectUrl: "https://admin.xguard.example.com/auth/callback",
    });
  });

  it("requires Supabase admin auth and a secure admin redirect in production", () => {
    const { ADMIN_AUTH_MODE: _mode, ADMIN_REDIRECT_URL: _redirect, ...withoutAdminAuth } = productionEnv;

    expect(() =>
      createRuntimeConfig({
        ...withoutAdminAuth,
        PRICING_CONFIRMED: "true",
        COMPLIANCE_CONFIRMED: "true",
      }),
    ).toThrow("invalid_runtime_env:ADMIN_AUTH_MODE");

    expect(() =>
      createRuntimeConfig({
        ...productionEnv,
        ADMIN_REDIRECT_URL: "http://admin.xguard.example.com/auth/callback",
        PRICING_CONFIRMED: "true",
        COMPLIANCE_CONFIRMED: "true",
      }),
    ).toThrow("invalid_runtime_env:ADMIN_REDIRECT_URL");
  });

  it("parses customer and admin CORS allowlists independently", () => {
    const config = createRuntimeConfig({
      CUSTOMER_CORS_ORIGINS: "https://app.example.com/path",
      ADMIN_CORS_ORIGINS: "https://admin.example.com/team",
    });

    expect(config.customerCorsAllowedOrigins).toEqual(["https://app.example.com"]);
    expect(config.adminCorsAllowedOrigins).toEqual(["https://admin.example.com"]);
  });

  it("rejects production when pricing confirmation is missing or false", () => {
    for (const pricingConfirmed of [undefined, "false"]) {
      expect(() =>
        createRuntimeConfig({
          ...productionEnv,
          APP_BASE_URL: "not-a-url",
          PRICING_CONFIRMED: pricingConfirmed,
          COMPLIANCE_CONFIRMED: "true",
        }),
      ).toThrow("invalid_runtime_env:PRICING_CONFIRMED");
    }
  });

  it("rejects production when compliance confirmation is missing or false", () => {
    for (const complianceConfirmed of [undefined, "false"]) {
      expect(() =>
        createRuntimeConfig({
          ...productionEnv,
          APP_BASE_URL: "not-a-url",
          PRICING_CONFIRMED: "true",
          COMPLIANCE_CONFIRMED: complianceConfirmed,
        }),
      ).toThrow("invalid_runtime_env:COMPLIANCE_CONFIRMED");
    }
  });

  it("rejects production when content compliance event storage is not explicit", () => {
    const { CONTENT_COMPLIANCE_EVENT_REPOSITORY: _repositoryMode, ...productionEnvWithoutRepository } = productionEnv;

    expect(() =>
      createRuntimeConfig({
        ...productionEnvWithoutRepository,
        PRICING_CONFIRMED: "true",
        COMPLIANCE_CONFIRMED: "true",
      }),
    ).toThrow("invalid_runtime_env:CONTENT_COMPLIANCE_EVENT_REPOSITORY");
  });

  it("rejects production when OAuth state storage is not explicit", () => {
    const { OAUTH_STATE_REPOSITORY: _repositoryMode, ...productionEnvWithoutRepository } = productionEnv;

    expect(() =>
      createRuntimeConfig({
        ...productionEnvWithoutRepository,
        PRICING_CONFIRMED: "true",
        COMPLIANCE_CONFIRMED: "true",
      }),
    ).toThrow("invalid_runtime_env:OAUTH_STATE_REPOSITORY");
  });

  it("skips confirmation gates in staging", () => {
    const config = createRuntimeConfig({
      NODE_ENV: "staging",
    });

    expect(config.pricingConfirmed).toBe(false);
    expect(config.complianceConfirmed).toBe(false);
  });

  it("skips confirmation gates in development", () => {
    const config = createRuntimeConfig({
      NODE_ENV: "development",
    });

    expect(config.pricingConfirmed).toBe(false);
    expect(config.complianceConfirmed).toBe(false);
  });

  it("uses in-memory content compliance event storage unless Supabase is explicitly selected", () => {
    expect(createRuntimeConfig({}).contentComplianceEventRepository).toBe("memory");
    expect(
      createRuntimeConfig({
        CONTENT_COMPLIANCE_EVENT_REPOSITORY: " supabase ",
      }).contentComplianceEventRepository,
    ).toBe("supabase");
  });

  it("uses in-memory OAuth state storage unless Supabase is explicitly selected", () => {
    expect(createRuntimeConfig({}).oauthStateRepository).toBe("memory");
    expect(
      createRuntimeConfig({
        OAUTH_STATE_REPOSITORY: " supabase ",
      }).oauthStateRepository,
    ).toBe("supabase");
  });

  it("rejects unsupported OAuth state repository modes", () => {
    expect(() =>
      createRuntimeConfig({
        OAUTH_STATE_REPOSITORY: "postgres",
      }),
    ).toThrow("invalid_runtime_env:OAUTH_STATE_REPOSITORY");
  });

  it("rejects unsupported content compliance event repository modes", () => {
    expect(() =>
      createRuntimeConfig({
        CONTENT_COMPLIANCE_EVENT_REPOSITORY: "postgres",
      }),
    ).toThrow("invalid_runtime_env:CONTENT_COMPLIANCE_EVENT_REPOSITORY");
  });
});
