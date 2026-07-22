import type {
  AdminMember,
  AdminMembersResponse,
  AdminRole,
  AdminSessionResponse,
} from "../../../shared/admin";
import type { AdminDatabaseSnapshot } from "../../../shared/types";

const apiBaseUrl = import.meta.env.VITE_XGUARD_API_BASE_URL ?? "";

export class AdminApiError extends Error {
  constructor(public readonly status: number) {
    super(`admin_request_failed:${status}`);
  }
}

export function fetchAdminSession(accessToken: string): Promise<AdminSessionResponse> {
  return requestJson("/api/admin/session", accessToken);
}

export function fetchAdminDatabaseSnapshot(accessToken: string): Promise<AdminDatabaseSnapshot> {
  return requestJson("/api/admin/database-snapshot", accessToken);
}

export function fetchAdminMembers(accessToken: string): Promise<AdminMembersResponse> {
  return requestJson("/api/admin/members", accessToken);
}

export function inviteAdminMember(
  accessToken: string,
  input: { email: string; role: AdminRole },
): Promise<{ member: AdminMember }> {
  return requestJson("/api/admin/members/invitations", accessToken, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateAdminMember(
  accessToken: string,
  memberId: string,
  input: { role?: AdminRole; status?: "active" | "disabled" },
): Promise<{ member: AdminMember }> {
  return requestJson(`/api/admin/members/${encodeURIComponent(memberId)}`, accessToken, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

async function requestJson<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new AdminApiError(response.status);
  }

  return response.json() as Promise<T>;
}
