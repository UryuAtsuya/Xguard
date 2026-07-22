import type { AdminRole } from "../../../shared/admin.js";
import type { AdminInviteService } from "./adminInviteService.js";
import {
  AdminMemberGuardError,
  type AdminMemberRepository,
  type StoredAdminMember,
  normalizeAdminEmail,
} from "./adminMemberRepository.js";
import type { VerifiedAdminIdentity } from "./adminAuth.js";

export class AdminServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
  ) {
    super(code);
  }
}

export class AdminService {
  constructor(
    private readonly members: AdminMemberRepository,
    private readonly invites: AdminInviteService,
  ) {}

  async resolveSession(identity: VerifiedAdminIdentity): Promise<StoredAdminMember> {
    const member = await this.members.findByEmail(identity.email);

    if (!member || member.status === "disabled") {
      throw new AdminServiceError("admin_access_denied", 403);
    }

    if (member.userId && member.userId !== identity.userId) {
      throw new AdminServiceError("admin_identity_mismatch", 403);
    }

    if (member.status === "active" && member.userId === identity.userId) {
      return member;
    }

    const now = new Date().toISOString();
    const activated = await this.members.activate({
      memberId: member.id,
      userId: identity.userId,
      now,
    });
    await this.members.recordEvent({
      actorUserId: identity.userId,
      memberId: member.id,
      eventType: "activated",
      details: {},
      createdAt: now,
    });
    return activated;
  }

  async listMembers(): Promise<StoredAdminMember[]> {
    return this.members.list();
  }

  async inviteMember(input: {
    actor: StoredAdminMember;
    email: string;
    role: AdminRole;
    redirectTo: string;
  }): Promise<StoredAdminMember> {
    const email = normalizeAdminEmail(input.email);
    const existing = await this.members.findByEmail(email);
    const now = new Date().toISOString();

    if (existing?.status === "active") {
      throw new AdminServiceError("admin_member_already_active", 409);
    }

    if (existing?.status === "disabled") {
      throw new AdminServiceError("admin_member_disabled", 409);
    }

    if (existing && existing.role !== input.role) {
      throw new AdminServiceError("admin_invitation_role_conflict", 409);
    }

    const member =
      existing ??
      (await this.members.saveInvitation({
        email,
        role: input.role,
        invitedByUserId: input.actor.userId,
        now,
      }));

    if (member.status === "active") {
      throw new AdminServiceError("admin_member_already_active", 409);
    }

    if (member.status === "disabled") {
      throw new AdminServiceError("admin_member_disabled", 409);
    }

    if (member.role !== input.role) {
      throw new AdminServiceError("admin_invitation_role_conflict", 409);
    }

    await this.invites.invite(email, input.redirectTo);
    await this.members.recordEvent({
      actorUserId: input.actor.userId,
      memberId: member.id,
      eventType: existing ? "invitation_resent" : "invited",
      details: { role: input.role },
      createdAt: now,
    });
    return member;
  }

  async updateMember(input: {
    actor: StoredAdminMember;
    memberId: string;
    role?: AdminRole;
    status?: "active" | "disabled";
  }): Promise<StoredAdminMember> {
    const target = await this.members.findById(input.memberId);

    if (!target) {
      throw new AdminServiceError("admin_member_not_found", 404);
    }

    if (!input.role && !input.status) {
      throw new AdminServiceError("admin_member_update_empty", 400);
    }

    if (target.status === "invited" && input.status === "active") {
      throw new AdminServiceError("admin_member_activation_requires_login", 409);
    }

    if (input.status === "active" && !target.userId) {
      throw new AdminServiceError("admin_member_activation_requires_login", 409);
    }

    if (target.id === input.actor.id && input.status === "disabled") {
      throw new AdminServiceError("admin_member_cannot_disable_self", 409);
    }

    const removesActiveOwner =
      target.role === "owner" &&
      target.status === "active" &&
      ((input.role !== undefined && input.role !== "owner") || input.status === "disabled");

    if (removesActiveOwner && (await this.members.countActiveOwners()) <= 1) {
      throw new AdminServiceError("admin_last_owner_required", 409);
    }

    const now = new Date().toISOString();

    if (this.members.updateSafely) {
      try {
        return await this.members.updateSafely({
          actorMemberId: input.actor.id,
          memberId: target.id,
          role: input.role,
          status: input.status,
          now,
        });
      } catch (error) {
        if (error instanceof AdminMemberGuardError) {
          throw new AdminServiceError(error.code, adminGuardStatus(error.code));
        }
        throw error;
      }
    }

    const updated = await this.members.update({
      memberId: target.id,
      role: input.role,
      status: input.status,
      now,
    });

    if (!updated) {
      throw new AdminServiceError("admin_member_not_found", 404);
    }

    if (input.role && input.role !== target.role) {
      await this.members.recordEvent({
        actorUserId: input.actor.userId,
        memberId: target.id,
        eventType: "role_changed",
        details: { from: target.role, to: input.role },
        createdAt: now,
      });
    }

    if (input.status && input.status !== target.status) {
      await this.members.recordEvent({
        actorUserId: input.actor.userId,
        memberId: target.id,
        eventType: input.status === "disabled" ? "disabled" : "reactivated",
        details: { from: target.status, to: input.status },
        createdAt: now,
      });
    }

    return updated;
  }
}

function adminGuardStatus(code: string): number {
  return code === "admin_member_not_found" ? 404 : code === "admin_owner_required" ? 403 : 409;
}
