import { Check, DatabaseBackup, FileCheck2, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { BackupRun, ProofPublicPayload, XAccount } from "../../shared/types";
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
          <p className="eyebrow">X account backup</p>
          <h1>
            もしもの前に、<span className="no-break">Xの記録を守る。</span>
          </h1>
          <p className="hero-text">アカウントを確認し、投稿とプロフィールを読み取り専用で保全します。投稿・DM・フォロー操作は行いません。</p>
        </div>

        <form className="account-form" onSubmit={handleConnect} noValidate>
          <label htmlFor="x-username">保全するXアカウント</label>
          <div className="username-field">
            <span aria-hidden="true">@</span>
            <input
              id="x-username"
              name="username"
              type="text"
              inputMode="text"
              autoComplete="username"
              placeholder="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={isBusy || phase !== "account"}
              aria-describedby="username-help"
            />
          </div>
          <p id="username-help">本人確認のため、このあとXの認証画面へ進みます。</p>
          <button className="primary-action" type="submit" disabled={isBusy || phase !== "account" || !health?.ok}>
            <KeyRound aria-hidden="true" size={18} />
            アカウントを確認
          </button>
        </form>
      </section>

      <aside className="customer-status" aria-live="polite">
        <div className="status-icon" data-ready={phase === "ready"}>
          <ShieldCheck aria-hidden="true" size={24} />
        </div>
        <div>
          <span>現在の状況</span>
          <strong>{phaseLabel[phase]}</strong>
        </div>
        <p>{notice}</p>
      </aside>

      <ol className="customer-workflow" aria-label="保全の流れ">
        <FlowStep number="1" title="アカウント確認" state={phase === "account" ? "current" : "complete"}>
          <p>{connectedAccount ? `@${connectedAccount.username} の本人確認が完了しました。` : "ユーザー名を入力し、Xで本人確認します。"}</p>
        </FlowStep>
        <FlowStep number="2" title="データを保全" state={phase === "backup" ? "current" : phase === "ready" ? "complete" : "pending"}>
          <p>プロフィールと直近25件の投稿を読み取り専用で保存します。</p>
          <button className="primary-action full-width" type="button" onClick={handleBackup} disabled={isBusy || phase !== "backup"}>
            <DatabaseBackup aria-hidden="true" size={18} />
            保全を開始
          </button>
        </FlowStep>
        <FlowStep number="3" title="復旧に備える" state={phase === "ready" ? "complete" : "pending"}>
          {proof && backupRun ? <ProofSummary proof={proof} backupRun={backupRun} /> : <p>保全後、復旧に使えるデータの概要を確認できます。</p>}
        </FlowStep>
      </ol>
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
        <h2>{title}</h2>
      </div>
      <div className="step-body">{children}</div>
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
    </div>
  );
}

function normalizeUsername(value: string) {
  return value.trim().replace(/^@/, "");
}

const phaseLabel: Record<CustomerFlowPhase, string> = {
  account: "アカウント確認前",
  backup: "保全を開始できます",
  ready: "保全済み",
};
