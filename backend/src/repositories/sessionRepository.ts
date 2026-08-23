import type { XAccount } from "../../../shared/types.js";

export interface CustomerSession {
  userId: string;
  connectedAccount?: XAccount;
}

export interface SessionRepository {
  save(sessionToken: string, userId: string, connectedAccount?: XAccount): Promise<void>;
  lookup(sessionToken: string): Promise<string | undefined>;
  find(sessionToken: string): Promise<CustomerSession | undefined>;
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, CustomerSession>();

  async save(sessionToken: string, userId: string, connectedAccount?: XAccount): Promise<void> {
    this.sessions.set(sessionToken, { userId, connectedAccount });
  }

  async lookup(sessionToken: string): Promise<string | undefined> {
    return this.sessions.get(sessionToken)?.userId;
  }

  async find(sessionToken: string): Promise<CustomerSession | undefined> {
    return this.sessions.get(sessionToken);
  }
}
