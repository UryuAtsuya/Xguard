import type { OAuthStateConsumeResult, OAuthStateRecord, OAuthStateRepository } from "./oauthStateRepository.js";

export interface SupabaseOAuthStateHttpStoreOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface SupabaseOAuthStateRow {
  state: string;
  code_verifier: string;
  requested_username?: string | null;
  expires_at: string;
  created_at?: string;
}

export class SupabaseOAuthStateHttpStore implements OAuthStateRepository {
  private readonly endpoint: URL;
  private readonly serviceRoleKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: SupabaseOAuthStateHttpStoreOptions) {
    this.endpoint = new URL("/rest/v1/oauth_states", parseSupabaseUrl(options.supabaseUrl));
    this.serviceRoleKey = requireNonEmpty("SUPABASE_SERVICE_ROLE_KEY", options.serviceRoleKey);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  async save(record: OAuthStateRecord): Promise<void> {
    const response = await this.fetchWithTimeout(this.endpoint, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state: record.state,
        code_verifier: record.codeVerifier,
        requested_username: record.requestedUsername ?? null,
        expires_at: record.expiresAt.toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`save_oauth_state_failed:${response.status}`);
    }
  }

  async consume(state: string): Promise<OAuthStateConsumeResult> {
    const url = new URL(this.endpoint);
    url.searchParams.set("state", `eq.${state}`);

    const response = await this.fetchWithTimeout(url, {
      method: "DELETE",
      headers: {
        ...this.headers(),
        Prefer: "return=representation",
      },
    });

    const [row] = await parseRowsResponse(response, "consume_oauth_state");

    if (!row) {
      return { ok: false, reason: "not_found" };
    }

    const record = {
      state: row.state,
      codeVerifier: row.code_verifier,
      requestedUsername: row.requested_username ?? undefined,
      expiresAt: new Date(row.expires_at),
    };

    if (record.expiresAt.getTime() <= Date.now()) {
      return { ok: false, reason: "expired" };
    }

    return { ok: true, record };
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
        throw new Error("supabase_oauth_states_timeout");
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
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

async function parseRowsResponse(response: Response, operation: string): Promise<SupabaseOAuthStateRow[]> {
  if (!response.ok) {
    throw new Error(`${operation}_failed:${response.status}`);
  }

  const body = (await response.json()) as unknown;

  if (!Array.isArray(body)) {
    throw new Error(`${operation}_invalid_response`);
  }

  return body as SupabaseOAuthStateRow[];
}
