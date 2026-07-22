export type AdminRole = "owner" | "operator" | "viewer";

export type AdminMemberStatus = "invited" | "active" | "disabled";

export interface AdminMember {
  id: string;
  email: string;
  role: AdminRole;
  status: AdminMemberStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdminSessionResponse {
  member: AdminMember;
}

export interface AdminMembersResponse {
  members: AdminMember[];
}
