"""Saved deals — JSON file persistence per the chosen storage option."""
import json
import time
import uuid
from pathlib import Path

from flask import Blueprint, jsonify, request

bp = Blueprint("deals", __name__)

STORE = Path(__file__).resolve().parent.parent.parent / "storage" / "deals.json"


def _read() -> list[dict]:
    if not STORE.exists():
        return []
    with open(STORE) as f:
        return json.load(f)


def _write(deals: list[dict]) -> None:
    STORE.parent.mkdir(parents=True, exist_ok=True)
    with open(STORE, "w") as f:
        json.dump(deals, f, indent=2)


@bp.get("/")
def list_deals():
    return jsonify(_read())


@bp.post("/")
def save_deal():
    body = request.get_json(silent=True) or {}
    deal = {
        "id": str(uuid.uuid4()),
        "saved_at": int(time.time()),
        "label": body.get("label") or "Untitled deal",
        "listing": body.get("listing"),
        "assumptions": body.get("assumptions"),
        "strategy_inputs": body.get("strategy_inputs"),
        "result": body.get("result"),
    }
    deals = _read()
    deals.append(deal)
    _write(deals)
    return jsonify(deal), 201


@bp.delete("/<deal_id>")
def delete_deal(deal_id: str):
    deals = _read()
    remaining = [d for d in deals if d["id"] != deal_id]
    _write(remaining)
    return jsonify({"deleted": len(deals) - len(remaining)})
