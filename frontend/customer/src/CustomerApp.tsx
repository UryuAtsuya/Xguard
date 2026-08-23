import { ShieldCheck } from "lucide-react";
import { CustomerPortal } from "./CustomerPortal";

export function CustomerApp() {
  if (window.location.pathname !== "/") {
    document.title = "404 | XGuard";
    return (
      <main className="customer-shell not-found">
        <p className="eyebrow">404</p>
        <h1>ページが見つかりません</h1>
        <a href="/">XGuardトップへ戻る</a>
      </main>
    );
  }

  document.title = "XGuard | Xアカウントの保全と証明";

  return (
    <main className="customer-shell">
      <header className="customer-header">
        <a className="brand-mark" href="/" aria-label="XGuard トップ">
          <ShieldCheck aria-hidden="true" size={22} />
          <span>
            <strong>XGuard</strong>
            <small>Xの記録を、あなたの手元に</small>
          </span>
        </a>
        <nav aria-label="ページ内メニュー">
          <a href="#how-it-works">残すもの</a>
          <a href="#safety">守り方</a>
          <a href="#faq">よくある質問</a>
        </nav>
        <span className="header-privacy">
          <ShieldCheck aria-hidden="true" size={15} />
          公開は自分で選べます
        </span>
      </header>
      <CustomerPortal />
    </main>
  );
}
