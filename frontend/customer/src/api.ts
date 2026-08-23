import type { BackupRun, ProofPublicPayload, XAccount } from "../../../shared/types";

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
  connectedAccount: XAccount;
  sessionToken: string;
  tokenStorage: "repository-ref-only";
  writesEnabled: boolean;
}

export interface CustomerSessionResponse {
  connectedAccount: XAccount;
  writesEnabled: boolean;
}

export interface BackupRunResponse {
  backupRun: BackupRun;
  proofPayload: ProofPublicPayload;
}

const apiBaseUrl = import.meta.env.VITE_XGUARD_API_BASE_URL ?? "";

export function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/health");
}

export function startOAuth(username: string): Promise<OAuthStartResponse> {
  const params = new URLSearchParams({ username });
  return requestJson<OAuthStartResponse>(`/api/x/oauth/start?${params.toString()}`);
}

export function completeOAuthCallback(code: string, state: string): Promise<OAuthCallbackResponse> {
  const params = new URLSearchParams({ code, state });
  return requestJson<OAuthCallbackResponse>(`/api/x/oauth/callback?${params.toString()}`);
}

export function fetchCustomerSession(sessionToken: string): Promise<CustomerSessionResponse> {
  return requestJson<CustomerSessionResponse>("/api/customer/session", {
    headers: { authorization: `Bearer ${sessionToken}` },
  });
}

export function runBackup(tweetLimit: number, sessionToken: string): Promise<BackupRunResponse> {
  return requestJson<BackupRunResponse>("/api/backup/run", {
    method: "POST",
    headers: {
      authorization: `Bearer ${sessionToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ tweetLimit }),
  });
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);

  if (!response.ok) {
    throw new Error(`request_failed:${response.status}`);
  }

  return response.json() as Promise<T>;
}
