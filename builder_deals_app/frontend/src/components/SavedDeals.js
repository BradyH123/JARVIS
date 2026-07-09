import { api } from "../api";

const fmt = (n) => "$" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function SavedDeals({ deals, onRefresh }) {
  if (!deals || deals.length === 0) {
    return <div className="empty">No saved deals yet. Analyze a property and click "Save deal".</div>;
  }
  async function remove(id) {
    if (!window.confirm("Delete this deal?")) return;
    await api.deleteDeal(id);
    onRefresh();
  }
  return (
    <div className="saved-list">
      {deals.map((d) => {
        const best = d.result?.strategies?.[0];
        return (
          <div className="card saved-card" key={d.id}>
            <div className="saved-head">
              <div>
                <h3>{d.label}</h3>
                <div className="dim small">{d.listing?.address}, {d.listing?.city} {d.listing?.state} · saved {new Date(d.saved_at * 1000).toLocaleString()}</div>
              </div>
              <button className="link danger" onClick={() => remove(d.id)}>Delete</button>
            </div>
            {best && (
              <div className="saved-best">
                <span className="dim">Best exit</span>
                <b>{best.strategy}</b>
                <span className={best.net_profit >= 0 ? "good" : "bad"}>{fmt(best.net_profit)}</span>
                <span className="dim">ROI {Number(best.roi_pct).toFixed(1)}%</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
