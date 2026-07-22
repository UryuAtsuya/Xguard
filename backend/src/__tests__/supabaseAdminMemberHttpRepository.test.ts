// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { AdminMemberGuardError } from "../admin/adminMemberRepository.js";
import { SupabaseAdminMemberHttpRepository } from "../admin/supabaseAdminMemberHttpRepository.js";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  email: "operator@example.com",
  role: "viewer",
  status: "active",
  invited_by_user_id: null,
  created_at: "2026-07-19T00:00:00.000Z",
  updated_at: "2026-07-19T01:00:00.000Z",
};

describe("Supabase admin member safe updates", () => {
  it("uses the transactional RPC with service-role headers", async () => {
    const fetchImpl = vi.fn(async () => Response.json(row));
    const repository = new SupabaseAdminMemberHttpRepository({
      supabaseUrl: "https://project.supabase.co",
      serviceRoleKey: "service-role-test-key",
      fetchImpl,
    });

    const result = await repository.updateSafely({
      actorMemberId: "33333333-3333-4333-8333-333333333333",
      memberId: row.id,
      role: "viewer",
      now: row.updated_at,
    });

    expect(result).toMatchObject({
      id: row.id,
      userId: row.user_id,
      role: "viewer",
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url.toString()).toBe(
      "https://project.supabase.co/rest/v1/rpc/update_admin_member_safely",
    );
    expect(init.headers).toMatchObject({
      apikey: "service-role-test-key",
      Authorization: "Bearer service-role-test-key",
    });
  });

  it("maps a database guard rejection without exposing the service key", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ message: "admin_last_owner_required" }, { status: 400 }),
    );
    const repository = new SupabaseAdminMemberHttpRepository({
      supabaseUrl: "https://project.supabase.co",
      serviceRoleKey: "service-role-test-key",
      fetchImpl,
    });

    await expect(
      repository.updateSafely({
        actorMemberId: row.id,
        memberId: row.id,
        role: "viewer",
        now: row.updated_at,
      }),
    ).rejects.toEqual(new AdminMemberGuardError("admin_last_owner_required"));
  });
});
