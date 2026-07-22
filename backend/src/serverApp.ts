import type { CreateAppOptions } from "./app.js";
import { SupabaseAdminInviteService } from "./admin/adminInviteService.js";
import { SupabaseAdminTokenVerifier } from "./admin/adminAuth.js";
import { SupabaseAdminMemberHttpRepository } from "./admin/supabaseAdminMemberHttpRepository.js";
import type { RuntimeConfig } from "./config/runtimeConfig.js";
import { SupabaseContentComplianceEventHttpStore } from "./repositories/supabaseContentComplianceEventHttpStore.js";
import { SupabaseOAuthStateHttpStore } from "./repositories/supabaseOAuthStateHttpStore.js";
import { SupabaseProofPageHttpStore } from "./repositories/supabaseProofPageHttpStore.js";

export function createServerAppOptions(
  config: RuntimeConfig,
  env: NodeJS.ProcessEnv = process.env,
): CreateAppOptions {
  const adminAuthEnabled = config.adminAuth?.mode === "supabase";
  if (
    config.contentComplianceEventRepository === "memory" &&
    config.oauthStateRepository === "memory" &&
    !adminAuthEnabled
  ) {
    return {};
  }

  const supabaseUrl = requireEnv("SUPABASE_URL", env.SUPABASE_URL);
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY);

  return {
    ...(config.oauthStateRepository === "supabase"
      ? {
          oauthStateRepository: new SupabaseOAuthStateHttpStore({
            supabaseUrl,
            serviceRoleKey,
          }),
        }
      : {}),
    ...(config.contentComplianceEventRepository === "supabase"
      ? {
          contentComplianceEventStore: new SupabaseContentComplianceEventHttpStore({
            supabaseUrl,
            serviceRoleKey,
          }),
          proofPageStore: new SupabaseProofPageHttpStore({
            supabaseUrl,
            serviceRoleKey,
          }),
        }
      : {}),
    ...(adminAuthEnabled
      ? {
          adminTokenVerifier: new SupabaseAdminTokenVerifier(supabaseUrl),
          adminMemberRepository: new SupabaseAdminMemberHttpRepository({
            supabaseUrl,
            serviceRoleKey,
          }),
          adminInviteService: new SupabaseAdminInviteService(supabaseUrl, serviceRoleKey),
        }
      : {}),
  };
}

function requireEnv(name: string, value: string | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new Error(`invalid_runtime_env:${name}`);
  }

  return trimmed;
}
