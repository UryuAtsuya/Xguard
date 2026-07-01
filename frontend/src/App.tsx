import { Building2, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BackupRun, ProofPublicPayload } from "../../shared/types";
import { AdminConsole } from "./AdminConsole";
import {
  completeOAuthCallback,
  fetchAdminDatabaseSnapshot,
  fetchHealth,
  runBackup,
  startOAuth,
  type HealthResponse,
  type OAuthStartResponse,
} from "./api";
import { CustomerPortal } from "./CustomerPortal";
import type { AdminSnapshotState } from "./types";

type AudienceView = "customer" | "admin";

export function App() {
  const [activeView, setActiveView] = useState<AudienceView>("customer");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [oauth, setOauth] = useState<OAuthStartResponse | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [backupRun, setBackupRun] = useState<BackupRun | null>(null);
  const [proof, setProof] = useState<ProofPublicPayload | null>(null);
  const [adminSnapshot, setAdminSnapshot] = useState<AdminSnapshotState>({
    data: null,
    status: "X接続後にDB snapshotを読み込み",
  });
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState("API状態を確認中");

  useEffect(() => {
    fetchHealth()
      .then((response) => {
        setHealth(response);
        setNotice("mock APIに接続済み");
      })
      .catch(() => {
        setNotice("API未接続: npm run dev:api を確認");
      });
  }, []);

  const readiness = useMemo(() => {
    if (backupRun?.status === "completed") {
      return 100;
    }

    if (oauth) {
      return 72;
    }

    return health?.ok ? 48 : 18;
  }, [backupRun?.status, health?.ok, oauth]);

  async function refreshAdminSnapshot(nextSessionToken = sessionToken) {
    if (!nextSessionToken) {
      setAdminSnapshot({ data: null, status: "X接続後にDB snapshotを読み込み" });
      return;
    }

    setAdminSnapshot((current) => ({ ...current, status: "DB snapshotを更新中" }));

    try {
      const snapshot = await fetchAdminDatabaseSnapshot(nextSessionToken);
      setAdminSnapshot({ data: snapshot, status: "DB snapshotを取得済み" });
    } catch {
      setAdminSnapshot((current) => ({ ...current, status: "DB snapshot取得に失敗" }));
    }
  }

  async function handleConnect() {
    setIsBusy(true);
    setNotice("read-only OAuth URLを生成中");

    try {
      const response = await startOAuth();
      setOauth(response);

      if (response.mode === "mock") {
        const callback = await completeOAuthCallback("mock-authorization-code", response.state);
        setSessionToken(callback.sessionToken);
        void refreshAdminSnapshot(callback.sessionToken);
        setNotice("mock OAuthで接続済み");
      } else {
        setNotice("OAuth設定済み");
      }
    } catch {
      setNotice("OAuth開始に失敗");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleBackup() {
    if (!sessionToken) {
      setNotice("先にXを安全に接続");
      return;
    }

    setIsBusy(true);
    setNotice("プロフィールと直近投稿をバックアップ中");

    try {
      const response = await runBackup(25, sessionToken);
      setBackupRun(response.backupRun);
      setProof(response.proofPayload);
      void refreshAdminSnapshot(sessionToken);
      setNotice("証明ページDTOを作成済み");
    } catch {
      setNotice("バックアップに失敗");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-mark">
          <ShieldCheck aria-hidden="true" size={22} />
          <span>XGuard</span>
        </div>
        <nav className="audience-switcher" aria-label="画面種別">
          <button type="button" aria-pressed={activeView === "customer"} onClick={() => setActiveView("customer")}>
            <UserRound aria-hidden="true" size={16} />
            相手側
          </button>
          <button type="button" aria-pressed={activeView === "admin"} onClick={() => setActiveView("admin")}>
            <Building2 aria-hidden="true" size={16} />
            管理側
          </button>
        </nav>
      </header>

      {activeView === "customer" ? (
        <CustomerPortal
          backupRun={backupRun}
          health={health}
          isBusy={isBusy}
          notice={notice}
          oauth={oauth}
          onBackup={handleBackup}
          onConnect={handleConnect}
          proof={proof}
          readiness={readiness}
        />
      ) : (
        <AdminConsole
          backupRun={backupRun}
          health={health}
          isBusy={isBusy}
          notice={notice}
          oauth={oauth}
          onConnect={handleConnect}
          onRefreshDatabase={() => refreshAdminSnapshot()}
          snapshot={adminSnapshot}
        />
      )}
    </main>
  );
}
