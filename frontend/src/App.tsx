import {
  BellOff,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Play,
  RotateCw,
  Search,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState, type SetStateAction } from "react";
import { AdminConsole } from "./AdminConsole";
import { LandingPage } from "./LandingPage";
import {
  completeOAuthCallback,
  fetchBackupStatus,
  fetchHealth,
  fetchProofPayload,
  runBackup,
  startOAuth,
  updateProofVisibility,
  type BackupRunResponse,
  type HealthResponse,
  type OAuthCallbackResponse,
} from "./api";
import type { ProofPageVisibility, ProofPublicPayload } from "../../shared/types";

export function App() {
  return (
    <main className="app-shell">
      <header className="top-bar">
        <a className="brand-mark" href="#top" aria-label="XGuard">
          <ShieldCheck aria-hidden="true" size={22} />
          <span>XGuard</span>
        </a>
        <nav className="view-tabs" aria-label="Primary">
          <a href="#cast-home">Cast</a>
          <a href="#recovery">Recovery</a>
          <a href="#admin">Admin</a>
        </nav>
        <div className="top-actions">
          <button className="icon-button" type="button" aria-label="検索">
            <Search aria-hidden="true" size={18} />
          </button>
          <button className="icon-button" type="button" aria-label="控えめ通知">
            <BellOff aria-hidden="true" size={18} />
          </button>
        </div>
      </header>

      <PrototypeConsole />
      <LandingPage />
      <AdminConsole />
    </main>
  );
}

type FlowStep = "idle" | "checking" | "connected" | "backed-up" | "proof-ready" | "revoked" | "error";

interface ActivityEntry {
  label: string;
  detail: string;
}

function PrototypeConsole() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [session, setSession] = useState<OAuthCallbackResponse | null>(null);
  const [backup, setBackup] = useState<BackupRunResponse | null>(null);
  const [proof, setProof] = useState<ProofPublicPayload | null>(null);
  const [visibility, setVisibility] = useState<ProofPageVisibility>("private");
  const [revokedAt, setRevokedAt] = useState<string | null>(null);
  const [step, setStep] = useState<FlowStep>("idle");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    let active = true;

    fetchHealth()
      .then((response) => {
        if (!active) {
          return;
        }

        setHealth(response);
        appendActivity(setActivity, "API ready", `${response.mode} / OAuth ${response.xOAuthMode}`);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setStep("error");
        setErrorMessage(getErrorMessage(error));
      });

    return () => {
      active = false;
    };
  }, []);

  const latestRun = backup?.backupRun;
  const progressItems = useMemo(
    () => [
      { label: "API", value: health?.ok ? "起動中" : "未確認", tone: health?.ok ? "safe" : "muted" },
      { label: "OAuth", value: session ? "接続済み" : "未接続", tone: session ? "safe" : "muted" },
      { label: "Backup", value: latestRun?.status ?? "未実行", tone: latestRun?.status === "completed" ? "safe" : "muted" },
      { label: "Proof", value: visibility, tone: visibility === "private" ? "warn" : visibility === "revoked" ? "danger" : "safe" },
    ],
    [health?.ok, latestRun?.status, session, visibility],
  );

  async function handleConnect() {
    await runFlowAction("connect", async () => {
      setStep("checking");
      const oauth = await startOAuth();
      appendActivity(setActivity, "OAuth start", `${oauth.mode} / ${oauth.scopes.join(", ")}`);

      if (oauth.mode === "configured") {
        window.location.assign(oauth.authorizationUrl);
        return;
      }

      const callback = await completeOAuthCallback("mock-authorization-code", oauth.state);
      setSession(callback);
      setStep("connected");
      appendActivity(setActivity, "OAuth callback", `@${callback.connectedAccount.username} を repository-ref-only で接続`);
    });
  }

  async function handleBackup() {
    if (!session) {
      return;
    }

    await runFlowAction("backup", async () => {
      const response = await runBackup(25, session.sessionToken);
      setBackup(response);
      setProof(null);
      setVisibility("private");
      setRevokedAt(null);
      setStep("backed-up");
      appendActivity(
        setActivity,
        "Backup completed",
        `${response.backupRun.tweetsCaptured} posts / $${response.backupRun.estimatedCostUsd.toFixed(2)}`,
      );
    });
  }

  async function handleRefreshStatus() {
    if (!session || !latestRun) {
      return;
    }

    await runFlowAction("status", async () => {
      const status = await fetchBackupStatus(latestRun.id, session.sessionToken);
      setBackup((current) => (current ? { ...current, backupRun: status } : current));
      appendActivity(setActivity, "Status refreshed", status.status);
    });
  }

  async function handleVisibility(nextVisibility: Extract<ProofPageVisibility, "unlisted" | "public" | "revoked">) {
    if (!session || !latestRun) {
      return;
    }

    await runFlowAction(`visibility:${nextVisibility}`, async () => {
      const response = await updateProofVisibility(latestRun.id, nextVisibility, session.sessionToken);
      setVisibility(response.visibility);
      setRevokedAt(response.revokedAt);

      if (response.visibility === "revoked") {
        setProof(null);
        setStep("revoked");
        appendActivity(setActivity, "Proof revoked", response.revokedAt ?? "revoked");
        return;
      }

      const payload = await fetchProofPayload(latestRun.id, session.sessionToken);
      setProof(payload);
      setStep("proof-ready");
      appendActivity(setActivity, "Proof ready", `${response.visibility} / @${payload.username}`);
    });
  }

  async function runFlowAction(action: string, fn: () => Promise<void>) {
    setBusyAction(action);
    setErrorMessage(null);

    try {
      await fn();
    } catch (error: unknown) {
      setStep("error");
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <section className="prototype-console" aria-labelledby="prototype-title">
      <div className="prototype-heading">
        <p className="eyebrow">Live Prototype</p>
        <h2 id="prototype-title">実 API で backup と proof まで確認する。</h2>
        <p>
          Mock OAuth では接続から proof DTO 取得までこの画面で完結します。Configured OAuth は X の認可画面へ遷移します。
        </p>
      </div>

      <div className="prototype-panel">
        <div className="flow-status" aria-label="プロトタイプ状態">
          {progressItems.map((item) => (
            <div className="flow-pill" data-tone={item.tone} key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>

        <div className="flow-actions">
          <button type="button" onClick={handleConnect} disabled={Boolean(busyAction) || Boolean(session)}>
            {busyAction === "connect" ? <Loader2 aria-hidden="true" size={18} /> : <ShieldCheck aria-hidden="true" size={18} />}
            <span>{session ? "X 接続済み" : "Read-only X 接続"}</span>
          </button>
          <button type="button" onClick={handleBackup} disabled={Boolean(busyAction) || !session}>
            {busyAction === "backup" ? <Loader2 aria-hidden="true" size={18} /> : <Play aria-hidden="true" size={18} />}
            <span>Backup 実行</span>
          </button>
          <button type="button" onClick={handleRefreshStatus} disabled={Boolean(busyAction) || !latestRun}>
            <RotateCw aria-hidden="true" size={18} />
            <span>Status 更新</span>
          </button>
          <button type="button" onClick={() => handleVisibility("public")} disabled={Boolean(busyAction) || !latestRun || visibility === "revoked"}>
            <Eye aria-hidden="true" size={18} />
            <span>Proof 公開</span>
          </button>
          <button type="button" onClick={() => handleVisibility("revoked")} disabled={Boolean(busyAction) || !latestRun || visibility === "revoked"}>
            <EyeOff aria-hidden="true" size={18} />
            <span>Proof 失効</span>
          </button>
        </div>

        {errorMessage ? (
          <div className="flow-alert" role="alert">
            <XCircle aria-hidden="true" size={18} />
            <span>{errorMessage}</span>
          </div>
        ) : (
          <div className="flow-alert" data-tone="ok">
            <CheckCircle2 aria-hidden="true" size={18} />
            <span>{getStepMessage(step)}</span>
          </div>
        )}

        <div className="flow-grid">
          <article>
            <span>Connected account</span>
            <strong>{session ? `@${session.connectedAccount.username}` : "未接続"}</strong>
            <small>{session?.tokenStorage ?? "token refs only, raw token hidden"}</small>
          </article>
          <article>
            <span>Latest backup</span>
            <strong>{latestRun ? `${latestRun.tweetsCaptured} posts` : "未実行"}</strong>
            <small>{latestRun ? `${latestRun.status} / ${latestRun.createdAt}` : "mock flow ready"}</small>
          </article>
          <article>
            <span>Proof visibility</span>
            <strong>{visibility}</strong>
            <small>{revokedAt ? `revoked at ${revokedAt}` : "private by default"}</small>
          </article>
        </div>
      </div>

      <div className="proof-panel" aria-label="Proof preview">
        <div>
          <span>Proof DTO</span>
          <strong>{proof ? `@${proof.username}` : "公開前または失効済み"}</strong>
          <small>{proof ? `${proof.snapshotCounts.tweets} snapshots / ${proof.redactionPolicyVersion}` : "raw X payload は表示しません"}</small>
        </div>
        {proof ? (
          <ul>
            {proof.representativeTweets.map((tweet) => (
              <li key={tweet.tweetId}>
                <span>{new Date(tweet.postedAt).toLocaleDateString("ja-JP")}</span>
                <p>{tweet.text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <ol>
            {activity.length > 0 ? (
              activity.map((entry) => (
                <li key={`${entry.label}-${entry.detail}`}>
                  <span>{entry.label}</span>
                  <p>{entry.detail}</p>
                </li>
              ))
            ) : (
              <li>
                <span>Waiting</span>
                <p>API health check を実行中です。</p>
              </li>
            )}
          </ol>
        )}
      </div>
    </section>
  );
}

function appendActivity(update: (value: SetStateAction<ActivityEntry[]>) => void, label: string, detail: string) {
  update((current) => [{ label, detail }, ...current].slice(0, 4));
}

function getStepMessage(step: FlowStep): string {
  switch (step) {
    case "checking":
      return "Read-only OAuth を確認中です。";
    case "connected":
      return "接続済みです。次に backup を実行できます。";
    case "backed-up":
      return "Backup 完了。Proof は private のまま保持されています。";
    case "proof-ready":
      return "Redacted proof DTO を取得しました。";
    case "revoked":
      return "Proof は失効済みです。再公開は拒否されます。";
    case "error":
      return "操作に失敗しました。";
    default:
      return "Mock mode ならこの画面だけで smoke flow を完了できます。";
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown_error";
}
