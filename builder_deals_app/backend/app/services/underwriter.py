"""Core financial engine: acquisition, construction, and holding cost math.

A "deal" is a property + a set of assumptions. The underwriter produces a
cost stack that every exit strategy then plugs into.
"""
from dataclasses import dataclass, asdict, field
from typing import Optional


@dataclass
class Assumptions:
    purchase_price: float
    closing_cost_pct: float = 0.02
    rehab_cost: float = 0.0
    construction_cost: float = 0.0      # ground-up / new units
    soft_cost_pct: float = 0.15         # architect, permits, engineering on top of hard cost
    contingency_pct: float = 0.10       # of (rehab + construction)
    holding_months: int = 9
    loan_ltv: float = 0.70
    loan_rate: float = 0.085            # annual
    property_tax_annual: float = 0.0
    insurance_annual: float = 0.0
    utilities_monthly: float = 0.0
    sale_commission_pct: float = 0.055
    sale_closing_pct: float = 0.01


@dataclass
class CostStack:
    acquisition: float
    closing: float
    rehab: float
    construction: float
    soft_costs: float
    contingency: float
    holding: float
    financing_interest: float
    loan_amount: float
    equity_required: float
    total_project_cost: float           # all-in (cash + financed)
    total_cash_in: float                # equity actually needed

    def to_dict(self) -> dict:
        return asdict(self)


def build_cost_stack(a: Assumptions) -> CostStack:
    acquisition = a.purchase_price
    closing = acquisition * a.closing_cost_pct
    hard_build = a.rehab_cost + a.construction_cost
    soft_costs = hard_build * a.soft_cost_pct
    contingency = hard_build * a.contingency_pct

    # Holding: property tax + insurance + utilities over the hold period
    holding = (
        (a.property_tax_annual / 12.0) * a.holding_months
        + (a.insurance_annual / 12.0) * a.holding_months
        + a.utilities_monthly * a.holding_months
    )

    # Loan sized against acquisition + hard build (typical construction loan).
    financed_basis = acquisition + hard_build
    loan_amount = financed_basis * a.loan_ltv
    # Simple interest approximation over the hold period — fine for a sim.
    financing_interest = loan_amount * a.loan_rate * (a.holding_months / 12.0)

    total_project_cost = (
        acquisition + closing + hard_build + soft_costs + contingency
        + holding + financing_interest
    )
    equity_required = total_project_cost - loan_amount
    total_cash_in = equity_required

    return CostStack(
        acquisition=round(acquisition, 2),
        closing=round(closing, 2),
        rehab=round(a.rehab_cost, 2),
        construction=round(a.construction_cost, 2),
        soft_costs=round(soft_costs, 2),
        contingency=round(contingency, 2),
        holding=round(holding, 2),
        financing_interest=round(financing_interest, 2),
        loan_amount=round(loan_amount, 2),
        equity_required=round(equity_required, 2),
        total_project_cost=round(total_project_cost, 2),
        total_cash_in=round(total_cash_in, 2),
    )
