"""Exit-strategy simulation.

Every strategy receives the same CostStack and produces a uniform result so
the UI can rank them side-by-side. Add new strategies by appending to
STRATEGIES — each is just a function that returns an ExitResult.
"""
from dataclasses import dataclass, asdict
from typing import Callable, Optional

from .underwriter import Assumptions, CostStack, build_cost_stack


@dataclass
class StrategyInputs:
    """Per-strategy revenue assumptions. All fields optional — only the
    ones a given strategy needs must be set."""
    arv: Optional[float] = None                 # flip / sellout value
    monthly_rent: Optional[float] = None        # long-term rental
    str_adr: Optional[float] = None             # short-term avg daily rate
    str_occupancy: Optional[float] = None       # 0..1
    str_mgmt_pct: Optional[float] = 0.20
    rental_opex_pct: Optional[float] = 0.35     # of gross rent
    exit_cap_rate: Optional[float] = 0.065      # for stabilized rental sale
    dev_units: Optional[int] = None             # number of new units
    dev_price_per_unit: Optional[float] = None  # sellout per unit
    adu_rent_monthly: Optional[float] = None    # ADU income on top of main
    hold_years: Optional[int] = 5               # for long-term hold
    appreciation_rate: Optional[float] = 0.03   # annual


@dataclass
class ExitResult:
    strategy: str
    gross_revenue: float
    net_profit: float
    total_cash_in: float
    roi_pct: float                  # profit / cash in
    annualized_roi_pct: float
    cash_on_cash_pct: Optional[float]   # year-1 yield for hold strategies
    timeline_months: int
    notes: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


def _sale_proceeds(sale_price: float, a: Assumptions) -> float:
    return sale_price * (1 - a.sale_commission_pct - a.sale_closing_pct)


def _annualize(roi_pct: float, months: int) -> float:
    if months <= 0:
        return 0.0
    return roi_pct * (12.0 / months)


def simulate_flip(a: Assumptions, s: StrategyInputs, c: CostStack) -> ExitResult:
    arv = s.arv or 0.0
    proceeds = _sale_proceeds(arv, a)
    profit = proceeds - c.total_project_cost
    roi = (profit / c.total_cash_in * 100) if c.total_cash_in else 0.0
    return ExitResult(
        strategy="Flip",
        gross_revenue=round(arv, 2),
        net_profit=round(profit, 2),
        total_cash_in=c.total_cash_in,
        roi_pct=round(roi, 2),
        annualized_roi_pct=round(_annualize(roi, a.holding_months), 2),
        cash_on_cash_pct=None,
        timeline_months=a.holding_months,
        notes="Sell after rehab. Sensitive to ARV and commission.",
    )


def simulate_rental(a: Assumptions, s: StrategyInputs, c: CostStack) -> ExitResult:
    rent = s.monthly_rent or 0.0
    annual_gross = rent * 12
    annual_noi = annual_gross * (1 - (s.rental_opex_pct or 0.35))
    sale_price = (annual_noi / s.exit_cap_rate) if s.exit_cap_rate else 0.0
    proceeds = _sale_proceeds(sale_price, a)

    # Cash flow during hold (after stabilization), simple debt service approx.
    annual_debt_service = c.loan_amount * a.loan_rate
    annual_cash_flow = annual_noi - annual_debt_service
    coc = (annual_cash_flow / c.total_cash_in * 100) if c.total_cash_in else 0.0

    profit = proceeds - c.total_project_cost
    roi = (profit / c.total_cash_in * 100) if c.total_cash_in else 0.0
    return ExitResult(
        strategy="Rental + sale at stabilized cap",
        gross_revenue=round(annual_gross, 2),
        net_profit=round(profit, 2),
        total_cash_in=c.total_cash_in,
        roi_pct=round(roi, 2),
        annualized_roi_pct=round(_annualize(roi, a.holding_months), 2),
        cash_on_cash_pct=round(coc, 2),
        timeline_months=a.holding_months,
        notes=f"Stabilized NOI ${annual_noi:,.0f}/yr capped at {s.exit_cap_rate:.2%}.",
    )


def simulate_str(a: Assumptions, s: StrategyInputs, c: CostStack) -> ExitResult:
    adr = s.str_adr or 0.0
    occ = s.str_occupancy or 0.0
    mgmt = s.str_mgmt_pct or 0.0
    annual_gross = adr * 365 * occ
    annual_opex = annual_gross * ((s.rental_opex_pct or 0.30) + mgmt)
    annual_noi = annual_gross - annual_opex
    annual_debt_service = c.loan_amount * a.loan_rate
    annual_cash_flow = annual_noi - annual_debt_service
    coc = (annual_cash_flow / c.total_cash_in * 100) if c.total_cash_in else 0.0

    # For STR exit, value still typically cap-rate-based on stabilized NOI.
    sale_price = (annual_noi / s.exit_cap_rate) if s.exit_cap_rate else 0.0
    proceeds = _sale_proceeds(sale_price, a)
    profit = proceeds - c.total_project_cost
    roi = (profit / c.total_cash_in * 100) if c.total_cash_in else 0.0
    return ExitResult(
        strategy="Short-term rental (Airbnb/VRBO)",
        gross_revenue=round(annual_gross, 2),
        net_profit=round(profit, 2),
        total_cash_in=c.total_cash_in,
        roi_pct=round(roi, 2),
        annualized_roi_pct=round(_annualize(roi, a.holding_months), 2),
        cash_on_cash_pct=round(coc, 2),
        timeline_months=a.holding_months,
        notes=f"ADR ${adr:.0f} × {occ:.0%} occupancy. Verify STR is permitted.",
    )


def simulate_development(a: Assumptions, s: StrategyInputs, c: CostStack) -> ExitResult:
    units = s.dev_units or 0
    per = s.dev_price_per_unit or 0.0
    gross = units * per
    proceeds = _sale_proceeds(gross, a)
    profit = proceeds - c.total_project_cost
    roi = (profit / c.total_cash_in * 100) if c.total_cash_in else 0.0
    return ExitResult(
        strategy=f"Develop {units} unit{'s' if units != 1 else ''} & sell",
        gross_revenue=round(gross, 2),
        net_profit=round(profit, 2),
        total_cash_in=c.total_cash_in,
        roi_pct=round(roi, 2),
        annualized_roi_pct=round(_annualize(roi, a.holding_months), 2),
        cash_on_cash_pct=None,
        timeline_months=a.holding_months,
        notes="Requires zoning to allow unit count; check setbacks and FAR.",
    )


def simulate_adu(a: Assumptions, s: StrategyInputs, c: CostStack) -> ExitResult:
    # Main house rental + ADU rental, sale at cap.
    main_rent = (s.monthly_rent or 0.0) * 12
    adu_rent = (s.adu_rent_monthly or 0.0) * 12
    annual_gross = main_rent + adu_rent
    annual_noi = annual_gross * (1 - (s.rental_opex_pct or 0.35))
    sale_price = (annual_noi / s.exit_cap_rate) if s.exit_cap_rate else 0.0
    proceeds = _sale_proceeds(sale_price, a)
    profit = proceeds - c.total_project_cost
    roi = (profit / c.total_cash_in * 100) if c.total_cash_in else 0.0
    coc_cf = annual_noi - c.loan_amount * a.loan_rate
    coc = (coc_cf / c.total_cash_in * 100) if c.total_cash_in else 0.0
    return ExitResult(
        strategy="Add ADU + rent both",
        gross_revenue=round(annual_gross, 2),
        net_profit=round(profit, 2),
        total_cash_in=c.total_cash_in,
        roi_pct=round(roi, 2),
        annualized_roi_pct=round(_annualize(roi, a.holding_months), 2),
        cash_on_cash_pct=round(coc, 2),
        timeline_months=a.holding_months,
        notes="ADU income stacks on top of main unit; confirm ADU is allowed.",
    )


def simulate_long_term_hold(a: Assumptions, s: StrategyInputs, c: CostStack) -> ExitResult:
    years = s.hold_years or 5
    months = years * 12
    rent = s.monthly_rent or 0.0
    annual_gross = rent * 12
    annual_noi = annual_gross * (1 - (s.rental_opex_pct or 0.35))
    annual_debt_service = c.loan_amount * a.loan_rate
    annual_cash_flow = annual_noi - annual_debt_service
    cumulative_cash_flow = annual_cash_flow * years

    appreciated = (s.arv or a.purchase_price) * ((1 + (s.appreciation_rate or 0.03)) ** years)
    proceeds = _sale_proceeds(appreciated, a)
    profit = proceeds - c.total_project_cost + cumulative_cash_flow
    roi = (profit / c.total_cash_in * 100) if c.total_cash_in else 0.0
    coc = (annual_cash_flow / c.total_cash_in * 100) if c.total_cash_in else 0.0
    return ExitResult(
        strategy=f"Hold {years} yrs + sell appreciated",
        gross_revenue=round(annual_gross * years, 2),
        net_profit=round(profit, 2),
        total_cash_in=c.total_cash_in,
        roi_pct=round(roi, 2),
        annualized_roi_pct=round(_annualize(roi, months), 2),
        cash_on_cash_pct=round(coc, 2),
        timeline_months=months,
        notes=f"{(s.appreciation_rate or 0.03):.1%} annual appreciation assumed.",
    )


STRATEGIES: dict[str, Callable[[Assumptions, StrategyInputs, CostStack], ExitResult]] = {
    "flip": simulate_flip,
    "rental": simulate_rental,
    "str": simulate_str,
    "development": simulate_development,
    "adu": simulate_adu,
    "long_term_hold": simulate_long_term_hold,
}


def run_all(a: Assumptions, s: StrategyInputs) -> dict:
    """Run every applicable strategy and return ranked results."""
    cost_stack = build_cost_stack(a)
    results: list[ExitResult] = []

    if s.arv:
        results.append(simulate_flip(a, s, cost_stack))
    if s.monthly_rent:
        results.append(simulate_rental(a, s, cost_stack))
        results.append(simulate_long_term_hold(a, s, cost_stack))
    if s.str_adr and s.str_occupancy:
        results.append(simulate_str(a, s, cost_stack))
    if s.dev_units and s.dev_price_per_unit:
        results.append(simulate_development(a, s, cost_stack))
    if s.adu_rent_monthly and s.monthly_rent:
        results.append(simulate_adu(a, s, cost_stack))

    results.sort(key=lambda r: r.net_profit, reverse=True)
    return {
        "cost_stack": cost_stack.to_dict(),
        "strategies": [r.to_dict() for r in results],
        "best_strategy": results[0].strategy if results else None,
    }
