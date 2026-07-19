import {
  Archive,
  Check,
  DatabaseBackup,
  Eye,
  FileCheck2,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { BackupRun, ProofPublicPayload, XAccount } from "../../../shared/types";
import { completeOAuthCallback, fetchHealth, runBackup, startOAuth, type HealthResponse } from "./api";
import type { CustomerFlowPhase } from "./types";

const usernamePattern = /^[A-Za-z0-9_]{1,15}$/;

export function CustomerPortal() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [username, setUsername] = useState("");
  const [connectedAccount, setConnectedAccount] = useState<XAccount | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [backupRun, setBackupRun] = useState<BackupRun | null>(null);
  const [proof, setProof] = useState<ProofPublicPayload | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState("保全したいXアカウントを入力してください");

  useEffect(() => {
    fetchHealth()
      .then((response) => setHealth(response))
      .catch(() => setNotice("現在サービスに接続できません。時間をおいて再度お試しください。"));
  }, []);

  const phase = useMemo<CustomerFlowPhase>(() => {
    if (proof && backupRun?.status === "completed") return "ready";
    if (connectedAccount && sessionToken) return "backup";
    return "account";
  }, [backupRun?.status, connectedAccount, proof, sessionToken]);

  async function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requestedUsername = normalizeUsername(username);

    if (!usernamePattern.test(requestedUsername)) {
      setNotice("Xのユーザー名を15文字以内の半角英数字または_で入力してください");
      return;
    }

    setIsBusy(true);
    setNotice(`@${requestedUsername} の本人確認を準備しています`);

    try {
      const response = await startOAuth();

      if (response.mode === "configured") {
        window.location.assign(response.authorizationUrl);
        return;
      }

      const callback = await completeOAuthCallback("mock-authorization-code", response.state);

      if (normalizeUsername(callback.connectedAccount.username) !== requestedUsername) {
        setNotice(`入力した @${requestedUsername} と、確認できた @${callback.connectedAccount.username} が一致しません`);
        return;
      }

      setUsername(requestedUsername);
      setConnectedAccount(callback.connectedAccount);
      setSessionToken(callback.sessionToken);
      setNotice(`@${callback.connectedAccount.username} を確認できました。次に保全を開始してください。`);
    } catch {
      setNotice("アカウントの確認を開始できませんでした。もう一度お試しください。");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleBackup() {
    if (!sessionToken) {
      setNotice("先にXアカウントの本人確認を完了してください");
      return;
    }

    setIsBusy(true);
    setNotice("プロフィールと直近の投稿を保全しています");

    try {
      const response = await runBackup(25, sessionToken);
      setBackupRun(response.backupRun);
      setProof(response.proofPayload);
      setNotice("復旧に備えたデータの保全が完了しました");
    } catch {
      setNotice("データを保全できませんでした。時間をおいて再度お試しください。");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="customer-portal" aria-label="お客様が見る画面">
      <section className="customer-hero">
        <div className="customer-hero-copy">
          <p className="eyebrow">Account continuity for X</p>
          <h1>
            Xの記録を、<span>もしもの前に保全。</span>
          </h1>
          <p className="hero-text">
            プロフィールと直近の投稿を、安全な控えとして残します。
            アカウントに何か起きる前に、復旧の準備を始められます。
          </p>
          <ul className="hero-assurances" aria-label="XGuardの接続方針">
            <li><Eye aria-hidden="true" size={17} /> 読み取り専用</li>
            <li><LockKeyhole aria-hidden="true" size={17} /> 初期状態は非公開</li>
            <li><ShieldCheck aria-hidden="true" size={17} /> 投稿・DM・フォロー操作なし</li>
          </ul>
        </div>

        {phase === "account" ? (
          <form className="account-form" onSubmit={handleConnect} noValidate>
            <div className="form-heading">
              <span>STEP 1</span>
              <h2>保全するアカウントを確認</h2>
            </div>
            <label htmlFor="x-username">Xのユーザー名</label>
            <div className="username-field">
              <span aria-hidden="true">@</span>
              <input
                id="x-username"
                name="username"
                aria-label="保全するXアカウント"
                type="text"
                inputMode="text"
                autoComplete="username"
                placeholder="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={isBusy}
                aria-describedby="username-help"
              />
            </div>
            <p id="username-help">本人確認のため、このあとXの認証画面へ進みます。</p>
            <button className="primary-action" type="submit" disabled={isBusy || !health?.ok}>
              <KeyRound aria-hidden="true" size={18} />
              アカウントを確認
            </button>
            <div className="form-security">
              <LockKeyhole aria-hidden="true" size={16} />
              <span>Xの認証画面で本人確認します。パスワードをXGuardに入力することはありません。</span>
            </div>
          </form>
        ) : phase === "backup" && connectedAccount ? (
          <section className="account-form current-action" aria-labelledby="backup-action-title">
            <div className="form-heading">
              <span>STEP 2</span>
              <h2 id="backup-action-title">データを保全</h2>
            </div>
            <div className="connected-account">
              <Check aria-hidden="true" size={18} />
              <div>
                <strong>@{connectedAccount.username}</strong>
                <span>本人確認済み</span>
              </div>
            </div>
            <p>プロフィールと直近25件の投稿を、読み取り専用で保存します。</p>
            <button className="primary-action" type="button" onClick={handleBackup} disabled={isBusy}>
              <DatabaseBackup aria-hidden="true" size={18} />
              保全を開始
            </button>
            <div className="form-security">
              <Eye aria-hidden="true" size={16} />
              <span>この処理で投稿・DM・フォロー操作が行われることはありません。</span>
            </div>
          </section>
        ) : proof && backupRun ? (
          <section className="account-form current-action" aria-labelledby="backup-complete-title">
            <div className="form-heading success-heading">
              <span>COMPLETE</span>
              <h2 id="backup-complete-title">保全が完了しました</h2>
            </div>
            <ProofSummary proof={proof} backupRun={backupRun} />
          </section>
        ) : null}
      </section>

      <section className="continuity-panel" id="how-it-works" aria-labelledby="continuity-title">
        <div className="continuity-summary" aria-live="polite">
          <div className="status-icon" data-ready={phase === "ready"}>
            <ShieldCheck aria-hidden="true" size={22} />
          </div>
          <div>
            <p className="section-label">現在の状況</p>
            <h2 id="continuity-title">{phaseLabel[phase]}</h2>
            <p className="status-notice">{notice}</p>
          </div>
          <div className="status-details">
            <InfoRow label="公開設定" value="非公開" />
            <InfoRow label="接続権限" value="読み取り専用" />
          </div>
        </div>

        <ol className="customer-workflow" aria-label="保全の流れ">
          <FlowStep number="1" title="アカウント確認" state={phase === "account" ? "current" : "complete"}>
            <p>{connectedAccount ? `@${connectedAccount.username} の本人確認が完了しました。` : "ユーザー名を入力し、Xの認証画面で本人確認します。"}</p>
          </FlowStep>
          <FlowStep number="2" title="データを保全" state={phase === "backup" ? "current" : phase === "ready" ? "complete" : "pending"}>
            <p>プロフィールと直近25件の投稿を読み取り専用で保存します。</p>
          </FlowStep>
          <FlowStep number="3" title="復旧に備える" state={phase === "ready" ? "complete" : "pending"}>
            <p>{phase === "ready" ? "保全内容の概要を確認できる状態になりました。" : "保全後、復旧に使えるデータの概要を確認できます。"}</p>
          </FlowStep>
        </ol>
      </section>

      <section className="safety-section" id="safety" aria-labelledby="safety-title">
        <div className="section-intro">
          <p className="eyebrow">Designed for recovery</p>
          <h2 id="safety-title">必要な記録だけを、静かに守る。</h2>
          <p>アカウントを動かすためのサービスではなく、もしものときに備えて記録を残すためのサービスです。</p>
        </div>
        <div className="safety-grid">
          <article>
            <Eye aria-hidden="true" size={21} />
            <h3>読み取り専用で接続</h3>
            <p>XGuardが投稿、DM、フォロー操作を行うことはありません。</p>
          </article>
          <article>
            <Archive aria-hidden="true" size={21} />
            <h3>保存対象が明確</h3>
            <p>プロフィールと直近25件の投稿を、復旧に備えた控えとして保存します。</p>
          </article>
          <article>
            <LockKeyhole aria-hidden="true" size={21} />
            <h3>初期状態は非公開</h3>
            <p>保全した内容は、公開操作を行うまで外部向けに表示されません。</p>
          </article>
        </div>
      </section>

      <section className="faq-section" id="faq" aria-labelledby="faq-title">
        <div>
          <p className="eyebrow">Before you connect</p>
          <h2 id="faq-title">接続前に知っておきたいこと</h2>
        </div>
        <div className="faq-list">
          <details>
            <summary>XGuardから投稿されることはありますか？</summary>
            <p>ありません。XGuardは読み取り専用で、投稿・DM・フォロー操作を行いません。</p>
          </details>
          <details>
            <summary>何が保全されますか？</summary>
            <p>現在のプロフィール情報と、直近25件の投稿を保全します。</p>
          </details>
          <details>
            <summary>保全した内容は公開されますか？</summary>
            <p>初期状態では非公開です。保全完了後に内容の概要を確認できます。</p>
          </details>
        </div>
      </section>
    </section>
  );
}

function FlowStep({
  children,
  number,
  state,
  title,
}: {
  children: React.ReactNode;
  number: string;
  state: "complete" | "current" | "pending";
  title: string;
}) {
  return (
    <li className="flow-step" data-state={state}>
      <div className="step-heading">
        <span className="step-number">{state === "complete" ? <Check aria-label="完了" size={18} /> : number}</span>
        <div>
          <span className="step-state">{stepStateLabel[state]}</span>
          <h3>{title}</h3>
        </div>
      </div>
      {state === "pending" ? <p className="step-waiting">前のステップが完了すると進めます。</p> : <div className="step-body">{children}</div>}
    </li>
  );
}

function ProofSummary({ proof, backupRun }: { proof: ProofPublicPayload; backupRun: BackupRun }) {
  return (
    <div className="proof-summary">
      <div className="proof-identity">
        <LockKeyhole aria-hidden="true" size={18} />
        <div>
          <strong>@{proof.username}</strong>
          <span>非公開で保管中</span>
        </div>
      </div>
      <div className="summary-count">
        <FileCheck2 aria-hidden="true" size={18} />
        <span>投稿 {backupRun.tweetsCaptured}件を保全済み</span>
      </div>
      <div className="summary-count">
        <Archive aria-hidden="true" size={18} />
        <span>最終保全 {formatDateTime(proof.backedUpUntil)}</span>
      </div>
    </div>
  );
}

function normalizeUsername(value: string) {
  return value.trim().replace(/^@/, "");
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const phaseLabel: Record<CustomerFlowPhase, string> = {
  account: "アカウント確認前",
  backup: "保全を開始できます",
  ready: "保全済み",
};

const stepStateLabel = {
  complete: "完了",
  current: "現在のステップ",
  pending: "待機中",
} as const;

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
