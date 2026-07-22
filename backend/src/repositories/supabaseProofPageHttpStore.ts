import type {
  SupabaseProofPageEntryRow,
  SupabaseProofPageRow,
  SupabaseProofPageStore,
} from "./proofPageRepository.js";

export interface SupabaseProofPageHttpStoreOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class SupabaseProofPageHttpStore implements SupabaseProofPageStore {
  private readonly restEndpoint: URL;
  private readonly transactionEndpoint: URL;
  private readonly serviceRoleKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: SupabaseProofPageHttpStoreOptions) {
    const supabaseUrl = parseSupabaseUrl(options.supabaseUrl);
    this.restEndpoint = new URL("/rest/v1/proof_pages", supabaseUrl);
    this.transactionEndpoint = new URL(
      "/rest/v1/rpc/update_proof_page_visibility_and_record_content_compliance_event",
      supabaseUrl,
    );
    this.serviceRoleKey = requireNonEmpty("SUPABASE_SERVICE_ROLE_KEY", options.serviceRoleKey);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  async insertProofPage(row: {
    backup_run: SupabaseProofPageEntryRow["backup_run"];
    proof_page: Omit<SupabaseProofPageRow, "id" | "created_at" | "updated_at"> & {
      id?: string;
      created_at?: string;
      updated_at?: string;
    };
  }): Promise<SupabaseProofPageEntryRow> {
    const response = await this.fetchWithTimeout(this.restEndpoint, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(row.proof_page),
    });

    return {
      backup_run: row.backup_run,
      proof_page: firstProofPageRow(await parseProofPageRowsResponse(response, "insert_proof_page")),
    };
  }

  async findProofPageByRunId(runId: string): Promise<SupabaseProofPageEntryRow | null> {
    const rows = await this.fetchProofPages({ backup_run_id: `eq.${runId}`, limit: "1" }, "find_proof_page");
    return rows[0] ?? null;
  }

  async listProofPagesByUser(userId: string): Promise<SupabaseProofPageEntryRow[]> {
    return this.fetchProofPages({ user_id: `eq.${userId}`, order: "created_at.desc" }, "list_proof_pages");
  }

  async listAllProofPages(): Promise<SupabaseProofPageEntryRow[]> {
    return this.fetchProofPages({ order: "created_at.desc" }, "list_all_proof_pages");
  }

  async updateProofPageVisibility(input: {
    backup_run_id: string;
    visibility: SupabaseProofPageRow["visibility"];
    revoked_at: string | null;
    updated_at: string;
  }): Promise<SupabaseProofPageEntryRow | null> {
    const url = new URL(this.restEndpoint);
    url.searchParams.set("backup_run_id", `eq.${input.backup_run_id}`);
    url.searchParams.set("select", "*,backup_run:backup_runs(*)");

    const response = await this.fetchWithTimeout(url, {
      method: "PATCH",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        visibility: input.visibility,
        revoked_at: input.revoked_at,
        updated_at: input.updated_at,
      }),
    });

    const rows = await parseProofPageEntryRowsResponse(response, "update_proof_page_visibility");
    return rows[0] ?? null;
  }

  async updateProofPageVisibilityAndRecordContentComplianceEvent(input: Parameters<
    SupabaseProofPageStore["updateProofPageVisibilityAndRecordContentComplianceEvent"]
  >[0]): Promise<SupabaseProofPageEntryRow | null> {
    const response = await this.fetchWithTimeout(this.transactionEndpoint, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_backup_run_id: input.proof_page.backup_run_id,
        p_visibility: input.proof_page.visibility,
        p_revoked_at: input.proof_page.revoked_at,
        p_updated_at: input.proof_page.updated_at,
        p_event_id: input.content_compliance_event.id ?? null,
        p_x_account_id: input.content_compliance_event.x_account_id,
        p_tweet_snapshot_id: input.content_compliance_event.tweet_snapshot_id ?? null,
        p_proof_page_id: input.content_compliance_event.proof_page_id ?? null,
        p_event_type: input.content_compliance_event.event_type,
        p_source: input.content_compliance_event.source,
        p_details: input.content_compliance_event.details,
        p_resolved_at: input.content_compliance_event.resolved_at ?? null,
        p_created_at: input.content_compliance_event.created_at ?? null,
      }),
    });

    return parseProofPageEntryResponse(response, "update_proof_page_visibility_and_record_content_compliance_event");
  }

  private async fetchProofPages(
    params: Record<string, string>,
    operation: string,
  ): Promise<SupabaseProofPageEntryRow[]> {
    const url = new URL(this.restEndpoint);
    url.searchParams.set("select", "*,backup_run:backup_runs(*)");
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    const response = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: this.headers(),
    });

    return parseProofPageEntryRowsResponse(response, operation);
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
        throw new Error("supabase_proof_pages_timeout");
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

async function parseProofPageEntryResponse(
  response: Response,
  operation: string,
): Promise<SupabaseProofPageEntryRow | null> {
  if (!response.ok) {
    throw new Error(`${operation}_failed:${response.status}`);
  }

  const body = (await response.json()) as unknown;
  if (body === null) {
    return null;
  }

  return body as SupabaseProofPageEntryRow;
}

async function parseProofPageEntryRowsResponse(
  response: Response,
  operation: string,
): Promise<SupabaseProofPageEntryRow[]> {
  if (!response.ok) {
    throw new Error(`${operation}_failed:${response.status}`);
  }

  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) {
    throw new Error(`${operation}_invalid_response`);
  }

  return body as SupabaseProofPageEntryRow[];
}

async function parseProofPageRowsResponse(
  response: Response,
  operation: string,
): Promise<SupabaseProofPageRow[]> {
  if (!response.ok) {
    throw new Error(`${operation}_failed:${response.status}`);
  }

  const body = (await response.json()) as unknown;
  if (!Array.isArray(body)) {
    throw new Error(`${operation}_invalid_response`);
  }

  return body as SupabaseProofPageRow[];
}

function firstProofPageRow(rows: SupabaseProofPageRow[]): SupabaseProofPageRow {
  const [row] = rows;

  if (!row) {
    throw new Error("insert_proof_page_empty_response");
  }

  return row;
}
