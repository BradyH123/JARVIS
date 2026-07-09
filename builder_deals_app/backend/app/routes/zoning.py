from flask import Blueprint, jsonify

from ..services import data_sources, zoning

bp = Blueprint("zoning", __name__)


@bp.get("/<listing_id>")
def zoning_for_listing(listing_id: str):
    l = data_sources.get_listing(listing_id)
    if not l:
        return jsonify({"error": "listing not found"}), 404
    return jsonify(zoning.lookup(l))
