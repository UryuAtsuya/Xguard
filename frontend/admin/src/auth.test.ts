import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, signInWithOtp } = vi.hoisted(() => {
  const signInWithOtp = vi.fn();
  return {
    signInWithOtp,
    createClient: vi.fn(() => ({
      auth: {
        signInWithOtp,
      },
    })),
  };
});

vi.mock("@supabase/supabase-js", () => ({ createClient }));

describe("admin Supabase auth client", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "publishable-test-key");
    vi.stubEnv("VITE_ADMIN_REDIRECT_URL", "https://admin.example.com/auth/callback");
    signInWithOtp.mockResolvedValue({ error: null });
  });

  it("uses PKCE session storage and never auto-creates an uninvited email", async () => {
    const { sendMagicLink } = await import("./auth");
    await sendMagicLink(" New.Admin@Example.COM ");

    expect(createClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "publishable-test-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          flowType: "pkce",
          persistSession: true,
          storage: window.sessionStorage,
        }),
      }),
    );
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "new.admin@example.com",
      options: {
        emailRedirectTo: "https://admin.example.com/auth/callback",
        shouldCreateUser: false,
      },
    });
  });
});
