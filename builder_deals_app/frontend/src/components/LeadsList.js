const fmt = (n) => "$" + Number(n || 0).toLocaleString();

export default function LeadsList({ leads, onAnalyze }) {
  if (!leads || leads.length === 0) {
    return <div className="empty">No leads yet. Search above to find properties.</div>;
  }
  return (
    <div className="lead-grid">
      {leads.map((l) => (
        <div className="card lead-card" key={l.id}>
          <div className="lead-header">
            <h3>{l.address}</h3>
            <span className="price">{fmt(l.price)}</span>
          </div>
          <div className="lead-meta">
            {l.city}, {l.state} {l.zip} · {l.beds} bd / {l.baths} ba · {l.sqft.toLocaleString()} sqft
          </div>
          <div className="lead-meta dim">
            Lot {l.lot_sqft.toLocaleString()} sqft · Built {l.year_built} · {l.property_type}
            {l.historic ? " · ⚠ Historic" : ""}
          </div>
          {l.description && <p className="lead-desc">{l.description}</p>}
          <button className="primary" onClick={() => onAnalyze(l)}>
            Analyze deal →
          </button>
        </div>
      ))}
    </div>
  );
}
