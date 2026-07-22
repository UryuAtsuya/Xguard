import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | undefined;

export function getAdminSupabaseClient(): SupabaseClient {
  if (client) {
    return client;
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!supabaseUrl || !publishableKey) {
    throw new Error("admin_auth_configuration_missing");
  }

  client = createClient(supabaseUrl, publishableKey, {
    auth: {
      flowType: "pkce",
      detectSessionInUrl: false,
      persistSession: true,
      storage: window.sessionStorage,
      autoRefreshToken: true,
    },
  });
  return client;
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data, error } = await getAdminSupabaseClient().auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function sendMagicLink(email: string): Promise<void> {
  const redirectTo =
    import.meta.env.VITE_ADMIN_REDIRECT_URL?.trim() ??
    `${window.location.origin}/auth/callback`;
  const { error } = await getAdminSupabaseClient().auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: {
      emailRedirectTo: redirectTo,
      shouldCreateUser: false,
    },
  });
  if (error) throw error;
}

export async function exchangeMagicLinkCode(code: string): Promise<Session> {
  const { data, error } = await getAdminSupabaseClient().auth.exchangeCodeForSession(code);
  if (error || !data.session) {
    throw error ?? new Error("admin_magic_link_exchange_failed");
  }
  return data.session;
}

export async function signOutAdmin(): Promise<void> {
  await getAdminSupabaseClient().auth.signOut({ scope: "local" });
}
