import type { ContentComplianceEvent } from "../../../shared/types.js";
import {
  cloneEvent,
  type ContentComplianceEventRepository,
  type NewContentComplianceEvent,
} from "./contentComplianceEventRepository.js";

export interface SupabaseContentComplianceEventRow {
  id: string;
  x_account_id: string;
  tweet_snapshot_id?: string;
  proof_page_id?: string;
  event_type: ContentComplianceEvent["eventType"];
  source: ContentComplianceEvent["source"];
  details: Record<string, unknown>;
  resolved_at?: string;
  created_at: string;
}

export interface SupabaseContentComplianceEventStore {
  insertContentComplianceEvent(row: Omit<SupabaseContentComplianceEventRow, "id" | "created_at"> & {
    id?: string;
    created_at?: string;
  }): Promise<SupabaseContentComplianceEventRow>;
  listContentComplianceEventsByXAccount(xAccountId: string): Promise<SupabaseContentComplianceEventRow[]>;
}

export class SupabaseContentComplianceEventRepository implements ContentComplianceEventRepository {
  constructor(private readonly store: SupabaseContentComplianceEventStore) {}

  async record(event: NewContentComplianceEvent): Promise<ContentComplianceEvent> {
    const row = await this.store.insertContentComplianceEvent({
      id: event.id,
      x_account_id: event.xAccountId,
      tweet_snapshot_id: event.tweetSnapshotId,
      proof_page_id: event.proofPageId,
      event_type: event.eventType,
      source: event.source,
      details: { ...event.details },
      resolved_at: event.resolvedAt,
      created_at: event.createdAt,
    });

    return rowToEvent(row);
  }

  async listByXAccount(xAccountId: string): Promise<ContentComplianceEvent[]> {
    const rows = await this.store.listContentComplianceEventsByXAccount(xAccountId);
    return rows.map(rowToEvent);
  }
}

function rowToEvent(row: SupabaseContentComplianceEventRow): ContentComplianceEvent {
  return cloneEvent({
    id: row.id,
    xAccountId: row.x_account_id,
    tweetSnapshotId: row.tweet_snapshot_id,
    proofPageId: row.proof_page_id,
    eventType: row.event_type,
    source: row.source,
    details: { ...row.details },
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
  });
}
