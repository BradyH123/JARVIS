import { useEffect, useState } from "react";
import { api } from "../api";
import ZoningPanel from "./ZoningPanel";
import AssumptionsForm from "./AssumptionsForm";
import CostStackPanel from "./CostStackPanel";
import ExitComparison from "./ExitComparison";

const defaultAssumptions = (listing) => ({
  purchase_price: listing.price,
  closing_cost_pct: 0.02,
  rehab_cost: Math.round(listing.sqft * 60), // rough $60/sqft rehab default
  construction_cost: 0,
  soft_cost_pct: 0.15,
  contingency_pct: 0.10,
  holding_months: 9,
  loan_ltv: 0.70,
  loan_rate: 0.085,
  property_tax_annual: Math.round(listing.price * 0.018),
  insurance_annual: 1800,
  utilities_monthly: 250,
  sale_commission_pct: 0.055,
  sale_closing_pct: 0.01,
});

const defaultStrategy = (listing) => ({
  arv: listing.est_arv || Math.round(listing.price * 1.4),
  monthly_rent: listing.est_rent || Math.round(listing.sqft * 1.8),
  str_adr: listing.est_str_adr || 200,
  str_occupancy: listing.est_str_occupancy || 0.6,
  rental_opex_pct: 0.35,
  exit_cap_rate: 0.065,
  hold_years: 5,
  appreciation_rate: 0.03,
  dev_units: 0,
  dev_price_per_unit: 0,
  adu_rent_monthly: 0,
});

export default function DealWorkspace({ listing, onBack, onSaved }) {
  const [zoning, setZoning] = useState(null);
  const [assumptions, setAssumptions] = useState(defaultAssumptions(listing));
  const [strategy, setStrategy] = useState(defaultStrategy(listing));
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    api.getZoning(listing.id).then(setZoning).catch(() => {});
  }, [listing.id]);

  async function recompute() {
    setLoading(true);
    try {
      // strip zero/empty so they fall back to defaults
      const stripped = (obj) =>
        Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== "" && v !== null));
      const r = await api.underwrite({
        listing_id: listing.id,
        assumptions: stripped(assumptions),
        strategy_inputs: stripped(strategy),
      });
      setResult(r);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { recompute(); /* on mount */ // eslint-disable-next-line
  }, []);

  async function save() {
    if (!result) return;
    const label = window.prompt("Label for this deal:", listing.address) || listing.address;
    await api.saveDeal({
      label,
      listing,
      assumptions,
      strategy_inputs: strategy,
      result,
    });
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1800);
    onSaved && onSaved();
  }

  return (
    <div className="workspace">
      <div className="workspace-header">
        <button className="link" onClick={onBack}>← Back to leads</button>
        <div>
          <h2>{listing.address}</h2>
          <div className="dim">{listing.city}, {listing.state} {listing.zip} · ${listing.price.toLocaleString()} list</div>
        </div>
        <div className="actions">
          <button onClick={save} className="primary" disabled={!result}>
            {savedFlash ? "✓ Saved" : "Save deal"}
          </button>
        </div>
      </div>

      <div className="workspace-grid">
        <div className="col">
          <ZoningPanel zoning={zoning} listing={listing} />
          <AssumptionsForm
            assumptions={assumptions}
            setAssumptions={setAssumptions}
            strategy={strategy}
            setStrategy={setStrategy}
            onRecompute={recompute}
            loading={loading}
          />
        </div>
        <div className="col">
          {result ? (
            <>
              <CostStackPanel stack={result.cost_stack} />
              <ExitComparison strategies={result.strategies} best={result.best_strategy} />
            </>
          ) : (
            <div className="card">Computing…</div>
          )}
        </div>
      </div>
    </div>
  );
}
