import { useEffect, useState } from "react";
import { api } from "./api";
import SearchForm from "./components/SearchForm";
import LeadsList from "./components/LeadsList";
import DealWorkspace from "./components/DealWorkspace";
import SavedDeals from "./components/SavedDeals";

export default function App() {
  const [view, setView] = useState("search"); // 'search' | 'saved'
  const [leads, setLeads] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null); // listing
  const [savedDeals, setSavedDeals] = useState([]);

  useEffect(() => {
    api.listDeals().then(setSavedDeals).catch(() => {});
  }, []);

  async function handleSearch(criteria) {
    setSearching(true);
    try {
      const res = await api.searchLeads(criteria);
      setLeads(res.results);
    } finally {
      setSearching(false);
    }
  }

  function handleAnalyze(listing) {
    setSelected(listing);
  }

  async function refreshSaved() {
    setSavedDeals(await api.listDeals());
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">⬡</span> Builder Deals
        </div>
        <nav>
          <button
            className={view === "search" ? "active" : ""}
            onClick={() => { setView("search"); setSelected(null); }}
          >
            Find deals
          </button>
          <button
            className={view === "saved" ? "active" : ""}
            onClick={() => { setView("saved"); setSelected(null); refreshSaved(); }}
          >
            Saved ({savedDeals.length})
          </button>
        </nav>
      </header>

      <main>
        {selected ? (
          <DealWorkspace
            listing={selected}
            onBack={() => setSelected(null)}
            onSaved={refreshSaved}
          />
        ) : view === "search" ? (
          <>
            <SearchForm onSearch={handleSearch} searching={searching} />
            <LeadsList leads={leads} onAnalyze={handleAnalyze} />
          </>
        ) : (
          <SavedDeals deals={savedDeals} onRefresh={refreshSaved} />
        )}
      </main>
    </div>
  );
}
