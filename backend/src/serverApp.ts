import type { CreateAppOptions } from "./app.js";
import { SupabaseAdminInviteService } from "./admin/adminInviteService.js";
import { SupabaseAdminTokenVerifier } from "./admin/adminAuth.js";
import { SupabaseAdminMemberHttpRepository } from "./admin/supabaseAdminMemberHttpRepository.js";
import type { RuntimeConfig } from "./config/runtimeConfig.js";
import { SupabaseContentComplianceEventHttpStore } from "./repositories/supabaseContentComplianceEventHttpStore.js";
import { SupabaseOAuthStateHttpStore } from "./repositories/supabaseOAuthStateHttpStore.js";
import { SupabaseProofPageHttpStore } from "./repositories/supabaseProofPageHttpStore.js";
import { EncryptedFileXOAuthTokenSecretStore } from "./repositories/xOAuthTokenSecretStore.js";
import { LiveBackupService } from "./services/liveBackupService.js";
import { LiveXOAuthTokenExchangeService } from "./services/xOAuthTokenExchangeService.js";

export function createServerAppOptions(
  config: RuntimeConfig,
  env: NodeJS.ProcessEnv = process.env,
): CreateAppOptions {
  const adminAuthEnabled = config.adminAuth?.mode === "supabase";
  const supabaseEnabled =
    config.contentComplianceEventRepository === "supabase" ||
    config.oauthStateRepository === "supabase" ||
    adminAuthEnabled;
  const options: CreateAppOptions = {};

  if (supabaseEnabled) {
    const supabaseUrl = requireEnv("SUPABASE_URL", env.SUPABASE_URL);
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY", env.SUPABASE_SERVICE_ROLE_KEY);

    if (config.oauthStateRepository === "supabase") {
      options.oauthStateRepository = new SupabaseOAuthStateHttpStore({ supabaseUrl, serviceRoleKey });
    }
    if (config.contentComplianceEventRepository === "supabase") {
      options.contentComplianceEventStore = new SupabaseContentComplianceEventHttpStore({
        supabaseUrl,
        serviceRoleKey,
      });
      options.proofPageStore = new SupabaseProofPageHttpStore({ supabaseUrl, serviceRoleKey });
    }
    if (adminAuthEnabled) {
      options.adminTokenVerifier = new SupabaseAdminTokenVerifier(supabaseUrl);
      options.adminMemberRepository = new SupabaseAdminMemberHttpRepository({
        supabaseUrl,
        serviceRoleKey,
      });
      options.adminInviteService = new SupabaseAdminInviteService(supabaseUrl, serviceRoleKey);
    }
  }

  if (config.xOAuth.mode === "configured") {
    if (!config.customerAppUrl) {
      throw new Error("invalid_runtime_env:CUSTOMER_APP_URL");
    }

    const tokenSecretStore = new EncryptedFileXOAuthTokenSecretStore({
      directory: requireEnv("X_TOKEN_SECRET_STORE_DIR", env.X_TOKEN_SECRET_STORE_DIR),
      encryptionKey: requireEnv("X_TOKEN_ENCRYPTION_KEY", env.X_TOKEN_ENCRYPTION_KEY),
    });
    options.xOAuthTokenExchangeService = new LiveXOAuthTokenExchangeService({
      clientId: config.xOAuth.clientId,
      clientSecret: requireEnv("X_CLIENT_SECRET", env.X_CLIENT_SECRET),
      tokenSecretStore,
    });
    options.backupService = new LiveBackupService({ tokenSecretStore });
  }

  return options;
}

function requireEnv(name: string, value: string | undefined): string {
  const trimmed = value?.trim();

  if (!trimmed) {
    throw new Error(`invalid_runtime_env:${name}`);
  }

  return trimmed;
}
