export interface OAuthStateRecord {
  state: string;
  codeVerifier: string;
  expiresAt: Date;
}

export type OAuthStateConsumeResult =
  | { ok: true; record: OAuthStateRecord }
  | { ok: false; reason: "not_found" | "expired" };

export interface OAuthStateRepository {
  save(record: OAuthStateRecord): Promise<void>;
  consume(state: string): Promise<OAuthStateConsumeResult>;
}

export class InMemoryOAuthStateRepository implements OAuthStateRepository {
  private readonly records = new Map<string, OAuthStateRecord>();

  async save(record: OAuthStateRecord): Promise<void> {
    this.pruneExpiredRecords();
    this.records.set(record.state, record);
  }

  async consume(state: string): Promise<OAuthStateConsumeResult> {
    const record = this.records.get(state);

    if (!record) {
      return { ok: false, reason: "not_found" };
    }

    this.records.delete(state);

    if (record.expiresAt.getTime() <= Date.now()) {
      return { ok: false, reason: "expired" };
    }

    return { ok: true, record };
  }

  private pruneExpiredRecords(): void {
    const now = Date.now();

    for (const [state, record] of this.records) {
      if (record.expiresAt.getTime() <= now) {
        this.records.delete(state);
      }
    }
  }
}
