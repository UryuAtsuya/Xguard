import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import type { AdminTokenVerifier, VerifiedAdminIdentity } from "../admin/adminAuth.js";
import type { AdminInviteService } from "../admin/adminInviteService.js";
import {
  InMemoryAdminMemberRepository,
  type StoredAdminMember,
} from "../admin/adminMemberRepository.js";
import { createRuntimeConfig } from "../config/runtimeConfig.js";

const ownerUserId = randomUUID();
const operatorUserId = randomUUID();
const viewerUserId = randomUUID();

describe("admin API access boundary", () => {
  it("distinguishes missing/invalid admin credentials, non-members, and customer sessions", async () => {
    const repository = new InMemoryAdminMemberRepository([member("owner", ownerUserId)]);
    const app = createAdminApp(repository, {
      owner: { userId: ownerUserId, email: "owner@example.com" },
      stranger: { userId: randomUUID(), email: "stranger@example.com" },
    });
    await app.locals.sessionRepository.save("customer-token", "customer-user");

    expect((await request(app).get("/api/admin/session")).status).toBe(401);
    expect((await request(app).get("/api/admin/session").set("Authorization", "Bearer invalid")).status).toBe(401);
    expect((await request(app).get("/api/admin/session").set("Authorization", "Bearer stranger")).status).toBe(403);

    const customerResponse = await request(app)
      .get("/api/admin/session")
      .set("Authorization", "Bearer customer-token");
    expect(customerResponse.status).toBe(403);
    expect(customerResponse.body).toEqual({ error: "customer_session_not_allowed" });
  });

  it("activates an invited member on first verified login", async () => {
    const userId = randomUUID();
    const invited = member("viewer", null, "invited@example.com", "invited");
    const repository = new InMemoryAdminMemberRepository([invited]);
    const app = createAdminApp(repository, {
      invited: { userId, email: invited.email },
    });

    const response = await request(app)
      .get("/api/admin/session")
      .set("Authorization", "Bearer invited");

    expect(response.status).toBe(200);
    expect(response.body.member).toMatchObject({
      email: invited.email,
      role: "viewer",
      status: "active",
    });
    expect((await repository.findById(invited.id))?.userId).toBe(userId);
  });

  it.each(["owner", "operator", "viewer"] as const)(
    "allows active %s members to read the database snapshot",
    async (role) => {
      const userId =
        role === "owner" ? ownerUserId : role === "operator" ? operatorUserId : viewerUserId;
      const repository = new InMemoryAdminMemberRepository([
        member(role, userId, `${role}@example.com`),
      ]);
      const app = createAdminApp(repository, {
        token: { userId, email: `${role}@example.com` },
      });

      const response = await request(app)
        .get("/api/admin/database-snapshot")
        .set("Authorization", "Bearer token");

      expect(response.status).toBe(200);
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(response.body.tables).toEqual([
        expect.objectContaining({ name: "backup_runs", rowCount: 0 }),
        expect.objectContaining({ name: "proof_pages", rowCount: 0 }),
        expect.objectContaining({ name: "content_compliance_events", rowCount: 0 }),
      ]);
    },
  );

  it("keeps member management owner-only", async () => {
    const repository = new InMemoryAdminMemberRepository([
      member("owner", ownerUserId),
      member("operator", operatorUserId, "operator@example.com"),
      member("viewer", viewerUserId, "viewer@example.com"),
    ]);
    const app = createAdminApp(repository, {
      owner: { userId: ownerUserId, email: "owner@example.com" },
      operator: { userId: operatorUserId, email: "operator@example.com" },
      viewer: { userId: viewerUserId, email: "viewer@example.com" },
    });

    expect(
      (await request(app).get("/api/admin/members").set("Authorization", "Bearer operator")).status,
    ).toBe(403);
    expect(
      (await request(app).get("/api/admin/members").set("Authorization", "Bearer viewer")).status,
    ).toBe(403);
    expect(
      (await request(app).get("/api/admin/members").set("Authorization", "Bearer owner")).status,
    ).toBe(200);
  });

  it("invites a normalized email and safely resends an existing invitation", async () => {
    const repository = new InMemoryAdminMemberRepository([member("owner", ownerUserId)]);
    const invitations: string[] = [];
    const app = createAdminApp(
      repository,
      { owner: { userId: ownerUserId, email: "owner@example.com" } },
      {
        async invite(email) {
          invitations.push(email);
        },
      },
    );

    for (const email of [" New.Member@Example.COM ", "new.member@example.com"]) {
      const response = await request(app)
        .post("/api/admin/members/invitations")
        .set("Authorization", "Bearer owner")
        .send({ email, role: "operator" });
      expect(response.status).toBe(202);
      expect(response.body.member).toMatchObject({
        email: "new.member@example.com",
        role: "operator",
        status: "invited",
      });
    }

    expect(invitations).toEqual(["new.member@example.com", "new.member@example.com"]);
    expect((await repository.list()).filter((entry) => entry.email === "new.member@example.com")).toHaveLength(1);
  });

  it("rejects duplicate active members and surfaces magic-link delivery failure without token material", async () => {
    const repository = new InMemoryAdminMemberRepository([
      member("owner", ownerUserId),
      member("viewer", viewerUserId, "active@example.com"),
    ]);
    const app = createAdminApp(
      repository,
      { owner: { userId: ownerUserId, email: "owner@example.com" } },
      {
        async invite() {
          throw new Error("provider_failed_without_secret");
        },
      },
    );

    const duplicate = await request(app)
      .post("/api/admin/members/invitations")
      .set("Authorization", "Bearer owner")
      .send({ email: "active@example.com", role: "viewer" });
    const failed = await request(app)
      .post("/api/admin/members/invitations")
      .set("Authorization", "Bearer owner")
      .send({ email: "failed@example.com", role: "viewer" });

    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({ error: "admin_member_already_active" });
    expect(failed.status).toBe(500);
    expect(JSON.stringify(failed.body)).not.toContain("provider_failed_without_secret");
  });

  it("protects self-disable and the final active owner while allowing safe changes", async () => {
    const secondOwnerUserId = randomUUID();
    const firstOwner = member("owner", ownerUserId);
    const secondOwner = member("owner", secondOwnerUserId, "second.owner@example.com");
    const operator = member("operator", operatorUserId, "operator@example.com");
    const repository = new InMemoryAdminMemberRepository([firstOwner, operator]);
    const app = createAdminApp(repository, {
      owner: { userId: ownerUserId, email: firstOwner.email },
    });

    const selfDisable = await updateMember(app, firstOwner.id, { status: "disabled" });
    const lastOwnerDemotion = await updateMember(app, firstOwner.id, { role: "viewer" });
    const safeRoleChange = await updateMember(app, operator.id, { role: "viewer" });

    expect(selfDisable.body).toEqual({ error: "admin_member_cannot_disable_self" });
    expect(lastOwnerDemotion.body).toEqual({ error: "admin_last_owner_required" });
    expect(safeRoleChange.status).toBe(200);
    expect(safeRoleChange.body.member.role).toBe("viewer");

    const repositoryWithTwoOwners = new InMemoryAdminMemberRepository([firstOwner, secondOwner]);
    const appWithTwoOwners = createAdminApp(repositoryWithTwoOwners, {
      owner: { userId: ownerUserId, email: firstOwner.email },
    });
    const demotion = await updateMember(appWithTwoOwners, secondOwner.id, { role: "operator" });
    expect(demotion.status).toBe(200);
    expect(demotion.body.member.role).toBe("operator");
  });

  it("rejects disabled members and separates customer/admin CORS allowlists", async () => {
    const disabled = member("viewer", viewerUserId, "disabled@example.com", "disabled");
    const owner = member("owner", ownerUserId);
    const repository = new InMemoryAdminMemberRepository([disabled, owner]);
    const config = createRuntimeConfig({
      CUSTOMER_CORS_ORIGINS: "https://app.example.com",
      ADMIN_CORS_ORIGINS: "https://admin.example.com",
    });
    const app = createAdminApp(
      repository,
      {
        disabled: { userId: viewerUserId, email: disabled.email },
        owner: { userId: ownerUserId, email: owner.email },
      },
      undefined,
      config,
    );

    expect(
      (await request(app).get("/api/admin/session").set("Authorization", "Bearer disabled")).status,
    ).toBe(403);

    const allowedAdmin = await request(app)
      .get("/api/admin/session")
      .set("Origin", "https://admin.example.com");
    const rejectedAdmin = await request(app)
      .get("/api/admin/session")
      .set("Origin", "https://app.example.com");
    const allowedCustomer = await request(app).get("/health").set("Origin", "https://app.example.com");
    const rejectedCustomer = await request(app).get("/health").set("Origin", "https://admin.example.com");
    const mixedCaseAdmin = await request(app)
      .get("/API/ADMIN/session")
      .set("Origin", "https://app.example.com")
      .set("Authorization", "Bearer owner");

    expect(allowedAdmin.headers["access-control-allow-origin"]).toBe("https://admin.example.com");
    expect(rejectedAdmin.headers["access-control-allow-origin"]).toBeUndefined();
    expect(allowedCustomer.headers["access-control-allow-origin"]).toBe("https://app.example.com");
    expect(rejectedCustomer.headers["access-control-allow-origin"]).toBeUndefined();
    expect(mixedCaseAdmin.status).toBe(404);
  });
});

function createAdminApp(
  repository: InMemoryAdminMemberRepository,
  identities: Record<string, VerifiedAdminIdentity>,
  inviteService: AdminInviteService = { async invite() {} },
  config = createRuntimeConfig(),
) {
  const verifier: AdminTokenVerifier = {
    async verify(token) {
      return identities[token] ?? null;
    },
  };
  return createApp(config, {
    adminMemberRepository: repository,
    adminTokenVerifier: verifier,
    adminInviteService: inviteService,
  });
}

function member(
  role: StoredAdminMember["role"],
  userId: string | null,
  email = "owner@example.com",
  status: StoredAdminMember["status"] = "active",
): StoredAdminMember {
  const now = "2026-07-19T00:00:00.000Z";
  return {
    id: randomUUID(),
    userId,
    email,
    role,
    status,
    invitedByUserId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function updateMember(
  app: ReturnType<typeof createApp>,
  memberId: string,
  body: Record<string, string>,
) {
  return request(app)
    .patch(`/api/admin/members/${memberId}`)
    .set("Authorization", "Bearer owner")
    .send(body);
}
