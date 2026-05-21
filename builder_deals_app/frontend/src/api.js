const BASE = process.env.REACT_APP_API_BASE || "";

async function req(path, opts = {}) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export const api = {
  searchLeads: (criteria) =>
    req("/api/leads/search", { method: "POST", body: JSON.stringify(criteria) }),
  getZoning: (listingId) => req(`/api/zoning/${listingId}`),
  underwrite: (payload) =>
    req("/api/underwrite/", { method: "POST", body: JSON.stringify(payload) }),
  listDeals: () => req("/api/deals/"),
  saveDeal: (payload) =>
    req("/api/deals/", { method: "POST", body: JSON.stringify(payload) }),
  deleteDeal: (id) => req(`/api/deals/${id}`, { method: "DELETE" }),
};
