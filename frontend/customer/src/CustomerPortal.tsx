import {
  Archive,
  Check,
  DatabaseBackup,
  FileCheck2,
  KeyRound,
  LockKeyhole,
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
          <div className="night-reflection" aria-hidden="true" />
          <p className="hero-kicker">夜の活動を、静かに守る。</p>
          <h1>
            積み上げた発信を、<span>あなたの手元に。</span>
          </h1>
          <p className="hero-text">
            プロフィールと直近の投稿を、誰にも見せず静かに保全します。
            必要なときだけ、自分の活動を確かめられる記録にします。
          </p>
          <a className="hero-start-link" href="#start">
            保全をはじめる <span aria-hidden="true">↓</span>
          </a>
          <ul className="hero-assurances" aria-label="XGuardの接続方針">
            <li><strong>読むだけ</strong><span>投稿・DM・フォロー操作はしません</span></li>
            <li><strong>最初は非公開</strong><span>見せる範囲はあとから選べます</span></li>
            <li><strong>必要な記録だけ</strong><span>プロフィールと直近25件を保全します</span></li>
          </ul>
          <div className="story-note">
            <span aria-hidden="true">01</span>
            <p><strong>公開するタイミングも、範囲も、自分で選ぶ。</strong><span>保全したデータは、公開操作をするまで外部から見えません。</span></p>
          </div>
        </div>

        <aside className="journey-card" id="start" aria-label="保全の手続き">
          <div className="journey-card-header">
            <div>
              <p className="section-label">保全をはじめる</p>
              <h2>3つの確認で、手元に残す。</h2>
            </div>
            <span className="privacy-badge"><LockKeyhole aria-hidden="true" size={14} /> 最初は非公開</span>
          </div>

          <JourneyProgress phase={phase} />

          {phase === "account" ? (
            <form className="journey-action" onSubmit={handleConnect} noValidate>
              <div className="form-heading">
                <span>はじめに</span>
                <h3>Xアカウントを確認</h3>
              </div>
              <label htmlFor="x-username">保全したいXのユーザー名</label>
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
                Xで本人確認する
              </button>
            </form>
          ) : phase === "backup" && connectedAccount ? (
            <section className="journey-action current-action" aria-labelledby="backup-action-title">
              <div className="form-heading">
                <span>本人確認済み</span>
                <h3 id="backup-action-title">記録を保全</h3>
              </div>
              <div className="connected-account">
                <Check aria-hidden="true" size={18} />
                <div><strong>@{connectedAccount.username}</strong><span>本人確認済み</span></div>
              </div>
              <p>プロフィールと直近25件の投稿を、読み取り専用で保存します。</p>
              <button className="primary-action" type="button" onClick={handleBackup} disabled={isBusy}>
                <DatabaseBackup aria-hidden="true" size={18} />
                プロフィールと投稿を保全する
              </button>
            </section>
          ) : proof && backupRun ? (
            <section className="journey-action current-action" aria-labelledby="backup-complete-title">
              <div className="form-heading success-heading">
                <span>保全完了</span>
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
          <p className="section-label">残す記録</p>
          <h2 id="archive-title">あなたらしさが分かる、3つの記録。</h2>
          <p>必要以上に集めません。自分の活動を説明するときに役立つものだけを残します。</p>
        </div>
        <div className="archive-grid">
          <article><span>01</span><div><h3>アカウントの顔</h3><p>表示名、ユーザー名、自己紹介。本人らしさを確かめるためのプロフィール。</p></div></article>
          <article><span>02</span><div><h3>最近の発信</h3><p>活動の流れが分かる直近25件。読むための権限だけで保存します。</p></div></article>
          <article><span>03</span><div><h3>必要な時の証明</h3><p>初期状態は非公開。必要になった時だけ見せられる確認ページです。</p></div></article>
        </div>
      </section>

      <section className="safety-section" id="safety" aria-labelledby="safety-title">
        <div className="section-intro">
          <p className="section-label">XGuardの約束</p>
          <h2 id="safety-title">守るために、しないことを決めています。</h2>
          <p>アカウントを動かすサービスではありません。記録を残すための、読み取り専用の保全サービスです。</p>
        </div>
        <div className="safety-grid">
          <article>
            <span aria-hidden="true">01</span>
            <h3>アカウントを動かさない</h3>
            <p>XGuardが投稿、DM、フォロー操作を行うことはありません。</p>
          </article>
          <article>
            <span aria-hidden="true">02</span>
            <h3>必要以上に集めない</h3>
            <p>プロフィールと直近25件の投稿を、復旧に備えた控えとして保存します。</p>
          </article>
          <article>
            <span aria-hidden="true">03</span>
            <h3>勝手に公開しない</h3>
            <p>保全した内容は、公開操作を行うまで外部向けに表示されません。</p>
          </article>
        </div>
      </section>

      <section className="faq-section" id="faq" aria-labelledby="faq-title">
        <div>
          <p className="section-label">接続前の確認</p>
          <h2 id="faq-title">接続前に知っておきたいこと</h2>
        </div>
        <div className="faq-list">
          <details>
            <summary>XGuardから投稿されることはありますか？</summary>
            <p>ありません。XGuardは読み取り専用で、投稿・DM・フォロー操作を行いません。</p>
          </details>
          <details>
            <summary>Xのパスワードを預ける必要はありますか？</summary>
            <p>ありません。Xの公式認証画面で本人確認するため、XGuardへパスワードを入力することはありません。</p>
          </details>
          <details>
            <summary>何が保全されますか？</summary>
            <p>現在のプロフィール情報と、直近25件の投稿を保全します。</p>
          </details>
          <details>
            <summary>保全した内容を誰かに見られますか？</summary>
            <p>初期状態では非公開です。見せる必要ができた時に、自分で公開範囲を選べます。</p>
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
