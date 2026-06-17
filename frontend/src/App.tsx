import {
  AlertTriangle,
  Archive,
  BellOff,
  Building2,
  ChevronRight,
  Copy,
  Download,
  EyeOff,
  LockKeyhole,
  MessageSquareText,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  UserRound,
  Wand2,
} from "lucide-react";
import type { ReactNode } from "react";
import profilePreview from "./assets/nightwork-profile-preview.svg";
import recoveryKit from "./assets/recovery-kit-preview.svg";
import mediaArchive from "./assets/media-archive-preview.svg";

const readinessItems = [
  { label: "プロフィール", value: "保存済み", tone: "safe" },
  { label: "固定ポスト", value: "保存済み", tone: "safe" },
  { label: "直近100件", value: "96件", tone: "safe" },
  { label: "復旧用メール", value: "要確認", tone: "warn" },
];

const recoverySteps = [
  "状況を選ぶ",
  "復旧先を確認",
  "プロフィールをコピー",
  "申請文を整える",
];

const archivePosts = [
  { tag: "反応良", title: "周年イベント告知", metric: "2.4k impressions" },
  { tag: "自己紹介", title: "初回指名向けプロフィール", metric: "保存済み 12回" },
  { tag: "店舗案内", title: "出勤スケジュール固定文", metric: "画像3枚" },
];

const adminRows = [
  { name: "Rina", shop: "Club L", status: "保護中", issue: "なし", age: "3分前" },
  { name: "Mika", shop: "Lounge S", status: "要確認", issue: "認証切れ", age: "42分放置" },
  { name: "Aoi", shop: "Solo", status: "復旧中", issue: "凍結申請", age: "本日 02:18" },
];

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

      <section id="cast-home" className="hero-section" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Night-work account backup</p>
          <h1 id="hero-title">消える前に、営業再開キットを残す。</h1>
          <p className="hero-text">
            Xのプロフィール、固定ポスト、直近投稿、画像をスマホで確認。困った時は数タップでコピーできる復旧用パッケージにまとめます。
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="#recovery">
              <Wand2 aria-hidden="true" size={18} />
              復旧キットを見る
            </a>
            <a className="secondary-action" href="#archive">
              <Archive aria-hidden="true" size={18} />
              保存内容を確認
            </a>
          </div>
        </div>

        <PhoneFrame label="キャスト用ホーム画面">
          <div className="phone-status">
            <span>9:41</span>
            <span>非公開</span>
          </div>
          <img className="profile-image" src={profilePreview} alt="プロフィールと保存状態のプレビュー" />
          <div className="safe-card">
            <div>
              <span className="status-dot" />
              <p>現在保護中</p>
            </div>
            <strong>最終バックアップ 3分前</strong>
          </div>
          <div className="readiness-list">
            {readinessItems.map((item) => (
              <InfoPill key={item.label} label={item.label} value={item.value} tone={item.tone} />
            ))}
          </div>
          <button className="panic-button" type="button">
            <AlertTriangle aria-hidden="true" size={18} />
            アカウントで困っている
          </button>
        </PhoneFrame>
      </section>

      <section id="recovery" className="section-grid recovery-section" aria-labelledby="recovery-title">
        <div className="section-heading">
          <p className="eyebrow">Recovery Wizard</p>
          <h2 id="recovery-title">パニック時に迷わせない、1画面1判断。</h2>
          <p>
            技術エラーから始めず、「凍結された」「ログインできない」「乗っ取られたかも」という本人の言葉から復旧導線を開始します。
          </p>
        </div>

        <div className="recovery-board">
          <img className="board-image" src={recoveryKit} alt="復旧キットの画像プレビュー" />
          <div className="step-list" aria-label="復旧ウィザードのステップ">
            {recoverySteps.map((step, index) => (
              <div className="step-item" key={step}>
                <span>{index + 1}</span>
                <strong>{step}</strong>
                <ChevronRight aria-hidden="true" size={18} />
              </div>
            ))}
          </div>
          <div className="copy-kit">
            <ActionButton icon={<Copy size={17} />} label="自己紹介文をコピー" />
            <ActionButton icon={<Download size={17} />} label="アイコンを保存" />
            <ActionButton icon={<MessageSquareText size={17} />} label="申請文テンプレ" />
          </div>
        </div>
      </section>

      <section id="archive" className="section-grid archive-section" aria-labelledby="archive-title">
        <div className="archive-preview">
          <img src={mediaArchive} alt="保存済み投稿とメディアのアーカイブプレビュー" />
          <div className="archive-tabs" aria-label="アーカイブ種別">
            <span>プロフィール</span>
            <span>投稿</span>
            <span>メディア</span>
          </div>
        </div>
        <div className="section-heading">
          <p className="eyebrow">Backup Archive</p>
          <h2 id="archive-title">X風ではなく、再利用しやすい順に整理。</h2>
          <p>
            投稿をただ時系列で並べるだけでは、転生直後に使いづらい。自己紹介、告知、反応良、店舗案内に分けて再投稿候補を選びやすくします。
          </p>
          <div className="post-list">
            {archivePosts.map((post) => (
              <article className="post-card" key={post.title}>
                <span>{post.tag}</span>
                <strong>{post.title}</strong>
                <small>{post.metric}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="trust-band" aria-label="プライバシー方針">
        <TrustCard icon={<EyeOff size={20} />} title="通知は控えめ" text="ロック画面に夜職文脈や復旧文言を出しすぎない。" />
        <TrustCard icon={<LockKeyhole size={20} />} title="共有前に確認" text="店舗やサポートへ渡す前に伏せ字と対象データを選ぶ。" />
        <TrustCard icon={<UserRound size={20} />} title="本名前提にしない" text="源氏名、店舗名、SNS名を自然に扱う入力設計。" />
      </section>

      <section id="admin" className="admin-section" aria-labelledby="admin-title">
        <div className="section-heading">
          <p className="eyebrow">Operator Console</p>
          <h2 id="admin-title">運営側は、高密度に要対応だけを見る。</h2>
        </div>
        <div className="admin-layout">
          <MetricCard icon={<Store size={20} />} label="登録キャスト" value="128" />
          <MetricCard icon={<RefreshCw size={20} />} label="正常同期" value="96%" />
          <MetricCard icon={<AlertTriangle size={20} />} label="要対応" value="7" />
          <MetricCard icon={<Building2 size={20} />} label="店舗管理" value="12" />
        </div>
        <div className="admin-table" role="table" aria-label="要対応ユーザー一覧">
          <div className="admin-row header" role="row">
            <span>Cast</span>
            <span>Store</span>
            <span>Status</span>
            <span>Issue</span>
            <span>Last sync</span>
          </div>
          {adminRows.map((row) => (
            <div className="admin-row" role="row" key={`${row.name}-${row.shop}`}>
              <strong>{row.name}</strong>
              <span>{row.shop}</span>
              <span>{row.status}</span>
              <span>{row.issue}</span>
              <span>{row.age}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function PhoneFrame({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="phone-frame" aria-label={label}>
      <div className="phone-screen">{children}</div>
    </div>
  );
}

function InfoPill({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="info-pill" data-tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ActionButton({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <button className="kit-action" type="button">
      {icon}
      <span>{label}</span>
    </button>
  );
}

function TrustCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="trust-card">
      {icon}
      <strong>{title}</strong>
      <p>{text}</p>
    </article>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <article className="metric-card">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
