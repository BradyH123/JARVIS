from flask import Blueprint, request, jsonify

from ..services import data_sources
from ..services.underwriter import Assumptions
from ..services.simulator import StrategyInputs, run_all

bp = Blueprint("underwriting", __name__)


@bp.post("/")
def underwrite():
    """Body shape:
    {
      "listing_id": "1001",          # optional — pre-fills purchase price + estimates
      "assumptions": { ...Assumptions fields... },
      "strategy_inputs": { ...StrategyInputs fields... }
    }
    """
    body = request.get_json(silent=True) or {}
    a_in = dict(body.get("assumptions") or {})
    s_in = dict(body.get("strategy_inputs") or {})

    listing = None
    if body.get("listing_id"):
        listing = data_sources.get_listing(body["listing_id"])
        if not listing:
            return jsonify({"error": "listing not found"}), 404
        # Pre-fill from listing where caller didn't override.
        a_in.setdefault("purchase_price", listing["price"])
        s_in.setdefault("arv", listing.get("est_arv"))
        s_in.setdefault("monthly_rent", listing.get("est_rent"))
        s_in.setdefault("str_adr", listing.get("est_str_adr"))
        s_in.setdefault("str_occupancy", listing.get("est_str_occupancy"))

    if "purchase_price" not in a_in:
        return jsonify({"error": "purchase_price required"}), 400

    try:
        a = Assumptions(**a_in)
        s = StrategyInputs(**s_in)
    except TypeError as e:
        return jsonify({"error": f"bad field: {e}"}), 400

    result = run_all(a, s)
    if listing:
        result["listing"] = listing
    return jsonify(result)
