import {
  BadgeCheck,
  Ban,
  DatabaseBackup,
  EyeOff,
  FileCheck2,
  KeyRound,
  LockKeyhole,
  MessageCircleOff,
  ShieldCheck,
  UserRoundX,
} from "lucide-react";
import type { ProofPublicPayload } from "../../shared/types";
import type { PortalStateProps } from "./types";

interface CustomerPortalProps extends PortalStateProps {
  onBackup: () => void;
  onConnect: () => void;
  readiness: number;
}

export function CustomerPortal({
  backupRun,
  health,
  isBusy,
  notice,
  oauth,
  onBackup,
  onConnect,
  proof,
  readiness,
}: CustomerPortalProps) {
  return (
    <section className="customer-portal" aria-label="お客様が見る画面">
      <div className="customer-hero">
        <p className="eyebrow">
          <LockKeyhole aria-hidden="true" size={14} />
          Private by default
        </p>
        <h1>消える前に、<span className="accent-text">証明を残す。</span></h1>
        <p className="hero-text">
          大切なプロフィールと投稿を読み取り専用で保全。もしもの時も、あなたが積み重ねた活動を証明できる状態に整えます。
        </p>
        <div className="hero-actions">
          <button className="primary-action" type="button" onClick={onConnect} disabled={isBusy}>
            <KeyRound aria-hidden="true" size={18} />
            Xを安全に接続
          </button>
          <button className="secondary-action" type="button" onClick={onBackup} disabled={isBusy}>
            <DatabaseBackup aria-hidden="true" size={18} />
            今すぐバックアップ
          </button>
        </div>
        <ul className="safety-list" aria-label="XGuardが行わない操作">
          <SafetyItem icon={<Ban aria-hidden="true" size={15} />} label="投稿なし" />
          <SafetyItem icon={<MessageCircleOff aria-hidden="true" size={15} />} label="DMなし" />
          <SafetyItem icon={<UserRoundX aria-hidden="true" size={15} />} label="フォロー操作なし" />
        </ul>
      </div>

      <aside className="customer-status" aria-live="polite">
        <div className="panel-header">
          <span>Backup readiness</span>
          <span className="live-badge">{health?.ok ? "Connected" : "Checking"}</span>
        </div>
        <div className="readiness-ring" style={{ "--readiness": `${readiness * 3.6}deg` } as React.CSSProperties}>
          <div>
            <strong>{readiness}</strong>
            <span>%</span>
          </div>
        </div>
        <div className="progress-track" aria-label={`バックアップ準備 ${readiness}%`}>
          <span style={{ width: `${readiness}%` }} />
        </div>
        <p className="status-notice">{notice}</p>
        <div className="status-details">
          <InfoRow label="公開設定" value={proof ? "確認待ち" : "非公開"} />
          <InfoRow label="接続権限" value="読み取り専用" />
        </div>
      </aside>

      <div className="workflow-heading">
        <div>
          <p className="eyebrow">Simple, private, reversible</p>
          <h2>3ステップで、もしもに備える。</h2>
        </div>
        <p>接続から証明ページの準備まで、必要な操作だけに絞りました。</p>
      </div>

      <section className="customer-workflow" aria-label="お客様の基本動作">
        <ProcessCard step="01" title="安全に接続" value={oauth ? `${oauth.scopes.length} scopes` : "read only"}>
          <ScopeList scopes={oauth?.scopes ?? ["tweet.read", "users.read", "offline.access"]} />
        </ProcessCard>
        <ProcessCard step="02" title="データを保全" value={backupRun ? `${backupRun.tweetsCaptured} posts` : "waiting"}>
          <InfoRow label="API" value={health?.ok ? "online" : "checking"} />
          <InfoRow label="Rate limit" value={`${backupRun?.rateLimitRemaining ?? 1499} left`} />
        </ProcessCard>
        <ProcessCard step="03" title="証明を準備" value={proof ? `@${proof.username}` : "private"}>
          {proof ? <ProofPreview proof={proof} /> : <EmptyProof />}
          <button className="secondary-action full-width" type="button" disabled={!proof}>
            <EyeOff aria-hidden="true" size={18} />
            証明ページを失効
          </button>
        </ProcessCard>
      </section>
    </section>
  );
}

function SafetyItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <li>
      {icon}
      <span>{label}</span>
    </li>
  );
}

function ProcessCard({ children, step, title, value }: { children: React.ReactNode; step: string; title: string; value: string }) {
  return (
    <article className="process-card">
      <div className="panel-header">
        <span className="process-title"><small>{step}</small>{title}</span>
        <strong>{value}</strong>
      </div>
      <div className="process-body">{children}</div>
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
      <FileCheck2 aria-hidden="true" size={18} />
      <p>バックアップ後に、公開内容を確認できる証明プレビューが表示されます。</p>
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
