import {
  AlertTriangle,
  Archive,
  ChevronRight,
  Copy,
  Download,
  EyeOff,
  KeyRound,
  LockKeyhole,
  MessageSquareText,
  Moon,
  Sparkles,
  UserRound,
  Wand2,
} from "lucide-react";
import type { ReactNode } from "react";
import mediaArchive from "./assets/media-archive-preview.svg";
import profilePreview from "./assets/nightwork-profile-preview.svg";
import recoveryKit from "./assets/recovery-kit-preview.svg";

const readinessItems = [
  { label: "源氏名プロフィール", value: "保存済み", tone: "safe" },
  { label: "固定ポスト", value: "控えあり", tone: "safe" },
  { label: "直近投稿", value: "96件", tone: "safe" },
  { label: "証明ページ", value: "非公開", tone: "warn" },
];

const recoverySteps = [
  "困っている状況を選ぶ",
  "新しい連絡先を確認",
  "自己紹介と固定文をコピー",
  "共有前に証明を確認",
];

const archivePosts = [
  { tag: "反応良", title: "指名につながった告知", metric: "2.4k impressions" },
  { tag: "自己紹介", title: "初回DM前に見られるプロフィール", metric: "保存済み 12回" },
  { tag: "店舗案内", title: "出勤スケジュール固定文", metric: "画像3枚" },
];

const personaSignals = [
  { icon: <Moon size={18} />, label: "勤務後でも3分", text: "眠い時間でも、保存状態だけ先に確認。" },
  { icon: <KeyRound size={18} />, label: "鍵垢・源氏名に配慮", text: "本名ではなくSNS名と店舗文脈で管理。" },
  { icon: <Sparkles size={18} />, label: "見せる前に選べる", text: "証明は非公開から。公開と停止は自分で決める。" },
];

export function LandingPage() {
  return (
    <>
      <section id="cast-home" className="hero-section" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Night-work account backup</p>
          <h1 id="hero-title">消える前に、証明を残す。</h1>
          <p className="hero-text">
            プロフィール、固定ポスト、直近投稿を読み取り専用で保存。証明ページは最初は非公開で、共有前に伏せ字と公開範囲を確認できます。
          </p>
          <div className="persona-signal-grid" aria-label="夜職ユーザー向けの安心ポイント">
            {personaSignals.map((signal) => (
              <article className="persona-signal" key={signal.label}>
                {signal.icon}
                <strong>{signal.label}</strong>
                <p>{signal.text}</p>
              </article>
            ))}
          </div>
          <div className="hero-actions">
            <a className="primary-action" href="#prototype">
              <Wand2 aria-hidden="true" size={18} />
              Xを安全に接続
            </a>
            <a className="secondary-action" href="#archive">
              <Archive aria-hidden="true" size={18} />
              控えている内容を見る
            </a>
          </div>
        </div>

        <PhoneFrame label="キャスト用ホーム画面">
          <div className="phone-status">
            <span>9:41</span>
            <span>証明は非公開</span>
          </div>
          <img className="profile-image" src={profilePreview} alt="プロフィールと保存状態のプレビュー" />
          <div className="safe-card">
            <div>
              <span className="status-dot" />
              <p>営業導線を控え済み</p>
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
            Xが止まった時の準備を見る
          </button>
        </PhoneFrame>
      </section>

      <section id="recovery" className="section-grid recovery-section" aria-labelledby="recovery-title">
        <div className="section-heading">
          <p className="eyebrow">Recovery Kit</p>
          <h2 id="recovery-title">焦っている時ほど、次に出すものだけ見える。</h2>
          <p>
            「凍結された」「ログインできない」「なりすましが出た」。本人の言葉から始めて、店舗やお客様に見せる控えを順番に整えます。
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
            <ActionButton icon={<MessageSquareText size={17} />} label="共有文を整える" />
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
          <h2 id="archive-title">再投稿しやすい順に、営業の控えを並べる。</h2>
          <p>
            時系列だけでは、急な作り直しの時に探しづらい。自己紹介、告知、反応良、店舗案内に分けて、必要な文面をすぐ取り出せる形にします。
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
        <TrustCard icon={<LockKeyhole size={20} />} title="共有前に確認" text="店舗やサポートへ渡す前に伏せ字と公開範囲を選ぶ。" />
        <TrustCard icon={<UserRound size={20} />} title="本名前提にしない" text="源氏名、店舗名、SNS名を自然に扱う入力設計。" />
      </section>
    </>
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
