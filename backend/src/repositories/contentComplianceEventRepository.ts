import { randomUUID } from "node:crypto";
import type { ContentComplianceEvent } from "../../../shared/types.js";

export type NewContentComplianceEvent = Omit<ContentComplianceEvent, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

export interface ContentComplianceEventRepository {
  record(event: NewContentComplianceEvent): Promise<ContentComplianceEvent>;
  listByXAccount(xAccountId: string): Promise<ContentComplianceEvent[]>;
}

export class InMemoryContentComplianceEventRepository implements ContentComplianceEventRepository {
  private readonly events = new Map<string, ContentComplianceEvent>();

  async record(event: NewContentComplianceEvent): Promise<ContentComplianceEvent> {
    const storedEvent = cloneEvent({
      ...event,
      id: event.id ?? randomUUID(),
      createdAt: event.createdAt ?? new Date().toISOString(),
    });

    this.events.set(storedEvent.id, storedEvent);
    return cloneEvent(storedEvent);
  }

  async listByXAccount(xAccountId: string): Promise<ContentComplianceEvent[]> {
    return [...this.events.values()]
      .filter((event) => event.xAccountId === xAccountId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(cloneEvent);
  }
}

export function cloneEvent(event: ContentComplianceEvent): ContentComplianceEvent {
  return {
    ...event,
    details: { ...event.details },
  };
}
