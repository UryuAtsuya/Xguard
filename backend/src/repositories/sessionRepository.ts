export interface SessionRepository {
  save(sessionToken: string, userId: string): Promise<void>;
  lookup(sessionToken: string): Promise<string | undefined>;
}

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, string>();

  async save(sessionToken: string, userId: string): Promise<void> {
    this.sessions.set(sessionToken, userId);
  }

  async lookup(sessionToken: string): Promise<string | undefined> {
    return this.sessions.get(sessionToken);
  }
}
