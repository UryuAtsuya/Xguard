import type { BackupRun, ProofPageVisibility, ProofPublicPayload } from "../../shared/types";

export interface HealthResponse {
  ok: boolean;
  service: string;
  mode: string;
  xOAuthMode: "mock" | "configured";
  timestamp: string;
}

export interface OAuthStartResponse {
  authorizationUrl: string;
  scopes: string[];
  state: string;
  mode: "mock" | "configured";
  callbackUrl: string;
  writesEnabled: boolean;
}

export interface OAuthCallbackResponse {
  connectedAccount: {
    id: string;
    username: string;
    displayName?: string;
  };
  sessionToken: string;
  tokenStorage: "repository-ref-only";
  writesEnabled: boolean;
}

export interface BackupRunResponse {
  backupRun: BackupRun;
}

export interface ProofVisibilityResponse {
  runId: string;
  visibility: ProofPageVisibility;
  revokedAt: string | null;
}

const apiBaseUrl = import.meta.env.VITE_XGUARD_API_BASE_URL ?? "";

export async function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/health");
}

export async function startOAuth(): Promise<OAuthStartResponse> {
  return requestJson<OAuthStartResponse>("/api/x/oauth/start");
}

export async function completeOAuthCallback(code: string, state: string): Promise<OAuthCallbackResponse> {
  const params = new URLSearchParams({ code, state });
  return requestJson<OAuthCallbackResponse>(`/api/x/oauth/callback?${params.toString()}`);
}

export async function runBackup(tweetLimit: number, sessionToken: string): Promise<BackupRunResponse> {
  return requestJson<BackupRunResponse>("/api/backup/run", {
    method: "POST",
    headers: {
      authorization: `Bearer ${sessionToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ tweetLimit }),
  });
}

export async function fetchBackupStatus(runId: string, sessionToken: string): Promise<BackupRun> {
  return requestJson<BackupRun>(`/api/backup/status/${runId}`, {
    headers: authHeaders(sessionToken),
  });
}

export async function updateProofVisibility(
  runId: string,
  visibility: Extract<ProofPageVisibility, "unlisted" | "public" | "revoked">,
  sessionToken: string,
): Promise<ProofVisibilityResponse> {
  return requestJson<ProofVisibilityResponse>(`/api/recovery/${runId}/proof/visibility`, {
    method: "PATCH",
    headers: {
      ...authHeaders(sessionToken),
      "content-type": "application/json",
    },
    body: JSON.stringify({ visibility }),
  });
}

export async function fetchProofPayload(runId: string, sessionToken: string): Promise<ProofPublicPayload> {
  return requestJson<ProofPublicPayload>(`/api/recovery/${runId}/proof`, {
    headers: authHeaders(sessionToken),
  });
}

function authHeaders(sessionToken: string): HeadersInit {
  return {
    authorization: `Bearer ${sessionToken}`,
  };
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);

  if (!response.ok) {
    throw new Error(`request_failed:${response.status}`);
  }

  return response.json() as Promise<T>;
}
