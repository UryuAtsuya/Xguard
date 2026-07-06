import { describe, expect, it } from "vitest";
import { SupabaseOAuthStateHttpStore } from "../repositories/supabaseOAuthStateHttpStore.js";

describe("Supabase OAuth state HTTP store", () => {
  it("saves OAuth state with PKCE verifier through Supabase REST using service-role auth", async () => {
    const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const store = new SupabaseOAuthStateHttpStore({
      supabaseUrl: "https://xguard.supabase.co",
      serviceRoleKey: "service-role-key",
      fetchImpl: async (url, init) => {
        fetchCalls.push({ url: url.toString(), init });
        return jsonResponse(null, 201);
      },
    });

    await store.save({
      state: "oauth-state-1",
      codeVerifier: "pkce-verifier-1",
      expiresAt: new Date("2026-07-06T04:00:00.000Z"),
    });

    expect(fetchCalls[0]).toMatchObject({
      url: "https://xguard.supabase.co/rest/v1/oauth_states",
      init: {
        method: "POST",
        headers: {
          apikey: "service-role-key",
          Authorization: "Bearer service-role-key",
          "Content-Type": "application/json",
        },
      },
    });
    expect(fetchCalls[0]?.init?.body).toBe(
      JSON.stringify({
        state: "oauth-state-1",
        code_verifier: "pkce-verifier-1",
        expires_at: "2026-07-06T04:00:00.000Z",
      }),
    );
  });

  it("consumes OAuth state once by deleting and returning the row", async () => {
    const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const store = new SupabaseOAuthStateHttpStore({
      supabaseUrl: "https://xguard.supabase.co",
      serviceRoleKey: "service-role-key",
      fetchImpl: async (url, init) => {
        fetchCalls.push({ url: url.toString(), init });
        return jsonResponse([
          {
            state: "oauth-state-1",
            code_verifier: "pkce-verifier-1",
            expires_at: "2999-07-06T04:00:00.000Z",
          },
        ]);
      },
    });

    const result = await store.consume("oauth-state-1");

    expect(result).toEqual({
      ok: true,
      record: {
        state: "oauth-state-1",
        codeVerifier: "pkce-verifier-1",
        expiresAt: new Date("2999-07-06T04:00:00.000Z"),
      },
    });
    expect(fetchCalls[0]).toMatchObject({
      url: "https://xguard.supabase.co/rest/v1/oauth_states?state=eq.oauth-state-1",
      init: {
        method: "DELETE",
        headers: {
          apikey: "service-role-key",
          Authorization: "Bearer service-role-key",
          Prefer: "return=representation",
        },
      },
    });
  });

  it("reports expired OAuth state after consuming the row", async () => {
    const store = new SupabaseOAuthStateHttpStore({
      supabaseUrl: "https://xguard.supabase.co",
      serviceRoleKey: "service-role-key",
      fetchImpl: async () =>
        jsonResponse([
          {
            state: "oauth-state-1",
            code_verifier: "pkce-verifier-1",
            expires_at: "2000-07-06T04:00:00.000Z",
          },
        ]),
    });

    await expect(store.consume("oauth-state-1")).resolves.toEqual({ ok: false, reason: "expired" });
  });

  it("reports missing OAuth state without exposing service-role material", async () => {
    const store = new SupabaseOAuthStateHttpStore({
      supabaseUrl: "https://xguard.supabase.co",
      serviceRoleKey: "super-secret-service-role-key",
      fetchImpl: async () => jsonResponse([]),
    });

    await expect(store.consume("missing-state")).resolves.toEqual({ ok: false, reason: "not_found" });
  });

  it("does not include service-role material in failed response errors", async () => {
    const store = new SupabaseOAuthStateHttpStore({
      supabaseUrl: "https://xguard.supabase.co",
      serviceRoleKey: "super-secret-service-role-key",
      fetchImpl: async () => jsonResponse({ message: "super-secret-service-role-key" }, 401),
    });

    await expect(store.consume("oauth-state-1")).rejects.toThrow("consume_oauth_state_failed:401");
  });

  it("aborts stalled Supabase REST calls with a bounded timeout error", async () => {
    const store = new SupabaseOAuthStateHttpStore({
      supabaseUrl: "https://xguard.supabase.co",
      serviceRoleKey: "super-secret-service-role-key",
      timeoutMs: 1,
      fetchImpl: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    });

    await expect(store.consume("oauth-state-1")).rejects.toThrow("supabase_oauth_states_timeout");
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
