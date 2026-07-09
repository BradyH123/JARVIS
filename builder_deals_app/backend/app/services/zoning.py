"""Zoning lookups. Real version would hit Regrid / Zoneomics / county GIS.
Mock version returns plausible info from the listing's city + property type."""
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def _load_zoning_rules() -> dict:
    with open(DATA_DIR / "zoning.json") as f:
        return json.load(f)


def lookup(listing: dict) -> dict:
    rules = _load_zoning_rules()
    key = f"{listing.get('city','').lower()}_{listing.get('state','').lower()}"
    base = rules.get(key) or rules.get("_default")

    # Stamp in property-specific flags from the listing where present.
    info = dict(base)
    info["address"] = f"{listing.get('address')}, {listing.get('city')}, {listing.get('state')}"
    info["historic"] = bool(listing.get("historic", False))
    info["can_tear_down"] = not info["historic"]
    return info
