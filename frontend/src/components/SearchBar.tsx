"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, TokenSearchResult } from "@/lib/api";

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const HISTORY_KEY = "paper_trade_search_history";
const MAX_HISTORY = 8;

function extractAddressFromInput(raw: string): string | null {
  const trimmed = raw.trim();

  if (SOLANA_ADDRESS_RE.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/").filter(Boolean);
    for (const part of parts) {
      const clean = part.split("?")[0].split("#")[0];
      if (SOLANA_ADDRESS_RE.test(clean)) return clean;
    }
  } catch {
    const parts = trimmed.split(/[\/\s?#&=]+/);
    for (const part of parts) {
      if (SOLANA_ADDRESS_RE.test(part)) return part;
    }
  }

  return null;
}

function loadHistory(): TokenSearchResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistHistory(items: TokenSearchResult[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  } catch {}
}

export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [history, setHistory] = useState<TokenSearchResult[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const searchQuery = query.trim();
  const detectedAddress = extractAddressFromInput(searchQuery);

  const { data, isLoading } = useQuery({
    queryKey: ["search", detectedAddress || searchQuery],
    queryFn: () => api.market.search(detectedAddress || searchQuery),
    enabled: (detectedAddress || searchQuery).length >= 2 && !navigating,
    staleTime: 10000,
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const saveToHistory = useCallback((token: TokenSearchResult) => {
    setHistory((prev) => {
      const deduped = prev.filter((h) => h.mint !== token.mint);
      const updated = [token, ...deduped].slice(0, MAX_HISTORY);
      persistHistory(updated);
      return updated;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    try { localStorage.removeItem(HISTORY_KEY); } catch {}
  }, []);

  const navigateToToken = useCallback((mint: string, token?: TokenSearchResult) => {
    if (token) saveToHistory(token);
    setNavigating(true);
    setQuery("");
    setOpen(false);
    router.push(`/token/${mint}`);
    setTimeout(() => setNavigating(false), 500);
  }, [router, saveToHistory]);

  function selectToken(token: TokenSearchResult) {
    navigateToToken(token.mint, token);
  }

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    const address = extractAddressFromInput(pasted);
    if (address) {
      e.preventDefault();
      saveToHistory({ mint: address, symbol: address.slice(0, 6), name: "Direct Address" });
      navigateToToken(address);
    }
  }, [navigateToToken, saveToHistory]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (detectedAddress) {
        saveToHistory({ mint: detectedAddress, symbol: detectedAddress.slice(0, 6), name: "Direct Address" });
        navigateToToken(detectedAddress);
      } else if (data?.results && data.results.length > 0) {
        selectToken(data.results[0]);
      }
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedAddress, data, navigateToToken, saveToHistory]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setOpen(true);
    setNavigating(false);
  }, []);

  const showResults = open && !navigating && data?.results && data.results.length > 0 && searchQuery.length >= 2;
  const showNoResults = open && !navigating && !isLoading && searchQuery.length >= 2 && data?.results && data.results.length === 0 && !detectedAddress;
  const showHistory = open && !navigating && searchQuery.length < 2 && history.length > 0;

  return (
    <div ref={ref} className="relative w-full">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder="Search token or paste address..."
          className="w-full rounded-lg border border-white/10 bg-white/[0.03] pl-9 pr-4 py-2 text-[12px] text-white placeholder:text-white/30 outline-none focus:border-[#39FF14]/30 focus:ring-1 focus:ring-[#39FF14]/10 transition-all"
          aria-label="Search tokens"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="search-listbox"
        />
        {isLoading && searchQuery.length >= 2 && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-[#39FF14] rounded-full animate-spin" />
          </div>
        )}
      </div>

      {showHistory && (
        <div className="absolute top-full left-0 right-0 mt-1.5 rounded-xl border border-white/10 bg-black/80 backdrop-blur shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.06]">
            <span className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Recent Searches</span>
            <button
              onClick={clearHistory}
              className="text-[9px] text-white/40 hover:text-red-400 transition-colors font-semibold"
            >
              Clear
            </button>
          </div>
          <ul role="listbox">
            {history.map((token) => (
              <li key={token.mint}>
                <button
                  onClick={() => selectToken(token)}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04] transition-colors"
                  role="option"
                  aria-selected={false}
                >
                  {token.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={token.image}
                      alt={token.symbol}
                      width={24}
                      height={24}
                      className="rounded-lg h-6 w-6 object-cover ring-1 ring-white/10"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  ) : (
                    <div className="h-6 w-6 rounded-lg bg-white/[0.06] flex items-center justify-center text-[9px] font-bold text-white/50 ring-1 ring-white/10">
                      {token.symbol?.charAt(0)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[11px]">{token.symbol}</span>
                      <span className="text-[10px] text-white/50 truncate">{token.name}</span>
                    </div>
                    <span className="text-[9px] text-white/40 font-mono truncate block">
                      {token.mint.slice(0, 8)}...{token.mint.slice(-4)}
                    </span>
                  </div>
                  <svg className="w-3 h-3 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showResults && (
        <ul id="search-listbox" className="absolute top-full left-0 right-0 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-white/10 bg-black/80 backdrop-blur shadow-2xl z-50" role="listbox">
          {data.results.map((token) => (
            <li key={token.mint}>
              <button
                onClick={() => selectToken(token)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-white/[0.04] transition-colors"
                role="option"
                aria-selected={false}
              >
                {token.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={token.image}
                    alt={token.symbol}
                    width={28}
                    height={28}
                    className="rounded-lg h-7 w-7 object-cover ring-1 ring-white/10"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#39FF14]/20 to-[#4fc3f7]/10 flex items-center justify-center text-[10px] font-bold text-[#39FF14]/60 ring-1 ring-white/10 flex-shrink-0">
                    {token.symbol?.charAt(0) || "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[12px]">{token.symbol}</span>
                    {token.name && token.name !== token.symbol && (
                      <span className="text-[10px] text-white/50 truncate">{token.name}</span>
                    )}
                  </div>
                  <span className="text-[10px] text-white/40 font-mono truncate block">
                    {token.mint.slice(0, 8)}...{token.mint.slice(-4)}
                  </span>
                </div>
                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                  {token.price !== undefined && token.price > 0 && (
                    <span className="text-[11px] font-mono text-[#39FF14] font-semibold">
                      ${token.price < 0.01 ? token.price.toFixed(8) : token.price.toFixed(4)}
                    </span>
                  )}
                  {token.marketCap !== undefined && token.marketCap > 0 && (
                    <span className="text-[9px] font-mono text-white/40">
                      MC: ${token.marketCap >= 1e6 ? (token.marketCap / 1e6).toFixed(1) + "M" : token.marketCap >= 1e3 ? (token.marketCap / 1e3).toFixed(1) + "K" : token.marketCap.toFixed(0)}
                    </span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {showNoResults && (
        <div className="absolute top-full left-0 right-0 mt-1.5 rounded-xl border border-white/10 bg-black/80 backdrop-blur shadow-2xl z-50 px-4 py-6 text-center">
          <span className="text-[11px] text-white/40">No tokens found for &ldquo;{searchQuery}&rdquo;</span>
        </div>
      )}
    </div>
  );
}
