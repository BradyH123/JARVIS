function Field({ label, value, onChange, type = "number", step, suffix }) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-wrap">
        <input type={type} value={value ?? ""} step={step} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
        {suffix && <span className="suffix">{suffix}</span>}
      </div>
    </label>
  );
}

export default function AssumptionsForm({ assumptions, setAssumptions, strategy, setStrategy, onRecompute, loading }) {
  const a = assumptions, s = strategy;
  const u = (k, v) => setAssumptions({ ...a, [k]: v });
  const us = (k, v) => setStrategy({ ...s, [k]: v });

  return (
    <div className="card">
      <h3>Assumptions</h3>
      <h4>Costs</h4>
      <div className="form-grid">
        <Field label="Purchase price" value={a.purchase_price} onChange={(v) => u("purchase_price", v)} suffix="$" />
        <Field label="Closing %" value={a.closing_cost_pct} step="0.005" onChange={(v) => u("closing_cost_pct", v)} suffix="%" />
        <Field label="Rehab cost" value={a.rehab_cost} onChange={(v) => u("rehab_cost", v)} suffix="$" />
        <Field label="Construction" value={a.construction_cost} onChange={(v) => u("construction_cost", v)} suffix="$" />
        <Field label="Soft cost %" value={a.soft_cost_pct} step="0.01" onChange={(v) => u("soft_cost_pct", v)} suffix="%" />
        <Field label="Contingency %" value={a.contingency_pct} step="0.01" onChange={(v) => u("contingency_pct", v)} suffix="%" />
      </div>

      <h4>Financing & holding</h4>
      <div className="form-grid">
        <Field label="Holding months" value={a.holding_months} onChange={(v) => u("holding_months", v)} />
        <Field label="Loan LTV" value={a.loan_ltv} step="0.05" onChange={(v) => u("loan_ltv", v)} />
        <Field label="Loan rate" value={a.loan_rate} step="0.005" onChange={(v) => u("loan_rate", v)} suffix="%" />
        <Field label="Tax/yr" value={a.property_tax_annual} onChange={(v) => u("property_tax_annual", v)} suffix="$" />
        <Field label="Insurance/yr" value={a.insurance_annual} onChange={(v) => u("insurance_annual", v)} suffix="$" />
        <Field label="Utilities/mo" value={a.utilities_monthly} onChange={(v) => u("utilities_monthly", v)} suffix="$" />
      </div>

      <h4>Exit revenue assumptions</h4>
      <div className="form-grid">
        <Field label="ARV (flip)" value={s.arv} onChange={(v) => us("arv", v)} suffix="$" />
        <Field label="Rent/mo" value={s.monthly_rent} onChange={(v) => us("monthly_rent", v)} suffix="$" />
        <Field label="STR ADR" value={s.str_adr} onChange={(v) => us("str_adr", v)} suffix="$" />
        <Field label="STR occupancy" value={s.str_occupancy} step="0.05" onChange={(v) => us("str_occupancy", v)} />
        <Field label="Rental opex %" value={s.rental_opex_pct} step="0.01" onChange={(v) => us("rental_opex_pct", v)} suffix="%" />
        <Field label="Exit cap rate" value={s.exit_cap_rate} step="0.005" onChange={(v) => us("exit_cap_rate", v)} suffix="%" />
        <Field label="Hold years" value={s.hold_years} onChange={(v) => us("hold_years", v)} />
        <Field label="Appreciation" value={s.appreciation_rate} step="0.005" onChange={(v) => us("appreciation_rate", v)} suffix="%" />
        <Field label="Dev units" value={s.dev_units} onChange={(v) => us("dev_units", v)} />
        <Field label="Price/unit" value={s.dev_price_per_unit} onChange={(v) => us("dev_price_per_unit", v)} suffix="$" />
        <Field label="ADU rent/mo" value={s.adu_rent_monthly} onChange={(v) => us("adu_rent_monthly", v)} suffix="$" />
      </div>

      <button className="primary" onClick={onRecompute} disabled={loading}>
        {loading ? "Recomputing…" : "Run scenarios"}
      </button>
    </div>
  );
}
