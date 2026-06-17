import { AlertTriangle, Building2, RefreshCw, Store } from "lucide-react";
import type { ReactNode } from "react";

const adminRows = [
  { name: "Rina", shop: "Club L", status: "保護中", issue: "なし", age: "3分前" },
  { name: "Mika", shop: "Lounge S", status: "要確認", issue: "認証切れ", age: "42分放置" },
  { name: "Aoi", shop: "Solo", status: "復旧中", issue: "凍結申請", age: "本日 02:18" },
];

export function AdminConsole() {
  return (
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
          <span role="columnheader">Cast</span>
          <span role="columnheader">Store</span>
          <span role="columnheader">Status</span>
          <span role="columnheader">Issue</span>
          <span role="columnheader">Last sync</span>
        </div>
        {adminRows.map((row) => (
          <div className="admin-row" role="row" key={`${row.name}-${row.shop}`}>
            <strong role="cell">{row.name}</strong>
            <span role="cell">{row.shop}</span>
            <span role="cell">{row.status}</span>
            <span role="cell">{row.issue}</span>
            <span role="cell">{row.age}</span>
          </div>
        ))}
      </div>
    </section>
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
