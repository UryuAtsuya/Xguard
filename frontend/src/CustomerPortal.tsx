import { BadgeCheck, DatabaseBackup, EyeOff, FileCheck2, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
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
        <p className="eyebrow">Customer portal</p>
        <h1>
          守りたいXアカウントを、<span className="no-break">安全に保全する。</span>
        </h1>
        <p className="hero-text">お客様画面はユーザー名入力、保全状況の確認、復旧用データの準備に絞ります。管理用DBや内部レビュー情報は表示しません。</p>
        <div className="hero-actions">
          <button className="primary-action" type="button" onClick={onConnect} disabled={isBusy}>
            <KeyRound aria-hidden="true" size={18} />
            @ユーザー名を入力して接続
          </button>
          <button className="secondary-action" type="button" onClick={onBackup} disabled={isBusy}>
            <DatabaseBackup aria-hidden="true" size={18} />
            復旧用データを保全
          </button>
        </div>
      </div>

      <aside className="customer-status" aria-live="polite">
        <div className="panel-header">
          <span>Readiness</span>
          <ShieldCheck aria-hidden="true" size={18} />
        </div>
        <div className="readiness-value">{readiness}%</div>
        <div className="progress-track" aria-label={`バックアップ準備 ${readiness}%`}>
          <span style={{ width: `${readiness}%` }} />
        </div>
        <p>{notice}</p>
      </aside>

      <section className="customer-workflow" aria-label="お客様の基本動作">
        <ProcessCard title="入力" value={oauth ? `${oauth.scopes.length} scopes` : "@username"}>
          <ScopeList scopes={oauth?.scopes ?? ["tweet.read", "users.read", "offline.access"]} />
        </ProcessCard>
        <ProcessCard title="状況確認" value={backupRun ? `${backupRun.tweetsCaptured} posts` : "waiting"}>
          <InfoRow label="API" value={health?.ok ? "online" : "checking"} />
          <InfoRow label="Rate limit" value={`${backupRun?.rateLimitRemaining ?? 1499} left`} />
        </ProcessCard>
        <ProcessCard title="復旧" value={proof ? `@${proof.username}` : "private"}>
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

function ProcessCard({ children, title, value }: { children: React.ReactNode; title: string; value: string }) {
  return (
    <article className="process-card">
      <div className="panel-header">
        <span>{title}</span>
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
      <p>バックアップ後に公開用DTOがここに出ます。</p>
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
