import { describe, expect, it } from "vitest";
import { SupabaseContentComplianceEventHttpStore } from "../repositories/supabaseContentComplianceEventHttpStore.js";

describe("Supabase content compliance event HTTP store", () => {
  it("inserts content compliance events through Supabase REST with service-role auth", async () => {
    const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const store = new SupabaseContentComplianceEventHttpStore({
      supabaseUrl: "https://xguard.supabase.co",
      serviceRoleKey: "service-role-key",
      fetchImpl: async (url, init) => {
        fetchCalls.push({ url: url.toString(), init });
        return jsonResponse([
          {
            id: "event-1",
            x_account_id: "x-account-1",
            event_type: "proof_page_revoked",
            source: "user_request",
            details: { runId: "run-1" },
            created_at: "2026-06-25T04:40:00.000Z",
          },
        ]);
      },
    });

    const row = await store.insertContentComplianceEvent({
      x_account_id: "x-account-1",
      event_type: "proof_page_revoked",
      source: "user_request",
      details: { runId: "run-1" },
    });

    expect(row.id).toBe("event-1");
    expect(fetchCalls[0]).toMatchObject({
      url: "https://xguard.supabase.co/rest/v1/content_compliance_events",
      init: {
        method: "POST",
        headers: {
          apikey: "service-role-key",
          Authorization: "Bearer service-role-key",
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
      },
    });
    expect(fetchCalls[0]?.init?.body).toBe(
      JSON.stringify({
        x_account_id: "x-account-1",
        event_type: "proof_page_revoked",
        source: "user_request",
        details: { runId: "run-1" },
      }),
    );
  });

  it("lists content compliance events by x account through Supabase REST", async () => {
    const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const store = new SupabaseContentComplianceEventHttpStore({
      supabaseUrl: "https://xguard.supabase.co",
      serviceRoleKey: "service-role-key",
      fetchImpl: async (url, init) => {
        fetchCalls.push({ url: url.toString(), init });
        return jsonResponse([]);
      },
    });

    await store.listContentComplianceEventsByXAccount("x-account-1");

    expect(fetchCalls[0]).toMatchObject({
      url: "https://xguard.supabase.co/rest/v1/content_compliance_events?x_account_id=eq.x-account-1&order=created_at.desc",
      init: {
        method: "GET",
        headers: {
          apikey: "service-role-key",
          Authorization: "Bearer service-role-key",
        },
      },
    });
  });

  it("does not include service-role material in failed response errors", async () => {
    const store = new SupabaseContentComplianceEventHttpStore({
      supabaseUrl: "https://xguard.supabase.co",
      serviceRoleKey: "super-secret-service-role-key",
      fetchImpl: async () => jsonResponse({ message: "super-secret-service-role-key" }, 401),
    });

    await expect(
      store.listContentComplianceEventsByXAccount("x-account-1"),
    ).rejects.toThrow("list_content_compliance_events_failed:401");
  });

  it("aborts stalled Supabase REST calls with a bounded timeout error", async () => {
    const store = new SupabaseContentComplianceEventHttpStore({
      supabaseUrl: "https://xguard.supabase.co",
      serviceRoleKey: "super-secret-service-role-key",
      timeoutMs: 1,
      fetchImpl: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    });

    await expect(
      store.listContentComplianceEventsByXAccount("x-account-1"),
    ).rejects.toThrow("supabase_content_compliance_events_timeout");
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
