import {
  Activity,
  BadgeCheck,
  Bell,
  ChevronRight,
  Clock3,
  DatabaseBackup,
  EyeOff,
  FileCheck2,
  KeyRound,
  LayoutDashboard,
  LockKeyhole,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { BackupRun, ProofPublicPayload } from "../../shared/types";
import { completeOAuthCallback, fetchHealth, runBackup, startOAuth, type HealthResponse, type OAuthStartResponse } from "./api";

type Step = "snapshot" | "connect" | "backup" | "proof";
type View = "home" | "admin" | "proof";

export function App() {
  const [activeStep, setActiveStep] = useState<Step>("snapshot");
  const [activeView, setActiveView] = useState<View>("home");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [oauth, setOauth] = useState<OAuthStartResponse | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [backupRun, setBackupRun] = useState<BackupRun | null>(null);
  const [proof, setProof] = useState<ProofPublicPayload | null>(null);
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

  async function handleConnect() {
    setIsBusy(true);
    setNotice("read-only OAuth URLを生成中");

    try {
      const response = await startOAuth();
      setOauth(response);
      setActiveStep("connect");
      setActiveView("admin");
      if (response.mode === "mock") {
        const callback = await completeOAuthCallback("mock-authorization-code", response.state);
        setSessionToken(callback.sessionToken);
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
      setActiveStep("connect");
      setNotice("先にXを安全に接続");
      return;
    }

    setIsBusy(true);
    setNotice("プロフィールと直近投稿をバックアップ中");

    try {
      const response = await runBackup(25, sessionToken);
      setBackupRun(response.backupRun);
      setProof(response.proofPayload);
      setActiveStep("proof");
      setActiveView("proof");
      setNotice("証明ページDTOを作成済み");
    } catch {
      setNotice("バックアップに失敗");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="top-bar">
        <div className="brand-mark">
          <ShieldCheck aria-hidden="true" size={22} />
          <span>XGuard</span>
        </div>
        <nav className="view-tabs" aria-label="Primary">
          <ViewButton view="home" activeView={activeView} onSelect={setActiveView} icon={<LayoutDashboard size={16} />}>
            Home
          </ViewButton>
          <ViewButton view="admin" activeView={activeView} onSelect={setActiveView} icon={<Settings2 size={16} />}>
            Admin
          </ViewButton>
          <ViewButton view="proof" activeView={activeView} onSelect={setActiveView} icon={<FileCheck2 size={16} />}>
            Proof
          </ViewButton>
        </nav>
        <div className="top-actions">
          <button className="icon-button" type="button" aria-label="検索">
            <Search aria-hidden="true" size={18} />
          </button>
          <button className="icon-button" type="button" aria-label="通知">
            <Bell aria-hidden="true" size={18} />
          </button>
        </div>
      </header>

      <section className="workspace-grid" aria-label="XGuard wireframe workspace">
        <section className="home-panel" aria-labelledby="hero-title" data-active={activeView === "home"}>
          <div className="hero-copy">
            <p className="eyebrow">Read-only X backup and proof control</p>
            <h1 id="hero-title">
              Xの信用資産を、<span className="no-break">静かに守る。</span>
            </h1>
            <p className="hero-text">
              プロフィールと直近投稿を保全し、必要なときだけ赤入れ済みの証明ページとして共有できます。
            </p>
            <div className="hero-actions">
              <button className="primary-action" type="button" onClick={handleConnect} disabled={isBusy}>
                <KeyRound aria-hidden="true" size={18} />
                Xを安全に接続
              </button>
              <button className="secondary-action" type="button" onClick={() => setActiveView("admin")}>
                管理画面を見る
                <ChevronRight aria-hidden="true" size={18} />
              </button>
            </div>
          </div>

          <div className="readiness-card" aria-live="polite">
            <div className="panel-header">
              <span>Risk Snapshot</span>
              <span className="status-chip">{health?.xOAuthMode ?? "checking"}</span>
            </div>
            <div className="readiness-value">{readiness}%</div>
            <div className="progress-track" aria-label={`バックアップ準備 ${readiness}%`}>
              <span style={{ width: `${readiness}%` }} />
            </div>
            <p>{notice}</p>
          </div>
        </section>

        <section className="admin-panel" aria-label="管理画面" data-active={activeView === "admin"}>
          <div className="section-heading">
            <p className="eyebrow">Admin Console</p>
            <h2>保全オペレーション</h2>
          </div>

          <div className="admin-grid">
            <ScreenCard
              title="接続"
              step="connect"
              activeStep={activeStep}
              icon={<ShieldCheck aria-hidden="true" size={20} />}
              onSelect={setActiveStep}
            >
              <p className="screen-lead">投稿もDMも、勝手に触らない。</p>
              <InfoRow label="許可する範囲" value={oauth ? `${oauth.scopes.length} scopes` : "3 scopes"} />
              <ScopeList scopes={oauth?.scopes ?? ["tweet.read", "users.read", "offline.access"]} />
              <SafetyList />
            </ScreenCard>

            <ScreenCard
              title="Backup"
              step="backup"
              activeStep={activeStep}
              icon={<DatabaseBackup aria-hidden="true" size={20} />}
              onSelect={setActiveStep}
            >
              <div className="metric-line">
                <span>{backupRun?.tweetsCaptured ?? 148}</span>
                <strong>saved posts</strong>
              </div>
              <InfoRow label="Profile" value={backupRun ? "保存済み" : "待機中"} />
              <InfoRow label="API cost guard" value={formatCost(backupRun?.estimatedCostUsd ?? 0.02)} />
              <InfoRow label="Rate limit" value={`${backupRun?.rateLimitRemaining ?? 1499} left`} />
              <button className="primary-action full-width" type="button" onClick={handleBackup} disabled={isBusy}>
                <RefreshCw aria-hidden="true" size={18} />
                バックアップを実行
              </button>
            </ScreenCard>

            <aside className="ops-panel" aria-label="運用レビュー">
              <div className="panel-header">
                <span>Operations</span>
                <Activity aria-hidden="true" size={18} />
              </div>
              <InfoRow label="API" value={health?.ok ? "online" : "checking"} />
              <InfoRow label="OAuth" value={oauth?.mode ?? "mock ready"} />
              <InfoRow label="Proof privacy" value="Private default" />
              <InfoRow label="Automation" value="No post / DM / follow" />
            </aside>
          </div>
        </section>

        <section className="proof-panel" aria-label="証明レビュー" data-active={activeView === "proof"}>
          <div className="section-heading">
            <p className="eyebrow">Proof Review</p>
            <h2>公開前チェック</h2>
          </div>
          <div className="proof-layout">
            <ScreenCard
              title="Proof"
              step="proof"
              activeStep={activeStep}
              icon={<FileCheck2 aria-hidden="true" size={20} />}
              onSelect={setActiveStep}
            >
              <p className="screen-lead">見せる情報を、自分で選ぶ。</p>
              <VisibilitySelector />
              {proof ? <ProofPreview proof={proof} /> : <EmptyProof />}
              <button className="secondary-action full-width" type="button" disabled={!proof}>
                <EyeOff aria-hidden="true" size={18} />
                証明ページを失効
              </button>
            </ScreenCard>

            <aside className="timeline-panel" aria-label="タイムライン">
              <div className="panel-header">
                <span>Review queue</span>
                <Clock3 aria-hidden="true" size={18} />
              </div>
              <ReviewItem title="DTO redaction" value="required" />
              <ReviewItem title="Representative posts" value={proof ? `${proof.representativeTweets.length} selected` : "waiting"} />
              <ReviewItem title="Public state" value="private by default" />
            </aside>
          </div>
        </section>
      </section>
    </main>
  );
}

interface ViewButtonProps {
  view: View;
  activeView: View;
  icon: ReactNode;
  children: ReactNode;
  onSelect: (view: View) => void;
}

function ViewButton({ view, activeView, icon, children, onSelect }: ViewButtonProps) {
  return (
    <button className="view-button" type="button" aria-pressed={activeView === view} onClick={() => onSelect(view)}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

interface ScreenCardProps {
  title: string;
  step: Step;
  activeStep: Step;
  icon: ReactNode;
  children: ReactNode;
  onSelect: (step: Step) => void;
}

function ScreenCard({ title, step, activeStep, icon, children, onSelect }: ScreenCardProps) {
  return (
    <article className={`screen-card ${activeStep === step ? "active" : ""}`}>
      <button className="screen-tab" type="button" onClick={() => onSelect(step)} aria-pressed={activeStep === step}>
        {icon}
        <span>{title}</span>
      </button>
      <div className="screen-body">{children}</div>
    </article>
  );
}

function ScopeList({ scopes }: { scopes: string[] }) {
  return (
    <ul className="scope-list" aria-label="OAuth scopes">
      {scopes.map((scope) => (
        <li key={scope}>
          <BadgeCheck aria-hidden="true" size={16} />
          <span>{scope}</span>
        </li>
      ))}
    </ul>
  );
}

function SafetyList() {
  return (
    <div className="safety-list">
      <InfoRow label="自動投稿" value="なし" />
      <InfoRow label="自動DM" value="なし" />
      <InfoRow label="自動フォロー" value="なし" />
    </div>
  );
}

function VisibilitySelector() {
  return (
    <div className="segmented-control" aria-label="Proof visibility">
      <button className="selected" type="button">
        Private
      </button>
      <button type="button">Unlisted</button>
      <button type="button">Public</button>
    </div>
  );
}

function ProofPreview({ proof }: { proof: ProofPublicPayload }) {
  return (
    <div className="proof-preview">
      <div className="proof-identity">
        <LockKeyhole aria-hidden="true" size={18} />
        <div>
          <strong>@{proof.username}</strong>
          <span>{proof.displayName ?? "XGuard user"}</span>
        </div>
      </div>
      <InfoRow label="保存投稿" value={`${proof.snapshotCounts.tweets}`} />
      <InfoRow label="代表投稿" value={`${proof.representativeTweets.length}`} />
      <p>{proof.representativeTweets[0]?.text ?? "No public tweet selected."}</p>
    </div>
  );
}

function EmptyProof() {
  return (
    <div className="proof-preview empty">
      <p>バックアップを実行すると、赤入れ済みの公開用DTOがここに出ます。</p>
    </div>
  );
}

function ReviewItem({ title, value }: { title: string; value: string }) {
  return (
    <div className="review-item">
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

function formatCost(value: number) {
  return `$${value.toFixed(2)}`;
}
