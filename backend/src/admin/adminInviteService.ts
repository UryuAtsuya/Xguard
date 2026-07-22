import { createClient } from "@supabase/supabase-js";

export interface AdminInviteService {
  invite(email: string, redirectTo: string): Promise<{ userId: string | null }>;
}

export class SupabaseAdminInviteService implements AdminInviteService {
  private readonly client;

  constructor(supabaseUrl: string, serviceRoleKey: string) {
    this.client = createClient(requireUrl(supabaseUrl), requireSecret(serviceRoleKey), {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
  }

  async invite(email: string, redirectTo: string): Promise<{ userId: string | null }> {
    const { data, error } = await this.client.auth.admin.inviteUserByEmail(email, {
      redirectTo,
    });

    if (error) {
      throw new Error(`admin_invitation_failed:${error.status ?? "unknown"}`);
    }

    return { userId: data.user?.id ?? null };
  }
}

export class UnavailableAdminInviteService implements AdminInviteService {
  async invite(): Promise<never> {
    throw new Error("admin_invitation_unavailable");
  }
}

function requireUrl(value: string): string {
  const trimmed = value.trim();

  try {
    return new URL(trimmed).toString();
  } catch {
    throw new Error("invalid_runtime_env:SUPABASE_URL");
  }
}

function requireSecret(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("invalid_runtime_env:SUPABASE_SERVICE_ROLE_KEY");
  }

  return trimmed;
}
