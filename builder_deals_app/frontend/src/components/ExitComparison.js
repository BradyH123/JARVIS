const fmt = (n) => "$" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
const pct = (n) => (n == null ? "—" : `${Number(n).toFixed(1)}%`);

export default function ExitComparison({ strategies, best }) {
  if (!strategies || strategies.length === 0) {
    return <div className="card">Enter exit-revenue assumptions to see scenarios.</div>;
  }
  return (
    <div className="card">
      <h3>Exit scenarios <span className="dim small">(ranked by net profit)</span></h3>
      <table className="exit-table">
        <thead>
          <tr>
            <th>Strategy</th>
            <th className="num">Net profit</th>
            <th className="num">ROI</th>
            <th className="num">Annualized</th>
            <th className="num">CoC</th>
            <th className="num">Timeline</th>
          </tr>
        </thead>
        <tbody>
          {strategies.map((r) => {
            const isBest = r.strategy === best;
            const profitClass = r.net_profit >= 0 ? "good" : "bad";
            return (
              <tr key={r.strategy} className={isBest ? "best" : ""}>
                <td>
                  {isBest && <span className="star">★</span>}
                  <div>{r.strategy}</div>
                  {r.notes && <div className="dim small">{r.notes}</div>}
                </td>
                <td className={`num ${profitClass}`}>{fmt(r.net_profit)}</td>
                <td className="num">{pct(r.roi_pct)}</td>
                <td className="num">{pct(r.annualized_roi_pct)}</td>
                <td className="num">{pct(r.cash_on_cash_pct)}</td>
                <td className="num">{r.timeline_months} mo</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
