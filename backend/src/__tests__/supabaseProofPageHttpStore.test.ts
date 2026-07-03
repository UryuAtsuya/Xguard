import { describe, expect, it } from "vitest";
import type { SupabaseProofPageEntryRow } from "../repositories/proofPageRepository.js";
import { SupabaseProofPageHttpStore } from "../repositories/supabaseProofPageHttpStore.js";

describe("Supabase proof page HTTP store", () => {
  it("records proof page revocation through the transaction RPC", async () => {
    const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const store = new SupabaseProofPageHttpStore({
      supabaseUrl: "https://xguard.supabase.co",
      serviceRoleKey: "service-role-key",
      fetchImpl: async (url, init) => {
        fetchCalls.push({ url: url.toString(), init });
        return jsonResponse(proofPageEntryRow());
      },
    });

    const row = await store.updateProofPageVisibilityAndRecordContentComplianceEvent({
      proof_page: {
        backup_run_id: "backup-run-1",
        visibility: "revoked",
        revoked_at: "2026-07-03T04:00:00.000Z",
        updated_at: "2026-07-03T04:00:00.000Z",
      },
      content_compliance_event: {
        id: "event-1",
        x_account_id: "x-account-1",
        proof_page_id: "proof-page-1",
        event_type: "proof_page_revoked",
        source: "user_request",
        details: { runId: "backup-run-1" },
        created_at: "2026-07-03T04:00:00.000Z",
      },
    });

    expect(row?.proof_page.visibility).toBe("revoked");
    expect(fetchCalls[0]).toMatchObject({
      url: "https://xguard.supabase.co/rest/v1/rpc/update_proof_page_visibility_and_record_content_compliance_event",
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
        p_backup_run_id: "backup-run-1",
        p_visibility: "revoked",
        p_revoked_at: "2026-07-03T04:00:00.000Z",
        p_updated_at: "2026-07-03T04:00:00.000Z",
        p_event_id: "event-1",
        p_x_account_id: "x-account-1",
        p_tweet_snapshot_id: null,
        p_proof_page_id: "proof-page-1",
        p_event_type: "proof_page_revoked",
        p_source: "user_request",
        p_details: { runId: "backup-run-1" },
        p_resolved_at: null,
        p_created_at: "2026-07-03T04:00:00.000Z",
      }),
    );
  });

  it("does not include service-role material in failed response errors", async () => {
    const store = new SupabaseProofPageHttpStore({
      supabaseUrl: "https://xguard.supabase.co",
      serviceRoleKey: "super-secret-service-role-key",
      fetchImpl: async () => jsonResponse({ message: "super-secret-service-role-key" }, 401),
    });

    await expect(
      store.updateProofPageVisibilityAndRecordContentComplianceEvent({
        proof_page: {
          backup_run_id: "backup-run-1",
          visibility: "revoked",
          revoked_at: "2026-07-03T04:00:00.000Z",
          updated_at: "2026-07-03T04:00:00.000Z",
        },
        content_compliance_event: {
          x_account_id: "x-account-1",
          event_type: "proof_page_revoked",
          source: "user_request",
          details: {},
        },
      }),
    ).rejects.toThrow("update_proof_page_visibility_and_record_content_compliance_event_failed:401");
  });

  it("keeps optional RPC arguments explicit when omitted", async () => {
    const fetchCalls: Array<{ init: RequestInit | undefined }> = [];
    const store = new SupabaseProofPageHttpStore({
      supabaseUrl: "https://xguard.supabase.co",
      serviceRoleKey: "service-role-key",
      fetchImpl: async (_url, init) => {
        fetchCalls.push({ init });
        return jsonResponse(proofPageEntryRow());
      },
    });

    await store.updateProofPageVisibilityAndRecordContentComplianceEvent({
      proof_page: {
        backup_run_id: "backup-run-1",
        visibility: "revoked",
        revoked_at: "2026-07-03T04:00:00.000Z",
        updated_at: "2026-07-03T04:00:00.000Z",
      },
      content_compliance_event: {
        x_account_id: "x-account-1",
        event_type: "proof_page_revoked",
        source: "user_request",
        details: {},
      },
    });

    expect(JSON.parse(String(fetchCalls[0]?.init?.body))).toMatchObject({
      p_event_id: null,
      p_tweet_snapshot_id: null,
      p_proof_page_id: null,
      p_resolved_at: null,
      p_created_at: null,
    });
  });


  it("aborts stalled Supabase proof page calls with a bounded timeout error", async () => {
    const store = new SupabaseProofPageHttpStore({
      supabaseUrl: "https://xguard.supabase.co",
      serviceRoleKey: "super-secret-service-role-key",
      timeoutMs: 1,
      fetchImpl: async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    });

    await expect(store.findProofPageByRunId("backup-run-1")).rejects.toThrow("supabase_proof_pages_timeout");
  });
});

function proofPageEntryRow(): SupabaseProofPageEntryRow {
  return {
    backup_run: {
      id: "backup-run-1",
      x_account_id: "x-account-1",
      status: "completed",
      started_at: "2026-07-03T03:58:00.000Z",
      completed_at: "2026-07-03T03:59:00.000Z",
      tweet_limit: 100,
      tweets_captured: 1,
      profiles_captured: 1,
      api_units_used: 1,
      estimated_cost_usd: 0.01,
      created_at: "2026-07-03T03:58:00.000Z",
    },
    proof_page: {
      id: "proof-page-1",
      user_id: "user-1",
      x_account_id: "x-account-1",
      backup_run_id: "backup-run-1",
      slug: "backup-run-1",
      visibility: "revoked",
      public_payload: {
        runId: "backup-run-1",
        account: { username: "xguard_user" },
        snapshotCounts: { tweets: 1, profiles: 1 },
        representativeTweets: [],
        redactionPolicyVersion: "v1",
        generatedAt: "2026-07-03T03:59:00.000Z",
      },
      redaction_policy_version: "v1",
      revoked_at: "2026-07-03T04:00:00.000Z",
      created_at: "2026-07-03T03:59:00.000Z",
      updated_at: "2026-07-03T04:00:00.000Z",
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}
