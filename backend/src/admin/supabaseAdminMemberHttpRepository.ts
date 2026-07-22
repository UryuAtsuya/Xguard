import type { AdminRole } from "../../../shared/admin.js";
import {
  type AdminMemberRepository,
  AdminMemberGuardError,
  type AdminMembershipEvent,
  type StoredAdminMember,
  normalizeAdminEmail,
} from "./adminMemberRepository.js";

interface SupabaseAdminMemberRow {
  id: string;
  user_id: string | null;
  email: string;
  role: StoredAdminMember["role"];
  status: StoredAdminMember["status"];
  invited_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SupabaseAdminMembershipEventRow {
  id: string;
  actor_user_id: string | null;
  member_id: string;
  event_type: AdminMembershipEvent["eventType"];
  details: Record<string, unknown>;
  created_at: string;
}

export interface SupabaseAdminMemberHttpRepositoryOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class SupabaseAdminMemberHttpRepository implements AdminMemberRepository {
  private readonly membersEndpoint: URL;
  private readonly eventsEndpoint: URL;
  private readonly safeUpdateEndpoint: URL;
  private readonly serviceRoleKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: SupabaseAdminMemberHttpRepositoryOptions) {
    const supabaseUrl = parseSupabaseUrl(options.supabaseUrl);
    this.membersEndpoint = new URL("/rest/v1/admin_members", supabaseUrl);
    this.eventsEndpoint = new URL("/rest/v1/admin_membership_events", supabaseUrl);
    this.safeUpdateEndpoint = new URL("/rest/v1/rpc/update_admin_member_safely", supabaseUrl);
    this.serviceRoleKey = requireNonEmpty("SUPABASE_SERVICE_ROLE_KEY", options.serviceRoleKey);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  async findByEmail(email: string): Promise<StoredAdminMember | null> {
    const url = this.membersUrl({
      email: `eq.${normalizeAdminEmail(email)}`,
      limit: "1",
    });
    const rows = await this.fetchMemberRows(url, "find_admin_member_by_email");
    return rows[0] ? rowToMember(rows[0]) : null;
  }

  async findById(id: string): Promise<StoredAdminMember | null> {
    const url = this.membersUrl({ id: `eq.${id}`, limit: "1" });
    const rows = await this.fetchMemberRows(url, "find_admin_member_by_id");
    return rows[0] ? rowToMember(rows[0]) : null;
  }

  async list(): Promise<StoredAdminMember[]> {
    const rows = await this.fetchMemberRows(
      this.membersUrl({ order: "email.asc" }),
      "list_admin_members",
    );
    return rows.map(rowToMember);
  }

  async saveInvitation(input: {
    email: string;
    role: AdminRole;
    invitedByUserId: string | null;
    now: string;
  }): Promise<StoredAdminMember> {
    const url = new URL(this.membersEndpoint);
    url.searchParams.set("on_conflict", "email");
    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=representation",
      },
      body: JSON.stringify({
        email: normalizeAdminEmail(input.email),
        role: input.role,
        status: "invited",
        invited_by_user_id: input.invitedByUserId,
        created_at: input.now,
        updated_at: input.now,
      }),
    });
    const rows = await parseRows<SupabaseAdminMemberRow>(response, "save_admin_invitation");
    const stored = rows[0] ? rowToMember(rows[0]) : await this.findByEmail(input.email);

    if (!stored) {
      throw new Error("save_admin_invitation_empty_response");
    }

    return stored;
  }

  async activate(input: {
    memberId: string;
    userId: string;
    now: string;
  }): Promise<StoredAdminMember> {
    const member = await this.patchMember(
      input.memberId,
      {
        user_id: input.userId,
        status: "active",
        updated_at: input.now,
      },
      "activate_admin_member",
    );

    if (!member) {
      throw new Error("admin_member_not_found");
    }

    return member;
  }

  async update(input: {
    memberId: string;
    role?: AdminRole;
    status?: "active" | "disabled";
    now: string;
  }): Promise<StoredAdminMember | null> {
    return this.patchMember(
      input.memberId,
      {
        ...(input.role ? { role: input.role } : {}),
        ...(input.status ? { status: input.status } : {}),
        updated_at: input.now,
      },
      "update_admin_member",
    );
  }

  async countActiveOwners(): Promise<number> {
    const rows = await this.fetchMemberRows(
      this.membersUrl({
        role: "eq.owner",
        status: "eq.active",
        select: "id,email,role,status,user_id,invited_by_user_id,created_at,updated_at",
      }),
      "count_active_admin_owners",
    );
    return rows.length;
  }

  async updateSafely(input: {
    actorMemberId: string;
    memberId: string;
    role?: AdminRole;
    status?: "active" | "disabled";
    now: string;
  }): Promise<StoredAdminMember> {
    const response = await this.fetchWithTimeout(this.safeUpdateEndpoint, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_actor_member_id: input.actorMemberId,
        p_member_id: input.memberId,
        p_role: input.role ?? null,
        p_status: input.status ?? null,
        p_updated_at: input.now,
      }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
      const code = typeof body?.message === "string" ? body.message.split(":")[0] : undefined;
      if (code?.startsWith("admin_")) {
        throw new AdminMemberGuardError(code);
      }
      throw new Error(`update_admin_member_safely_failed:${response.status}`);
    }

    const row = (await response.json()) as SupabaseAdminMemberRow;
    return rowToMember(row);
  }

  async recordEvent(
    event: Omit<AdminMembershipEvent, "id" | "createdAt"> & {
      id?: string;
      createdAt?: string;
    },
  ): Promise<AdminMembershipEvent> {
    const response = await this.fetchWithTimeout(this.eventsEndpoint, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        ...(event.id ? { id: event.id } : {}),
        actor_user_id: event.actorUserId,
        member_id: event.memberId,
        event_type: event.eventType,
        details: event.details,
        ...(event.createdAt ? { created_at: event.createdAt } : {}),
      }),
    });
    const rows = await parseRows<SupabaseAdminMembershipEventRow>(
      response,
      "record_admin_membership_event",
    );
    return eventRowToEvent(requireFirst(rows, "record_admin_membership_event"));
  }

  private async patchMember(
    memberId: string,
    body: Record<string, unknown>,
    operation: string,
  ): Promise<StoredAdminMember | null> {
    const url = this.membersUrl({ id: `eq.${memberId}` });
    const response = await this.fetchWithTimeout(url, {
      method: "PATCH",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(body),
    });
    const rows = await parseRows<SupabaseAdminMemberRow>(response, operation);
    return rows[0] ? rowToMember(rows[0]) : null;
  }

  private async fetchMemberRows(url: URL, operation: string): Promise<SupabaseAdminMemberRow[]> {
    const response = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: this.headers(),
    });
    return parseRows<SupabaseAdminMemberRow>(response, operation);
  }

  private membersUrl(params: Record<string, string>): URL {
    const url = new URL(this.membersEndpoint);
    url.searchParams.set(
      "select",
      "id,user_id,email,role,status,invited_by_user_id,created_at,updated_at",
    );
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
    return url;
  }

  private headers(): Record<string, string> {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
    };
  }

  private async fetchWithTimeout(url: URL, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error("supabase_admin_members_timeout");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function rowToMember(row: SupabaseAdminMemberRow): StoredAdminMember {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    role: row.role,
    status: row.status,
    invitedByUserId: row.invited_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function eventRowToEvent(row: SupabaseAdminMembershipEventRow): AdminMembershipEvent {
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    memberId: row.member_id,
    eventType: row.event_type,
    details: { ...row.details },
    createdAt: row.created_at,
  };
}

function parseSupabaseUrl(value: string): string {
  const trimmed = requireNonEmpty("SUPABASE_URL", value);
  try {
    return new URL(trimmed).toString();
  } catch {
    throw new Error("invalid_runtime_env:SUPABASE_URL");
  }
}

function requireNonEmpty(fieldName: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`invalid_runtime_env:${fieldName}`);
  }
  return trimmed;
}

async function parseRows<T>(response: Response, operation: string): Promise<T[]> {
  if (!response.ok) {
    throw new Error(`${operation}_failed:${response.status}`);
  }
  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) {
    throw new Error(`${operation}_invalid_response`);
  }
  return body as T[];
}

function requireFirst<T>(rows: T[], operation: string): T {
  const row = rows[0];
  if (!row) {
    throw new Error(`${operation}_empty_response`);
  }
  return row;
}
