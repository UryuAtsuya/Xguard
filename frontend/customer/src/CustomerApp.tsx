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
            <small>Account continuity</small>
          </span>
        </a>
      </header>
      <CustomerPortal />
    </main>
  );
}
