import { Activity, Bell, Database, KeyRound, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import type { AdminDatabaseSnapshot, AdminDatabaseTableSummary } from "../../shared/types";
import { completeOAuthCallback, fetchAdminDatabaseSnapshot, fetchHealth, startOAuth, type HealthResponse, type OAuthStartResponse } from "./api";
import type { AdminSnapshotState } from "./types";

export function AdminConsole() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [oauth, setOauth] = useState<OAuthStartResponse | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AdminSnapshotState>({
    data: null,
    status: "管理用セッション接続後にDB snapshotを読み込み",
  });
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState("管理用APIの状態を確認中");

  useEffect(() => {
    fetchHealth()
      .then((response) => {
        setHealth(response);
        setNotice("管理用APIに接続済み");
      })
      .catch(() => setNotice("管理用APIに接続できません"));
  }, []);

  async function refreshDatabase(nextSessionToken = sessionToken) {
    if (!nextSessionToken) {
      setSnapshot({ data: null, status: "先に管理用セッションへ接続してください" });
      return;
    }

    setSnapshot((current) => ({ ...current, status: "DB snapshotを更新中" }));

    try {
      const data = await fetchAdminDatabaseSnapshot(nextSessionToken);
      setSnapshot({ data, status: "DB snapshotを取得済み" });
    } catch {
      setSnapshot((current) => ({ ...current, status: "DB snapshot取得に失敗" }));
    }
  }

  async function handleConnect() {
    setIsBusy(true);
    setNotice("管理用セッションを準備中");

    try {
      const response = await startOAuth();
      setOauth(response);

      if (response.mode !== "mock") {
        setNotice("管理者認証は未設定です");
        return;
      }

      const callback = await completeOAuthCallback("mock-authorization-code", response.state);
      setSessionToken(callback.sessionToken);
      await refreshDatabase(callback.sessionToken);
      setNotice("管理用セッションに接続済み");
    } catch {
      setNotice("管理用セッションに接続できませんでした");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="admin-console" aria-label="管理側の画面">
      <aside className="admin-sidebar">
        <div>
          <p className="eyebrow">Admin Console</p>
          <h1>管理画面</h1>
        </div>
        <nav aria-label="管理メニュー">
          <a href="#overview">Overview</a>
          <a href="#database">Database</a>
          <a href="#content">Content</a>
          <a href="#review">Review</a>
        </nav>
      </aside>

      <section className="admin-main">
        <header className="admin-toolbar">
          <div>
            <p className="eyebrow">Internal workspace</p>
            <h2>顧客DBと復旧データの確認</h2>
          </div>
          <div className="toolbar-actions">
            <button className="icon-button" type="button" aria-label="検索">
              <Search aria-hidden="true" size={18} />
            </button>
            <button className="icon-button" type="button" aria-label="通知">
              <Bell aria-hidden="true" size={18} />
            </button>
          </div>
        </header>

        <section className="admin-kpis" id="overview" aria-label="運用指標">
          <KpiCard label="API" value={health?.ok ? "online" : "checking"} tone="good" />
          <KpiCard label="OAuth" value={oauth?.mode ?? "mock ready"} tone="neutral" />
          <KpiCard
            label="Saved posts"
            value={`${snapshot.data?.backupRuns.reduce((total, run) => total + run.tweetsCaptured, 0) ?? 0}`}
            tone="neutral"
          />
          <KpiCard label="Proof privacy" value="private default" tone="good" />
        </section>

        <section className="admin-action-bar" aria-live="polite">
          <div>
            <strong>{notice}</strong>
            <span>{snapshot.status}</span>
          </div>
          <div className="hero-actions">
            <button className="primary-action" type="button" onClick={handleConnect} disabled={isBusy}>
              <KeyRound aria-hidden="true" size={18} />
              接続
            </button>
            <button className="secondary-action" type="button" onClick={() => refreshDatabase()} disabled={isBusy || !sessionToken}>
              <RefreshCw aria-hidden="true" size={18} />
              DB更新
            </button>
          </div>
        </section>

        <DatabaseSection snapshot={snapshot.data} status={snapshot.status} />

        <section className="admin-review" id="content" aria-label="保全コンテンツの確認項目">
          <div className="panel-header">
            <span>Stored content requirements</span>
            <ShieldCheck aria-hidden="true" size={18} />
          </div>
          <ReviewRow title="Customer account" value="x_user_id / @username / display name" />
          <ReviewRow title="Post text" value="tweet id / body / created at" />
          <ReviewRow title="Media" value="image / video metadata, no public raw payload" />
          <ReviewRow title="Recovery status" value="case status / proof page / revocation" />
        </section>

        <section className="admin-review" id="review" aria-label="レビューキュー">
          <div className="panel-header">
            <span>Review queue</span>
            <Activity aria-hidden="true" size={18} />
          </div>
          <ReviewRow title="Proof redaction" value="required before public" />
          <ReviewRow title="Automation guard" value="no post / DM / follow" />
          <ReviewRow title="Compliance events" value={snapshot.data ? `${snapshot.data.contentComplianceEvents.length} rows` : "not loaded"} />
        </section>
      </section>
    </section>
  );
}

function KpiCard({ label, tone, value }: { label: string; tone: "good" | "neutral"; value: string }) {
  return (
    <article className="kpi-card" data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function DatabaseSection({ snapshot, status }: { snapshot: AdminDatabaseSnapshot | null; status: string }) {
  const latestBackup = snapshot?.backupRuns[0];
  const latestEvent = snapshot?.contentComplianceEvents[0];

  return (
    <section className="database-section" id="database" aria-label="Database snapshot">
      <div className="panel-header">
        <span>Database</span>
        <Database aria-hidden="true" size={18} />
      </div>
      <div className="database-meta">
        <InfoRow label="Snapshot" value={status} />
        <InfoRow label="Generated" value={snapshot ? formatDateTime(snapshot.generatedAt) : "not loaded"} />
      </div>
      <div className="database-table-list">
        {(snapshot?.tables ?? emptyTables).map((table) => (
          <TableCard key={table.name} table={table} />
        ))}
      </div>
      <div className="admin-data-grid">
        <InfoRow label="Latest backup" value={latestBackup ? `${latestBackup.status} / ${latestBackup.tweetsCaptured} posts` : "none"} />
        <InfoRow label="Proof pages" value={snapshot ? `${snapshot.proofPages.length} rows` : "none"} />
        <InfoRow label="Latest compliance" value={latestEvent?.eventType ?? "none"} />
      </div>
    </section>
  );
}

function TableCard({ table }: { table: AdminDatabaseTableSummary }) {
  return (
    <article className="database-table-card">
      <span>{table.name}</span>
      <strong>{table.rowCount}</strong>
      <small>{table.lastUpdatedAt ? formatDateTime(table.lastUpdatedAt) : "no rows"}</small>
    </article>
  );
}

function ReviewRow({ title, value }: { title: string; value: string }) {
  return (
    <div className="review-row">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const emptyTables = [
  { name: "backup_runs", rowCount: 0, source: "repository", writable: false },
  { name: "proof_pages", rowCount: 0, source: "repository", writable: false },
  { name: "content_compliance_events", rowCount: 0, source: "repository", writable: false },
] satisfies AdminDatabaseSnapshot["tables"];
