"""Pluggable property-lead source.

Default backend is `mock` (bundled JSON dataset). To connect a real source,
set LEAD_SOURCE in .env to `rapidapi_zillow` or `rentcast` and provide the
matching API key. The two HTTP backends are stubbed with the right shape —
fill in the request/response mapping when you have a key.
"""
import json
import os
from pathlib import Path
from typing import Optional

import requests

DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


def _load_mock_listings() -> list[dict]:
    with open(DATA_DIR / "listings.json") as f:
        return json.load(f)


def _filter(listings: list[dict], criteria: dict) -> list[dict]:
    def ok(l):
        if criteria.get("city") and criteria["city"].lower() not in l["city"].lower():
            return False
        if criteria.get("state") and criteria["state"].upper() != l["state"].upper():
            return False
        if criteria.get("min_price") and l["price"] < criteria["min_price"]:
            return False
        if criteria.get("max_price") and l["price"] > criteria["max_price"]:
            return False
        if criteria.get("min_beds") and l["beds"] < criteria["min_beds"]:
            return False
        if criteria.get("min_baths") and l["baths"] < criteria["min_baths"]:
            return False
        if criteria.get("min_sqft") and l["sqft"] < criteria["min_sqft"]:
            return False
        if criteria.get("property_type") and l["property_type"] != criteria["property_type"]:
            return False
        return True
    return [l for l in listings if ok(l)]


def search_mock(criteria: dict) -> list[dict]:
    return _filter(_load_mock_listings(), criteria)


def search_rapidapi_zillow(criteria: dict) -> list[dict]:
    """Stub for RapidAPI Zillow integration.

    Most RapidAPI Zillow wrappers accept a `location` string + filters.
    Replace the request body and response mapping for the specific endpoint
    you subscribe to (e.g. zillow-com1.p.rapidapi.com /propertyExtendedSearch).
    """
    key = os.getenv("RAPIDAPI_KEY")
    host = os.getenv("RAPIDAPI_ZILLOW_HOST", "zillow-com1.p.rapidapi.com")
    if not key:
        raise RuntimeError("RAPIDAPI_KEY not set; switch LEAD_SOURCE=mock or add a key.")

    location = f"{criteria.get('city','')}, {criteria.get('state','')}".strip(", ")
    params = {"location": location}
    if criteria.get("max_price"):
        params["maxPrice"] = criteria["max_price"]
    if criteria.get("min_price"):
        params["minPrice"] = criteria["min_price"]

    r = requests.get(
        f"https://{host}/propertyExtendedSearch",
        params=params,
        headers={"X-RapidAPI-Key": key, "X-RapidAPI-Host": host},
        timeout=15,
    )
    r.raise_for_status()
    raw = r.json().get("props", [])
    return [
        {
            "id": str(p.get("zpid")),
            "address": p.get("address"),
            "city": p.get("city"),
            "state": p.get("state"),
            "zip": p.get("zipcode"),
            "price": p.get("price") or 0,
            "beds": p.get("bedrooms") or 0,
            "baths": p.get("bathrooms") or 0,
            "sqft": p.get("livingArea") or 0,
            "lot_sqft": p.get("lotAreaValue") or 0,
            "year_built": p.get("yearBuilt") or 0,
            "property_type": p.get("propertyType") or "Single Family",
            "listing_url": p.get("detailUrl"),
            "photo": p.get("imgSrc"),
        }
        for p in raw
    ]


def search_rentcast(criteria: dict) -> list[dict]:
    """Stub for RentCast (https://www.rentcast.io/api). Has both listing
    and rent-comp endpoints which is convenient for this app."""
    key = os.getenv("RENTCAST_API_KEY")
    if not key:
        raise RuntimeError("RENTCAST_API_KEY not set; switch LEAD_SOURCE=mock or add a key.")
    # Endpoint shape: /v1/listings/sale?city=...&state=...&limit=50
    params = {
        "city": criteria.get("city"),
        "state": criteria.get("state"),
        "limit": criteria.get("limit", 50),
    }
    if criteria.get("max_price"):
        params["maxPrice"] = criteria["max_price"]
    r = requests.get(
        "https://api.rentcast.io/v1/listings/sale",
        params={k: v for k, v in params.items() if v is not None},
        headers={"X-Api-Key": key, "Accept": "application/json"},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()  # adjust mapping once the field names are confirmed


def search(criteria: dict) -> list[dict]:
    source = os.getenv("LEAD_SOURCE", "mock").lower()
    if source == "rapidapi_zillow":
        return search_rapidapi_zillow(criteria)
    if source == "rentcast":
        return search_rentcast(criteria)
    return search_mock(criteria)


def get_listing(listing_id: str) -> Optional[dict]:
    # For mock + cached results we read from the JSON dataset directly.
    for l in _load_mock_listings():
        if str(l["id"]) == str(listing_id):
            return l
    return None
