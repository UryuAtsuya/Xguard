import type { CreateAppOptions } from "./app.js";
import type { RuntimeConfig } from "./config/runtimeConfig.js";

export function createServerAppOptions(
  config: RuntimeConfig,
  _env: NodeJS.ProcessEnv = process.env,
): CreateAppOptions {
  if (config.contentComplianceEventRepository === "memory") {
    return {};
  }

  throw new Error("invalid_runtime_env:PROOF_PAGE_REPOSITORY_TRANSACTION_STORE");
}
