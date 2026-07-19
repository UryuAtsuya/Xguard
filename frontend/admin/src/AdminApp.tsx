import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  FileCheck2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import type { AdminMember, AdminRole } from "../../../shared/admin";
import type { AdminDatabaseSnapshot, BackupRun, BackupRunStatus } from "../../../shared/types";
import {
  AdminApiError,
  fetchAdminDatabaseSnapshot,
  fetchAdminMembers,
  fetchAdminSession,
  inviteAdminMember,
  updateAdminMember,
} from "./api";
import {
  exchangeMagicLinkCode,
  getCurrentSession,
  sendMagicLink,
  signOutAdmin,
} from "./auth";

const knownPaths = new Set(["/", "/login", "/auth/callback", "/team"]);
const adminEnvironment = import.meta.env.VITE_ADMIN_ENVIRONMENT ?? import.meta.env.MODE;

export function AdminApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [member, setMember] = useState<AdminMember | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "denied" | "error">("loading");
  const path = window.location.pathname;

  useEffect(() => {
    let active = true;

    async function restoreAdminSession() {
      try {
        let currentSession: Session | null;

        if (path === "/auth/callback") {
          const code = new URLSearchParams(window.location.search).get("code");
          if (!code) throw new Error("admin_magic_link_code_missing");
          currentSession = await exchangeMagicLinkCode(code);
          window.history.replaceState({}, "", "/");
        } else {
          currentSession = await getCurrentSession();
        }

        if (!active) return;
        if (!currentSession) {
          setStatus("ready");
          return;
        }

        const response = await fetchAdminSession(currentSession.access_token);
        if (!active) return;
        setSession(currentSession);
        setMember(response.member);
        setStatus("ready");
      } catch (error) {
        if (!active) return;
        if (error instanceof AdminApiError && error.status === 403) {
          await signOutAdmin();
          setStatus("denied");
        } else {
          setStatus("error");
        }
      }
    }

    void restoreAdminSession();
    return () => {
      active = false;
    };
  }, [path]);

  if (!knownPaths.has(path)) {
    return <NotFound />;
  }

  if (status === "loading") {
    return <CenteredMessage title="認証を確認しています" detail="magic linkの確認が完了するまでお待ちください。" />;
  }

  if (status === "denied") {
    return <CenteredMessage title="管理画面を利用できません" detail="このメールアドレスは招待されていないか、無効化されています。" />;
  }

  if (status === "error") {
    return <CenteredMessage title="認証に失敗しました" detail="magic linkを再発行して、もう一度お試しください。" />;
  }

  if (!session || !member || path === "/login") {
    return <LoginPage />;
  }

  return (
    <AdminShell member={member} onSignOut={async () => {
      await signOutAdmin();
      window.location.assign("/login");
    }}>
      {path === "/team" ? (
        member.role === "owner" ? (
          <TeamPage accessToken={session.access_token} currentMember={member} />
        ) : (
          <CenteredMessage title="owner権限が必要です" detail="member管理はownerだけが利用できます。" />
        )
      ) : (
        <Dashboard accessToken={session.access_token} member={member} />
      )}
    </AdminShell>
  );
}

function LoginPage() {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("招待されたメールアドレスを入力してください。");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await sendMagicLink(email);
      setNotice("magic linkを送信しました。メールを確認してください。");
    } catch {
      setNotice("送信できませんでした。招待済みのメールアドレスか確認してください。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-context" aria-label="管理画面について">
        <a className="admin-brand" href="/login">
          <ShieldCheck aria-hidden="true" size={24} />
          <strong>XGuard Admin</strong>
        </a>
        <div>
          <p className="eyebrow">Restricted operations</p>
          <h2>保全サービスの状態を、確実に把握する。</h2>
          <p>招待された運用担当者だけが利用できる、XGuard専用の管理環境です。</p>
        </div>
        <ul>
          <li><CheckCircle2 aria-hidden="true" size={17} /> 招待済みmember限定</li>
          <li><ShieldCheck aria-hidden="true" size={17} /> roleごとのアクセス制御</li>
          <li><Clock3 aria-hidden="true" size={17} /> magic linkは一回限り</li>
        </ul>
      </section>
      <form className="login-card" onSubmit={submit}>
        <div className="environment-badge">
          <span aria-hidden="true" />
          {adminEnvironment}
        </div>
        <p className="eyebrow">Secure sign in</p>
        <h1>管理画面へログイン</h1>
        <p>{notice}</p>
        <label htmlFor="admin-email">メールアドレス</label>
        <input
          id="admin-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button className="primary-button" type="submit" disabled={busy}>
          magic linkを送信
        </button>
        <small>パスワードは使用しません。受信したメール内のリンクから、このブラウザでログインしてください。</small>
      </form>
    </main>
  );
}

function AdminShell({
  children,
  member,
  onSignOut,
}: {
  children: React.ReactNode;
  member: AdminMember;
  onSignOut: () => void;
}) {
  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <a className="admin-brand" href="/">
          <ShieldCheck aria-hidden="true" size={22} />
          <span>
            <strong>XGuard</strong>
            <small>Operations</small>
          </span>
        </a>
        <div className="environment-badge">
          <span aria-hidden="true" />
          {adminEnvironment}
        </div>
        <nav aria-label="管理メニュー">
          <a href="/" aria-current={window.location.pathname === "/" ? "page" : undefined}>
            <Database aria-hidden="true" size={17} /> Dashboard
          </a>
          {member.role === "owner" ? (
            <a href="/team" aria-current={window.location.pathname === "/team" ? "page" : undefined}>
              <Users aria-hidden="true" size={17} /> Team
            </a>
          ) : null}
        </nav>
        <div className="admin-account">
          <span>{member.email}</span>
          <strong>{member.role}</strong>
          <button type="button" onClick={onSignOut}>
            <LogOut aria-hidden="true" size={16} /> ログアウト
          </button>
        </div>
      </aside>
      <section className="admin-content">{children}</section>
    </main>
  );
}

function Dashboard({ accessToken, member }: { accessToken: string; member: AdminMember }) {
  const [snapshot, setSnapshot] = useState<AdminDatabaseSnapshot | null>(null);
  const [notice, setNotice] = useState("データを読み込んでいます");

  async function refresh() {
    try {
      setNotice("データを読み込んでいます");
      setSnapshot(await fetchAdminDatabaseSnapshot(accessToken));
      setNotice("最新のsnapshotです");
    } catch {
      setNotice("snapshotを取得できませんでした");
    }
  }

  useEffect(() => {
    void refresh();
  }, [accessToken]);

  const completedBackups = snapshot?.backupRuns.filter((run) => run.status === "completed").length ?? 0;
  const actionRequiredBackups = snapshot?.backupRuns.filter((run) => actionRequiredStatuses.has(run.status)).length ?? 0;
  const availableProofs = snapshot?.proofPages.filter((page) => !page.revokedAt).length ?? 0;
  const unresolvedEvents = snapshot?.contentComplianceEvents.filter((event) => !event.resolvedAt).length ?? 0;
  const recentBackups = [...(snapshot?.backupRuns ?? [])]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 5);

  return (
    <>
      <PageHeader eyebrow="Operations overview" title="運用ダッシュボード">
        <div className="page-actions">
          <span className="role-badge">{member.role}</span>
          <button className="secondary-button" type="button" onClick={refresh}>
            <RefreshCw aria-hidden="true" size={17} /> 更新
          </button>
        </div>
      </PageHeader>
      <div className="operation-notice" data-tone={actionRequiredBackups + unresolvedEvents > 0 ? "warning" : "success"}>
        {actionRequiredBackups + unresolvedEvents > 0
          ? <AlertTriangle aria-hidden="true" size={19} />
          : <CheckCircle2 aria-hidden="true" size={19} />}
        <div>
          <strong>{actionRequiredBackups + unresolvedEvents > 0 ? "確認が必要な項目があります" : "現在、重大な問題はありません"}</strong>
          <span>{notice}{snapshot ? `・${formatDateTime(snapshot.generatedAt)} 更新` : ""}</span>
        </div>
      </div>

      <section className="metric-grid" aria-label="運用指標">
        <MetricCard label="保全完了" value={completedBackups} detail="取得済みbackup run" tone="success" icon={<CheckCircle2 aria-hidden="true" size={19} />} />
        <MetricCard label="要対応" value={actionRequiredBackups} detail="失敗・制限・認証切れ" tone={actionRequiredBackups > 0 ? "warning" : "neutral"} icon={<AlertTriangle aria-hidden="true" size={19} />} />
        <MetricCard label="利用可能なproof" value={availableProofs} detail="revokedを除く" tone="neutral" icon={<FileCheck2 aria-hidden="true" size={19} />} />
        <MetricCard label="未解決イベント" value={unresolvedEvents} detail="compliance review" tone={unresolvedEvents > 0 ? "warning" : "neutral"} icon={<Activity aria-hidden="true" size={19} />} />
      </section>

      <div className="operations-grid">
        <section className="panel" aria-labelledby="recent-backups-title">
          <div className="panel-header">
            <div>
              <p className="section-label">Recent activity</p>
              <h2 id="recent-backups-title">最近の保全処理</h2>
            </div>
            <span>{recentBackups.length}件</span>
          </div>
          {recentBackups.length > 0 ? (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">処理ID</th>
                    <th scope="col">状態</th>
                    <th scope="col">投稿</th>
                    <th scope="col">実行日時</th>
                  </tr>
                </thead>
                <tbody>
                  {recentBackups.map((run) => (
                    <tr key={run.id}>
                      <th scope="row"><code>{shortId(run.id)}</code></th>
                      <td><StatusPill status={run.status} /></td>
                      <td>{run.tweetsCaptured}</td>
                      <td>{formatDateTime(run.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="保全処理はまだありません" detail="customerが最初の保全を完了すると、ここに履歴が表示されます。" />
          )}
        </section>

        <section className="panel system-panel" aria-labelledby="system-state-title">
          <div className="panel-header">
            <div>
              <p className="section-label">Data sources</p>
              <h2 id="system-state-title">データ状態</h2>
            </div>
          </div>
          <div className="source-list">
            {(snapshot?.tables ?? []).map((table) => (
              <div className="source-row" key={table.name}>
                <div>
                  <strong>{tableLabel[table.name] ?? table.name}</strong>
                  <code>{table.name}</code>
                </div>
                <div>
                  <strong>{table.rowCount}</strong>
                  <span>{table.lastUpdatedAt ? formatDateTime(table.lastUpdatedAt) : "データなし"}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function TeamPage({
  accessToken,
  currentMember,
}: {
  accessToken: string;
  currentMember: AdminMember;
}) {
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("viewer");
  const [notice, setNotice] = useState("memberを読み込んでいます");

  async function reload() {
    try {
      const response = await fetchAdminMembers(accessToken);
      setMembers(response.members);
      setNotice("member一覧を更新しました");
    } catch {
      setNotice("member一覧を取得できませんでした");
    }
  }

  useEffect(() => {
    void reload();
  }, [accessToken]);

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await inviteAdminMember(accessToken, { email, role });
      setEmail("");
      setNotice("招待を送信しました");
      await reload();
    } catch {
      setNotice("招待を送信できませんでした");
    }
  }

  async function update(member: AdminMember, input: { role?: AdminRole; status?: "active" | "disabled" }) {
    try {
      await updateAdminMember(accessToken, member.id, input);
      setNotice("memberを更新しました");
      await reload();
    } catch {
      setNotice("更新できませんでした。最後のownerや自分自身の無効化はできません。");
    }
  }

  return (
    <>
      <PageHeader eyebrow="Access control" title="Team">
        <span className="member-count">{members.length} members</span>
      </PageHeader>
      <div className="operation-notice compact" data-tone="neutral">
        <ShieldCheck aria-hidden="true" size={19} />
        <div>
          <strong>ownerだけがmemberを変更できます</strong>
          <span>{notice}</span>
        </div>
      </div>

      <section className="invite-panel" aria-labelledby="invite-title">
        <div>
          <p className="section-label">Invite member</p>
          <h2 id="invite-title">運用memberを招待</h2>
          <p>招待先と必要最小限のroleを指定してください。</p>
        </div>
        <form className="invite-form" onSubmit={invite}>
          <UserPlus aria-hidden="true" size={20} />
          <input
            aria-label="招待メール"
            type="email"
            required
            placeholder="member@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <select aria-label="招待role" value={role} onChange={(event) => setRole(event.target.value as AdminRole)}>
            <option value="viewer">viewer</option>
            <option value="operator">operator</option>
            <option value="owner">owner</option>
          </select>
          <button className="primary-button" type="submit">招待</button>
        </form>
      </section>

      <section className="panel member-panel" aria-labelledby="member-list-title">
        <div className="panel-header">
          <div>
            <p className="section-label">Members</p>
            <h2 id="member-list-title">アクセス権限</h2>
          </div>
        </div>
        <div className="data-table-wrap">
          <table className="data-table member-table">
            <thead>
              <tr>
                <th scope="col">member</th>
                <th scope="col">状態</th>
                <th scope="col">role</th>
                <th scope="col">更新日時</th>
                <th scope="col"><span className="visually-hidden">操作</span></th>
              </tr>
            </thead>
            <tbody>
              {members.map((entry) => (
                <tr key={entry.id}>
                  <th scope="row">
                    <strong>{entry.email}</strong>
                    {entry.id === currentMember.id ? <small>ログイン中</small> : null}
                  </th>
                  <td><MemberStatusPill status={entry.status} /></td>
                  <td>
                    <select
                      aria-label={`${entry.email}のrole`}
                      value={entry.role}
                      onChange={(event) => void update(entry, { role: event.target.value as AdminRole })}
                    >
                      <option value="viewer">viewer</option>
                      <option value="operator">operator</option>
                      <option value="owner">owner</option>
                    </select>
                  </td>
                  <td>{formatDateTime(entry.updatedAt)}</td>
                  <td>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={entry.id === currentMember.id}
                      onClick={() => void update(entry, { status: entry.status === "disabled" ? "active" : "disabled" })}
                    >
                      {entry.status === "disabled" ? "再有効化" : "無効化"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function MetricCard({
  detail,
  icon,
  label,
  tone,
  value,
}: {
  detail: string;
  icon: React.ReactNode;
  label: string;
  tone: "neutral" | "success" | "warning";
  value: number;
}) {
  return (
    <article className="metric-card" data-tone={tone}>
      <div>
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function StatusPill({ status }: { status: BackupRunStatus }) {
  const tone = statusTone[status];
  return (
    <span className="status-pill" data-tone={tone}>
      <span aria-hidden="true" />
      {backupStatusLabel[status]}
    </span>
  );
}

function MemberStatusPill({ status }: { status: AdminMember["status"] }) {
  return (
    <span className="status-pill" data-tone={memberStatusTone[status]}>
      <span aria-hidden="true" />
      {memberStatusLabel[status]}
    </span>
  );
}

function EmptyState({ detail, title }: { detail: string; title: string }) {
  return (
    <div className="empty-state">
      <Database aria-hidden="true" size={23} />
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}

function PageHeader({
  children,
  eyebrow,
  title,
}: {
  children?: React.ReactNode;
  eyebrow: string;
  title: string;
}) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {children}
    </header>
  );
}

function CenteredMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="centered-message">
      <ShieldCheck aria-hidden="true" size={30} />
      <h1>{title}</h1>
      <p>{detail}</p>
      <a href="/login">ログインへ戻る</a>
    </main>
  );
}

function NotFound() {
  return <CenteredMessage title="404" detail="この管理ページは存在しません。" />;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

const actionRequiredStatuses = new Set<BackupRun["status"]>([
  "failed",
  "partial",
  "rate_limited",
  "auth_expired",
]);

const tableLabel: Record<string, string> = {
  backup_runs: "保全処理",
  proof_pages: "proofページ",
  content_compliance_events: "complianceイベント",
};

const backupStatusLabel: Record<BackupRunStatus, string> = {
  queued: "待機中",
  running: "処理中",
  completed: "完了",
  partial: "一部完了",
  failed: "失敗",
  rate_limited: "API制限",
  auth_expired: "認証切れ",
};

const statusTone: Record<BackupRunStatus, "neutral" | "success" | "warning" | "danger"> = {
  queued: "neutral",
  running: "neutral",
  completed: "success",
  partial: "warning",
  failed: "danger",
  rate_limited: "warning",
  auth_expired: "danger",
};

const memberStatusLabel: Record<AdminMember["status"], string> = {
  invited: "招待中",
  active: "有効",
  disabled: "無効",
};

const memberStatusTone: Record<AdminMember["status"], "neutral" | "success" | "danger"> = {
  invited: "neutral",
  active: "success",
  disabled: "danger",
};
