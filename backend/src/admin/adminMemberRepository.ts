import { randomUUID } from "node:crypto";
import type { AdminMember, AdminMemberStatus, AdminRole } from "../../../shared/admin.js";

export interface StoredAdminMember extends AdminMember {
  userId: string | null;
  invitedByUserId: string | null;
}

export type AdminMembershipEventType =
  | "invited"
  | "invitation_resent"
  | "activated"
  | "role_changed"
  | "disabled"
  | "reactivated";

export interface AdminMembershipEvent {
  id: string;
  actorUserId: string | null;
  memberId: string;
  eventType: AdminMembershipEventType;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface AdminMemberRepository {
  findByEmail(email: string): Promise<StoredAdminMember | null>;
  findById(id: string): Promise<StoredAdminMember | null>;
  list(): Promise<StoredAdminMember[]>;
  saveInvitation(input: {
    email: string;
    role: AdminRole;
    invitedByUserId: string | null;
    now: string;
  }): Promise<StoredAdminMember>;
  activate(input: {
    memberId: string;
    userId: string;
    now: string;
  }): Promise<StoredAdminMember>;
  update(input: {
    memberId: string;
    role?: AdminRole;
    status?: Exclude<AdminMemberStatus, "invited">;
    now: string;
  }): Promise<StoredAdminMember | null>;
  updateSafely?(input: {
    actorMemberId: string;
    memberId: string;
    role?: AdminRole;
    status?: Exclude<AdminMemberStatus, "invited">;
    now: string;
  }): Promise<StoredAdminMember>;
  countActiveOwners(): Promise<number>;
  recordEvent(event: Omit<AdminMembershipEvent, "id" | "createdAt"> & {
    id?: string;
    createdAt?: string;
  }): Promise<AdminMembershipEvent>;
}

export class AdminMemberGuardError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export class InMemoryAdminMemberRepository implements AdminMemberRepository {
  private readonly members = new Map<string, StoredAdminMember>();
  private readonly events = new Map<string, AdminMembershipEvent>();

  constructor(initialMembers: StoredAdminMember[] = []) {
    for (const member of initialMembers) {
      this.members.set(member.id, cloneMember(member));
    }
  }

  async findByEmail(email: string): Promise<StoredAdminMember | null> {
    const normalized = normalizeAdminEmail(email);
    const member = [...this.members.values()].find((candidate) => candidate.email === normalized);
    return member ? cloneMember(member) : null;
  }

  async findById(id: string): Promise<StoredAdminMember | null> {
    const member = this.members.get(id);
    return member ? cloneMember(member) : null;
  }

  async list(): Promise<StoredAdminMember[]> {
    return [...this.members.values()]
      .sort((left, right) => left.email.localeCompare(right.email))
      .map(cloneMember);
  }

  async saveInvitation(input: {
    email: string;
    role: AdminRole;
    invitedByUserId: string | null;
    now: string;
  }): Promise<StoredAdminMember> {
    const email = normalizeAdminEmail(input.email);
    const existing = await this.findByEmail(email);

    if (existing) {
      return existing;
    }

    const member: StoredAdminMember = {
      id: randomUUID(),
      userId: null,
      email,
      role: input.role,
      status: "invited",
      invitedByUserId: input.invitedByUserId,
      createdAt: input.now,
      updatedAt: input.now,
    };
    this.members.set(member.id, member);
    return cloneMember(member);
  }

  async activate(input: {
    memberId: string;
    userId: string;
    now: string;
  }): Promise<StoredAdminMember> {
    const member = this.members.get(input.memberId);

    if (!member) {
      throw new Error("admin_member_not_found");
    }

    const updated = {
      ...member,
      userId: input.userId,
      status: "active" as const,
      updatedAt: input.now,
    };
    this.members.set(member.id, updated);
    return cloneMember(updated);
  }

  async update(input: {
    memberId: string;
    role?: AdminRole;
    status?: "active" | "disabled";
    now: string;
  }): Promise<StoredAdminMember | null> {
    const member = this.members.get(input.memberId);

    if (!member) {
      return null;
    }

    const updated = {
      ...member,
      ...(input.role ? { role: input.role } : {}),
      ...(input.status ? { status: input.status } : {}),
      updatedAt: input.now,
    };
    this.members.set(member.id, updated);
    return cloneMember(updated);
  }

  async countActiveOwners(): Promise<number> {
    return [...this.members.values()].filter(
      (member) => member.role === "owner" && member.status === "active",
    ).length;
  }

  async recordEvent(
    event: Omit<AdminMembershipEvent, "id" | "createdAt"> & {
      id?: string;
      createdAt?: string;
    },
  ): Promise<AdminMembershipEvent> {
    const stored: AdminMembershipEvent = {
      ...event,
      id: event.id ?? randomUUID(),
      createdAt: event.createdAt ?? new Date().toISOString(),
      details: { ...event.details },
    };
    this.events.set(stored.id, stored);
    return cloneEvent(stored);
  }
}

export function normalizeAdminEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function toPublicAdminMember(member: StoredAdminMember): AdminMember {
  return {
    id: member.id,
    email: member.email,
    role: member.role,
    status: member.status,
    createdAt: member.createdAt,
    updatedAt: member.updatedAt,
  };
}

function cloneMember(member: StoredAdminMember): StoredAdminMember {
  return { ...member };
}

function cloneEvent(event: AdminMembershipEvent): AdminMembershipEvent {
  return {
    ...event,
    details: { ...event.details },
  };
}
