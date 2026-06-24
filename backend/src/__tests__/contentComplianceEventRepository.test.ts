import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InMemoryContentComplianceEventRepository } from "../repositories/contentComplianceEventRepository.js";
import {
  SupabaseContentComplianceEventRepository,
  type SupabaseContentComplianceEventRow,
  type SupabaseContentComplianceEventStore,
} from "../repositories/supabaseContentComplianceEventRepository.js";

describe("Content compliance event repository", () => {
  it("stores immutable in-memory compliance events by x account", async () => {
    const repository = new InMemoryContentComplianceEventRepository();

    const event = await repository.record({
      xAccountId: "x-account-1",
      eventType: "proof_page_revoked",
      source: "user_request",
      details: { runId: "backup-run-1", previousVisibility: "public" },
      createdAt: "2026-06-15T04:30:00.000Z",
    });
    event.details.previousVisibility = "mutated";

    expect(await repository.listByXAccount("x-account-1")).toMatchObject([
      {
        xAccountId: "x-account-1",
        eventType: "proof_page_revoked",
        source: "user_request",
        details: { runId: "backup-run-1", previousVisibility: "public" },
        createdAt: "2026-06-15T04:30:00.000Z",
      },
    ]);
    expect(await repository.listByXAccount("x-account-2")).toEqual([]);
  });

  it("maps Supabase content_compliance_events rows without exposing table naming to callers", async () => {
    const store = new InMemorySupabaseContentComplianceEventStore();
    const repository = new SupabaseContentComplianceEventRepository(store);

    const recorded = await repository.record({
      xAccountId: "x-account-2",
      proofPageId: "proof-page-1",
      eventType: "proof_page_revoked",
      source: "user_request",
      details: { runId: "backup-run-2" },
      createdAt: "2026-06-15T04:35:00.000Z",
    });

    expect(recorded).toMatchObject({
      xAccountId: "x-account-2",
      proofPageId: "proof-page-1",
      eventType: "proof_page_revoked",
      source: "user_request",
      details: { runId: "backup-run-2" },
      createdAt: "2026-06-15T04:35:00.000Z",
    });
    expect(store.rows[0]).toMatchObject({
      x_account_id: "x-account-2",
      proof_page_id: "proof-page-1",
      event_type: "proof_page_revoked",
      source: "user_request",
      details: { runId: "backup-run-2" },
      created_at: "2026-06-15T04:35:00.000Z",
    });
    expect(await repository.listByXAccount("x-account-2")).toEqual([recorded]);
  });
});

class InMemorySupabaseContentComplianceEventStore implements SupabaseContentComplianceEventStore {
  readonly rows: SupabaseContentComplianceEventRow[] = [];

  async insertContentComplianceEvent(
    row: Omit<SupabaseContentComplianceEventRow, "id" | "created_at"> & {
      id?: string;
      created_at?: string;
    },
  ): Promise<SupabaseContentComplianceEventRow> {
    const storedRow: SupabaseContentComplianceEventRow = {
      ...row,
      id: row.id ?? randomUUID(),
      created_at: row.created_at ?? new Date().toISOString(),
    };
    this.rows.push(storedRow);
    return { ...storedRow, details: { ...storedRow.details } };
  }

  async listContentComplianceEventsByXAccount(xAccountId: string): Promise<SupabaseContentComplianceEventRow[]> {
    return this.rows
      .filter((row) => row.x_account_id === xAccountId)
      .sort((left, right) => right.created_at.localeCompare(left.created_at))
      .map((row) => ({ ...row, details: { ...row.details } }));
  }
}
