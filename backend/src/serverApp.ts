import type { CreateAppOptions } from "./app.js";
import type { RuntimeConfig } from "./config/runtimeConfig.js";
import { SupabaseContentComplianceEventHttpStore } from "./repositories/supabaseContentComplianceEventHttpStore.js";

export function createServerAppOptions(
  config: RuntimeConfig,
  env: NodeJS.ProcessEnv = process.env,
): CreateAppOptions {
  if (config.contentComplianceEventRepository === "memory") {
    return {};
  }

  return {
    contentComplianceEventStore: new SupabaseContentComplianceEventHttpStore({
      supabaseUrl: env.SUPABASE_URL ?? "",
      serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    }),
  };
}
