export default function ZoningPanel({ zoning, listing }) {
  if (!zoning) return <div className="card">Loading zoning…</div>;
  const yes = (b) => (b ? "✓" : "✗");
  return (
    <div className="card">
      <h3>Zoning · {zoning.zoning_code}</h3>
      <ul className="kv">
        <li><span>Allowed uses</span><b>{zoning.allowed_uses.join(", ")}</b></li>
        <li><span>Max units</span><b>{zoning.max_units}</b></li>
        <li><span>Max height</span><b>{zoning.max_height_ft} ft</b></li>
        <li><span>Max FAR</span><b>{zoning.max_far}</b></li>
        <li><span>Min lot</span><b>{zoning.min_lot_sqft.toLocaleString()} sqft</b></li>
        <li><span>Setbacks (F/S/R)</span><b>{zoning.setbacks.front}/{zoning.setbacks.side}/{zoning.setbacks.rear}</b></li>
      </ul>
      <div className="zoning-badges">
        <span className={`badge ${zoning.can_tear_down ? "ok" : "bad"}`}>Tear down {yes(zoning.can_tear_down)}</span>
        <span className={`badge ${zoning.str_allowed ? "ok" : "bad"}`}>STR {yes(zoning.str_allowed)}</span>
        <span className={`badge ${zoning.adu_allowed ? "ok" : "bad"}`}>ADU {yes(zoning.adu_allowed)}</span>
        <span className={`badge ${listing.historic ? "warn" : "ok"}`}>Historic {yes(listing.historic)}</span>
      </div>
      {zoning.notes && <p className="dim small">{zoning.notes}</p>}
    </div>
  );
}
