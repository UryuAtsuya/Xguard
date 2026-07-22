import type {
  SupabaseContentComplianceEventRow,
  SupabaseContentComplianceEventStore,
} from "./supabaseContentComplianceEventRepository.js";

export interface SupabaseContentComplianceEventHttpStoreOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class SupabaseContentComplianceEventHttpStore implements SupabaseContentComplianceEventStore {
  private readonly endpoint: URL;
  private readonly serviceRoleKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: SupabaseContentComplianceEventHttpStoreOptions) {
    this.endpoint = new URL("/rest/v1/content_compliance_events", parseSupabaseUrl(options.supabaseUrl));
    this.serviceRoleKey = requireNonEmpty("SUPABASE_SERVICE_ROLE_KEY", options.serviceRoleKey);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  async insertContentComplianceEvent(
    row: Omit<SupabaseContentComplianceEventRow, "id" | "created_at"> & {
      id?: string;
      created_at?: string;
    },
  ): Promise<SupabaseContentComplianceEventRow> {
    const response = await this.fetchWithTimeout(this.endpoint, {
      method: "POST",
      headers: {
        ...this.headers(),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });

    return firstRow(await parseRowsResponse(response, "insert_content_compliance_event"));
  }

  async listContentComplianceEventsByXAccount(xAccountId: string): Promise<SupabaseContentComplianceEventRow[]> {
    const url = new URL(this.endpoint);
    url.searchParams.set("x_account_id", `eq.${xAccountId}`);
    url.searchParams.set("order", "created_at.desc");

    const response = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: this.headers(),
    });

    return parseRowsResponse(response, "list_content_compliance_events");
  }

  async listAllContentComplianceEvents(): Promise<SupabaseContentComplianceEventRow[]> {
    const url = new URL(this.endpoint);
    url.searchParams.set("order", "created_at.desc");

    const response = await this.fetchWithTimeout(url, {
      method: "GET",
      headers: this.headers(),
    });

    return parseRowsResponse(response, "list_all_content_compliance_events");
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
        throw new Error("supabase_content_compliance_events_timeout");
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

async function parseRowsResponse(
  response: Response,
  operation: string,
): Promise<SupabaseContentComplianceEventRow[]> {
  if (!response.ok) {
    throw new Error(`${operation}_failed:${response.status}`);
  }

  const body = (await response.json()) as unknown;

  if (!Array.isArray(body)) {
    throw new Error(`${operation}_invalid_response`);
  }

  return body as SupabaseContentComplianceEventRow[];
}

function firstRow(rows: SupabaseContentComplianceEventRow[]): SupabaseContentComplianceEventRow {
  const [row] = rows;

  if (!row) {
    throw new Error("insert_content_compliance_event_empty_response");
  }

  return row;
}
