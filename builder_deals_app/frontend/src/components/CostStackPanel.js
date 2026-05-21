const fmt = (n) => "$" + Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

export default function CostStackPanel({ stack }) {
  const rows = [
    ["Acquisition", stack.acquisition],
    ["Closing", stack.closing],
    ["Rehab", stack.rehab],
    ["Construction", stack.construction],
    ["Soft costs", stack.soft_costs],
    ["Contingency", stack.contingency],
    ["Holding (tax/ins/util)", stack.holding],
    ["Financing interest", stack.financing_interest],
  ];
  return (
    <div className="card">
      <h3>Cost breakdown</h3>
      <table className="cost-table">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}><td>{k}</td><td className="num">{fmt(v)}</td></tr>
          ))}
          <tr className="total"><td>Total project cost</td><td className="num">{fmt(stack.total_project_cost)}</td></tr>
          <tr><td>Loan ({Math.round((stack.loan_amount / (stack.acquisition + stack.rehab + stack.construction)) * 100) || 0}% LTV)</td><td className="num">{fmt(stack.loan_amount)}</td></tr>
          <tr className="cash"><td>Cash required</td><td className="num">{fmt(stack.total_cash_in)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
