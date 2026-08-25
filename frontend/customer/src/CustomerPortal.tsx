import {
  Archive,
  ArrowDown,
  Check,
  DatabaseBackup,
  FileCheck2,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { BackupRun, ProofPublicPayload, XAccount } from "../../../shared/types";
import {
  completeOAuthCallback,
  fetchCustomerSession,
  fetchHealth,
  runBackup,
  startOAuth,
  type HealthResponse,
} from "./api";
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

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const resumedSessionToken = fragment.get("xguard_session");
    const oauthError = fragment.get("xguard_oauth_error");

    if (!resumedSessionToken && !oauthError) {
      return;
    }

    window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);

    if (oauthError) {
      setNotice(oauthErrorNotice(oauthError));
      return;
    }

    if (!resumedSessionToken || !/^[A-Za-z0-9_-]{32,128}$/.test(resumedSessionToken)) {
      setNotice("Xの本人確認結果を確認できませんでした。もう一度お試しください。");
      return;
    }

    setIsBusy(true);
    fetchCustomerSession(resumedSessionToken)
      .then((response) => {
        setUsername(response.connectedAccount.username);
        setConnectedAccount(response.connectedAccount);
        setSessionToken(resumedSessionToken);
        setNotice(`@${response.connectedAccount.username} を確認できました。次に保全を開始してください。`);
      })
      .catch(() => setNotice("Xの本人確認結果を確認できませんでした。もう一度お試しください。"))
      .finally(() => setIsBusy(false));
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
      const response = await startOAuth(requestedUsername);

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
          <div className="hero-copy">
            <p className="hero-kicker">Xの発信を、非公開で保全</p>
            <h1>
              積み上げた発信を、<span>あなたの手元に。</span>
            </h1>
            <p className="hero-text">
              プロフィールと直近25件を3ステップで保全。投稿・DM・フォロー操作はせず、
              公開する範囲は自分で選べます。
            </p>
            <div className="hero-actions">
              <a className="hero-primary-action" href="#start">
                保全をはじめる <ArrowDown aria-hidden="true" size={17} />
              </a>
              <a className="hero-secondary-action" href="#saved-records">保存される内容を見る</a>
            </div>
          </div>

          <PreservationSample />

          <ul className="trust-strip" aria-label="XGuardの安全な接続方針">
            <li><strong>読み取り専用</strong><span>投稿やDMはしません</span></li>
            <li><strong>パスワード不要</strong><span>X公式画面で本人確認</span></li>
            <li><strong>初期非公開</strong><span>公開範囲は自分で選択</span></li>
          </ul>
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

      <section className="saved-records-section" id="saved-records" aria-labelledby="saved-records-title">
        <div className="section-intro">
          <p className="section-label">保存される内容</p>
          <h2 id="saved-records-title">あとで見返せる、活動の控え。</h2>
          <p>必要以上に集めず、自分の活動を説明するときに役立つ記録だけを残します。</p>
        </div>
        <div className="records-ledger">
          <article><span>01</span><div><h3>プロフィール</h3><p>表示名、ユーザー名、自己紹介など、アカウントの本人らしさが分かる情報。</p></div></article>
          <article><span>02</span><div><h3>直近の投稿</h3><p>活動の流れを振り返れる直近25件。投稿する権限を使わずに保存します。</p></div></article>
          <article><span>03</span><div><h3>非公開の保全記録</h3><p>保全日時と保存件数を確認できる控え。公開操作をするまでは外部から見えません。</p></div></article>
        </div>
      </section>

      <section
        className="permission-section"
        id="permissions"
        aria-label="XGuardの接続権限"
      >
        <div className="section-intro">
          <p className="section-label">接続前の確認</p>
          <h2 id="permission-title">必要な記録だけ。アカウントは動かさない。</h2>
          <p>XGuardは記録を残すための読み取り専用サービスです。接続前に、取得するものと取得しないものを確認できます。</p>
        </div>
        <div className="permission-card">
          <article className="permission-row permission-row-allow">
            <span className="permission-icon"><Check aria-hidden="true" size={18} /></span>
            <div><small>取得する</small><h3>プロフィール・直近の投稿</h3><p>表示名、ユーザー名、自己紹介と、直近25件の投稿を保全します。</p></div>
          </article>
          <article className="permission-row permission-row-deny">
            <span className="permission-icon" aria-hidden="true">×</span>
            <div><small>取得しない</small><h3>投稿・DM・フォロー操作</h3><p>アカウントを動かす権限は求めず、XGuardから操作することもありません。</p></div>
          </article>
          <p className="permission-note"><ShieldCheck aria-hidden="true" size={17} /> 読み取り専用の権限だけを使います。</p>
        </div>
      </section>

      <section className="use-case-section" aria-labelledby="use-case-title">
        <div className="section-intro">
          <p className="section-label">こんな時に</p>
          <h2 id="use-case-title">活動を続けるための、静かな準備。</h2>
          <p>大切な発信をXの中だけに置かず、自分で確認できる記録として備えます。</p>
        </div>
        <div className="use-case-list">
          <article><span>01</span><h3>過去の発信を手元に残したい</h3></article>
          <article><span>02</span><h3>本人であることを説明する記録を準備したい</h3></article>
          <article><span>03</span><h3>見せる範囲を自分で管理したい</h3></article>
        </div>
      </section>

      <section className="faq-section" id="faq" aria-labelledby="faq-title">
        <div>
          <p className="section-label">よくある質問</p>
          <h2 id="faq-title">不安を残さず、接続するために。</h2>
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

      <a className="mobile-start-cta" href="#start" aria-label="保全をはじめる（入力へ移動）">
        <KeyRound aria-hidden="true" size={18} /> 保全をはじめる
      </a>
    </section>
  );
}

function PreservationSample() {
  return (
    <section className="preservation-sample" aria-label="保全サンプル">
      <div className="sample-topline">
        <span className="sample-label">保全サンプル</span>
        <span className="sample-private"><LockKeyhole aria-hidden="true" size={13} /> 非公開で保管</span>
      </div>
      <div className="sample-account">
        <span className="sample-avatar" aria-hidden="true">X</span>
        <div><strong>@your_account</strong><span>あなたの活動記録</span></div>
      </div>
      <div className="sample-post" aria-hidden="true">
        <span /><span /><span />
      </div>
      <dl className="sample-stats">
        <div><dt>プロフィール</dt><dd>1件</dd></div>
        <div><dt>直近の投稿</dt><dd>最大25件</dd></div>
        <div><dt>公開状態</dt><dd>非公開</dd></div>
      </dl>
      <p><ShieldCheck aria-hidden="true" size={15} /> 保存した内容は自分で確認できます</p>
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

function oauthErrorNotice(code: string): string {
  switch (code) {
    case "consent_denied":
      return "Xでの本人確認がキャンセルされました。接続する場合はもう一度お試しください。";
    case "account_mismatch":
      return "入力したユーザー名と、Xで確認したアカウントが一致しません。";
    case "scope_mismatch":
      return "読み取り専用の権限を確認できませんでした。もう一度お試しください。";
    default:
      return "Xの本人確認を完了できませんでした。時間をおいて再度お試しください。";
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
