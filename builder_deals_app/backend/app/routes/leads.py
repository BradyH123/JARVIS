from flask import Blueprint, request, jsonify

from ..services import data_sources

bp = Blueprint("leads", __name__)


@bp.post("/search")
def search():
    criteria = request.get_json(silent=True) or {}
    listings = data_sources.search(criteria)
    return jsonify({"count": len(listings), "results": listings})


@bp.get("/<listing_id>")
def detail(listing_id: str):
    l = data_sources.get_listing(listing_id)
    if not l:
        return jsonify({"error": "not found"}), 404
    return jsonify(l)
