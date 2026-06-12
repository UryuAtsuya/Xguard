import { describe, expect, it } from "vitest";
import { createRuntimeConfig } from "../config/runtimeConfig.js";

const productionEnv = {
  NODE_ENV: "production",
  APP_BASE_URL: "https://xguard.example.com",
  X_CLIENT_ID: "real-client-id",
  X_CLIENT_SECRET: "super-secret-value",
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
});
