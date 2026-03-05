"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, TokenSearchResult } from "@/lib/api";

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

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

export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  const navigateToToken = useCallback((mint: string) => {
    setNavigating(true);
    setQuery("");
    setOpen(false);
    router.push(`/token/${mint}`);
    setTimeout(() => setNavigating(false), 500);
  }, [router]);

  function selectToken(token: TokenSearchResult) {
    navigateToToken(token.mint);
  }

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text");
    const address = extractAddressFromInput(pasted);
    if (address) {
      e.preventDefault();
      navigateToToken(address);
    }
  }, [navigateToToken]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (detectedAddress) {
        navigateToToken(detectedAddress);
      } else if (data?.results && data.results.length > 0) {
        selectToken(data.results[0]);
      }
    }
    if (e.key === "Escape") {
      setOpen(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedAddress, data, navigateToToken]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setOpen(true);
    setNavigating(false);
  }, []);

  const showResults = open && !navigating && data?.results && data.results.length > 0;
  const showNoResults = open && !navigating && !isLoading && searchQuery.length >= 2 && data?.results && data.results.length === 0 && !detectedAddress;

  return (
    <div ref={ref} className="relative w-full">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => searchQuery.length >= 2 && setOpen(true)}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          placeholder="Search token or paste address..."
          className="w-full rounded-lg border border-border bg-bg-input pl-9 pr-4 py-2 text-[12px] text-text-primary placeholder:text-text-muted/60 outline-none focus:border-accent-green/30 focus:ring-1 focus:ring-accent-green/10 transition-all"
          aria-label="Search tokens"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls="search-listbox"
        />
        {isLoading && searchQuery.length >= 2 && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-3.5 h-3.5 border-2 border-text-muted/30 border-t-accent-green rounded-full animate-spin" />
          </div>
        )}
      </div>
      {showResults && (
        <ul id="search-listbox" className="absolute top-full left-0 right-0 mt-1.5 max-h-80 overflow-y-auto rounded-xl border border-border bg-bg-secondary shadow-2xl z-50" role="listbox">
          {data.results.map((token) => (
            <li key={token.mint}>
              <button
                onClick={() => selectToken(token)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-bg-hover transition-colors"
                role="option"
                aria-selected={false}
              >
                {token.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={token.image}
                    alt={token.symbol}
                    width={28}
                    height={28}
                    className="rounded-lg h-7 w-7 object-cover ring-1 ring-border"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[12px]">{token.symbol}</span>
                    <span className="text-[10px] text-text-muted truncate">{token.name}</span>
                  </div>
                  <span className="text-[10px] text-text-muted font-mono truncate block">
                    {token.mint.slice(0, 8)}...{token.mint.slice(-4)}
                  </span>
                </div>
                {token.price !== undefined && (
                  <span className="text-[11px] font-mono text-accent-green font-semibold">
                    ${token.price < 0.01 ? token.price.toFixed(8) : token.price.toFixed(4)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {showNoResults && (
        <div className="absolute top-full left-0 right-0 mt-1.5 rounded-xl border border-border bg-bg-secondary shadow-2xl z-50 px-4 py-6 text-center">
          <span className="text-[11px] text-text-muted">No tokens found for &ldquo;{searchQuery}&rdquo;</span>
        </div>
      )}
    </div>
  );
}
