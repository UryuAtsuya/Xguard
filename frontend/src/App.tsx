import {
  Activity,
  BadgeCheck,
  EyeOff,
  FileCheck2,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { BackupRun, ProofPublicPayload } from "../../shared/types";
import { fetchHealth, runBackup, startOAuth, type HealthResponse, type OAuthStartResponse } from "./api";

type Step = "snapshot" | "connect" | "backup" | "proof";

export function App() {
  const [activeStep, setActiveStep] = useState<Step>("snapshot");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [oauth, setOauth] = useState<OAuthStartResponse | null>(null);
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
      setNotice(response.mode === "mock" ? "mock OAuthで確認中" : "OAuth設定済み");
    } catch {
      setNotice("OAuth開始に失敗");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleBackup() {
    setIsBusy(true);
    setNotice("プロフィールと直近投稿をバックアップ中");

    try {
      const response = await runBackup(25);
      setBackupRun(response.backupRun);
      setProof(response.proofPayload);
      setActiveStep("proof");
      setNotice("証明ページDTOを作成済み");
    } catch {
      setNotice("バックアップに失敗");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-band" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">XGuard / read-only backup</p>
          <h1 id="hero-title">消える前に、証明を残す。</h1>
          <p className="hero-text">
            Xのプロフィールと直近投稿を静かに保全し、必要なときだけ赤入れ済みの証明ページとして見せられるようにします。
          </p>
          <div className="hero-actions">
            <button className="primary-action" type="button" onClick={handleConnect} disabled={isBusy}>
              <KeyRound aria-hidden="true" size={18} />
              Xを安全に接続
            </button>
            <button className="secondary-action" type="button" onClick={handleBackup} disabled={isBusy}>
              <RefreshCw aria-hidden="true" size={18} />
              今すぐバックアップ
            </button>
          </div>
        </div>

        <div className="status-panel" aria-live="polite">
          <div className="status-header">
            <span>Account Risk Snapshot</span>
            <span className="status-chip">{health?.xOAuthMode ?? "checking"}</span>
          </div>
          <div className="readiness-value">{readiness}%</div>
          <div className="progress-track" aria-label={`バックアップ準備 ${readiness}%`}>
            <span style={{ width: `${readiness}%` }} />
          </div>
          <p>{notice}</p>
        </div>
      </section>

      <section className="workflow-grid" aria-label="XGuard workflow">
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
          icon={<Activity aria-hidden="true" size={20} />}
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

        <aside className="companion-panel" aria-label="Desktop companion">
          <div className="companion-heading">
            <Sparkles aria-hidden="true" size={20} />
            <h2>運用レビュー</h2>
          </div>
          <InfoRow label="API" value={health?.ok ? "online" : "checking"} />
          <InfoRow label="OAuth" value={oauth?.mode ?? "mock ready"} />
          <InfoRow label="Proof privacy" value="Private default" />
          <InfoRow label="Automation" value="No post / DM / follow" />
        </aside>
      </section>
    </main>
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
