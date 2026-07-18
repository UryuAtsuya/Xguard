import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { AdminConsole } from "./AdminConsole";
import { CustomerPortal } from "./CustomerPortal";

type AudienceView = "customer" | "admin";

function getAudienceView(): AudienceView {
  return window.location.pathname.startsWith("/admin") ? "admin" : "customer";
}

export function App() {
  const [activeView, setActiveView] = useState<AudienceView>(() => getAudienceView());

  useEffect(() => {
    function handlePopState() {
      setActiveView(getAudienceView());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    document.title = activeView === "admin" ? "XGuard Admin Console" : "XGuard";
  }, [activeView]);

  return (
    <main className={`app-shell ${activeView === "admin" ? "admin-view" : "customer-view"}`}>
      <header className="app-header">
        <a className="brand-mark" href="/" aria-label="XGuard トップ">
          <ShieldCheck aria-hidden="true" size={22} />
          <span className="brand-copy">
            <strong>XGuard</strong>
            <small>Account continuity</small>
          </span>
        </a>
        {activeView === "admin" ? (
          <nav className="audience-links" aria-label="画面リンク">
            <a href="/">顧客画面を確認</a>
          </nav>
        ) : null}
      </header>

      {activeView === "customer" ? <CustomerPortal /> : <AdminConsole />}
    </main>
  );
}
