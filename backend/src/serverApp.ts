import type { CreateAppOptions } from "./app.js";
import type { RuntimeConfig } from "./config/runtimeConfig.js";
import { SupabaseContentComplianceEventHttpStore } from "./repositories/supabaseContentComplianceEventHttpStore.js";
import { SupabaseProofPageHttpStore } from "./repositories/supabaseProofPageHttpStore.js";

export function createServerAppOptions(
  config: RuntimeConfig,
  env: NodeJS.ProcessEnv = process.env,
): CreateAppOptions {
  if (config.contentComplianceEventRepository === "memory") {
    return {};
  }

  const supabaseUrl = requireEnv("SUPABASE_URL", env.SUPABASE_URL);
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY);

  return {
    contentComplianceEventStore: new SupabaseContentComplianceEventHttpStore({
      supabaseUrl,
      serviceRoleKey,
    }),
    proofPageStore: new SupabaseProofPageHttpStore({
      supabaseUrl,
      serviceRoleKey,
    }),
  };
}

function requireEnv(name: string, value: string | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new Error(`invalid_runtime_env:${name}`);
  }

  return trimmed;
}
