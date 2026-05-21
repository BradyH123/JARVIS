import { useState } from "react";

const initial = {
  city: "",
  state: "",
  min_price: "",
  max_price: "",
  min_beds: "",
  min_baths: "",
  min_sqft: "",
};

export default function SearchForm({ onSearch, searching }) {
  const [c, setC] = useState(initial);

  function update(k, v) {
    setC((prev) => ({ ...prev, [k]: v }));
  }

  function submit(e) {
    e.preventDefault();
    const cleaned = {};
    for (const [k, v] of Object.entries(c)) {
      if (v === "" || v === null) continue;
      cleaned[k] = ["min_price", "max_price", "min_beds", "min_baths", "min_sqft"].includes(k)
        ? Number(v)
        : v;
    }
    onSearch(cleaned);
  }

  return (
    <form className="card search-form" onSubmit={submit}>
      <h2>Search for properties</h2>
      <div className="grid">
        <label>City <input value={c.city} onChange={(e) => update("city", e.target.value)} placeholder="Austin" /></label>
        <label>State <input value={c.state} onChange={(e) => update("state", e.target.value)} placeholder="TX" maxLength={2} /></label>
        <label>Min price <input type="number" value={c.min_price} onChange={(e) => update("min_price", e.target.value)} placeholder="$" /></label>
        <label>Max price <input type="number" value={c.max_price} onChange={(e) => update("max_price", e.target.value)} placeholder="$" /></label>
        <label>Min beds <input type="number" value={c.min_beds} onChange={(e) => update("min_beds", e.target.value)} /></label>
        <label>Min baths <input type="number" value={c.min_baths} onChange={(e) => update("min_baths", e.target.value)} /></label>
        <label>Min sqft <input type="number" value={c.min_sqft} onChange={(e) => update("min_sqft", e.target.value)} /></label>
      </div>
      <button type="submit" disabled={searching} className="primary">
        {searching ? "Searching..." : "Find properties"}
      </button>
    </form>
  );
}
