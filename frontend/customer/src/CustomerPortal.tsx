import {
  Archive,
  Check,
  DatabaseBackup,
  Eye,
  FileCheck2,
  Fingerprint,
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
      <section className="customer-stage">
        <div className="customer-story">
          <p className="eyebrow">Private account archive</p>
          <h1>
            積み上げた発信を、<span>もしもの後にも。</span>
          </h1>
          <p className="hero-text">
            プロフィールと直近の投稿を、公開せず静かに保全します。
            アカウントに何か起きたときも、本人性と活動の履歴を確認できる状態にします。
          </p>
          <ul className="hero-assurances" aria-label="XGuardの接続方針">
            <li><Eye aria-hidden="true" size={17} /> 読み取り専用</li>
            <li><LockKeyhole aria-hidden="true" size={17} /> 初期状態は非公開</li>
            <li><ShieldCheck aria-hidden="true" size={17} /> 投稿・DM・フォロー操作なし</li>
          </ul>
          <div className="story-note">
            <Fingerprint aria-hidden="true" size={21} />
            <p><strong>見せる範囲は、自分で決める。</strong><span>保全したデータは、公開操作をするまで外部から見えません。</span></p>
          </div>
        </div>

        <aside className="journey-card" aria-label="保全の手続き">
          <div className="journey-card-header">
            <div>
              <p className="section-label">Setup</p>
              <h2>保全の準備をはじめる</h2>
            </div>
            <span className="privacy-badge"><LockKeyhole aria-hidden="true" size={14} /> 非公開</span>
          </div>

          <JourneyProgress phase={phase} />

          {phase === "account" ? (
            <form className="journey-action" onSubmit={handleConnect} noValidate>
              <div className="form-heading">
                <span>STEP 1</span>
                <h3>保全するアカウントを確認</h3>
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
              <p id="username-help">このあとXの認証画面で本人確認します。</p>
              <button className="primary-action" type="submit" disabled={isBusy || !health?.ok}>
                <KeyRound aria-hidden="true" size={18} />
                Xアカウントを確認
              </button>
            </form>
          ) : phase === "backup" && connectedAccount ? (
            <section className="journey-action current-action" aria-labelledby="backup-action-title">
              <div className="form-heading">
                <span>STEP 2</span>
                <h3 id="backup-action-title">データを保全</h3>
              </div>
              <div className="connected-account">
                <Check aria-hidden="true" size={18} />
                <div><strong>@{connectedAccount.username}</strong><span>本人確認済み</span></div>
              </div>
              <p>プロフィールと直近25件の投稿を、読み取り専用で保存します。</p>
              <button className="primary-action" type="button" onClick={handleBackup} disabled={isBusy}>
                <DatabaseBackup aria-hidden="true" size={18} />
                保全を開始
              </button>
            </section>
          ) : proof && backupRun ? (
            <section className="journey-action current-action" aria-labelledby="backup-complete-title">
              <div className="form-heading success-heading">
                <span>COMPLETE</span>
                <h3 id="backup-complete-title">保全が完了しました</h3>
              </div>
              <ProofSummary proof={proof} backupRun={backupRun} />
            </section>
          ) : null}

          <p className="journey-notice" aria-live="polite">{notice}</p>
          <div className="form-security">
            <LockKeyhole aria-hidden="true" size={16} />
            <span>パスワードをXGuardに入力することはありません。</span>
          </div>
        </aside>
      </section>

      <section className="archive-section" id="how-it-works" aria-labelledby="archive-title">
        <div className="section-intro">
          <p className="eyebrow">What stays with you</p>
          <h2 id="archive-title">残すのは、活動を説明するための最低限。</h2>
          <p>公開範囲を広げず、もしもの時に自分の活動を確認できる記録だけを保全します。</p>
        </div>
        <div className="archive-grid">
          <article><Fingerprint aria-hidden="true" size={22} /><span>01</span><h3>プロフィール</h3><p>表示名、ユーザー名、自己紹介など本人性を示す情報。</p></article>
          <article><Archive aria-hidden="true" size={22} /><span>02</span><h3>直近の投稿</h3><p>活動の流れが分かる直近25件を読み取り専用で保存。</p></article>
          <article><FileCheck2 aria-hidden="true" size={22} /><span>03</span><h3>証明ページ</h3><p>必要になった時だけ見せられる、初期非公開の確認ページ。</p></article>
        </div>
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

function JourneyProgress({ phase }: { phase: CustomerFlowPhase }) {
  const states = phase === "account"
    ? ["current", "pending", "pending"]
    : phase === "backup"
      ? ["complete", "current", "pending"]
      : ["complete", "complete", "complete"];

  return (
    <ol className="journey-progress" aria-label="保全の進行状況">
      {["本人確認", "データ保全", "準備完了"].map((label, index) => {
        const state = states[index];
        return (
          <li key={label} data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <span>{state === "complete" ? <Check aria-label="完了" size={14} /> : index + 1}</span>
            <small>{label}</small>
          </li>
        );
      })}
    </ol>
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
