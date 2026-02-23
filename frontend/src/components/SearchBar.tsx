"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, TokenSearchResult } from "@/lib/api";

export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ["search", query],
    queryFn: () => api.market.search(query),
    enabled: query.length >= 2,
    staleTime: 10000,
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectToken(token: TokenSearchResult) {
    setQuery("");
    setOpen(false);
    router.push(`/token/${token.mint}`);
  }

  return (
    <div ref={ref} className="relative w-full">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => query.length >= 2 && setOpen(true)}
        placeholder="Search token by name, symbol, or mint address..."
        className="w-full rounded-lg border border-border bg-bg-tertiary px-4 py-2 text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent-blue transition-colors"
        aria-label="Search tokens"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && data?.results && data.results.length > 0 && (
        <ul className="absolute top-full left-0 right-0 mt-1 max-h-80 overflow-y-auto rounded-lg border border-border bg-bg-secondary shadow-xl z-50" role="listbox">
          {data.results.map((token) => (
            <li key={token.mint}>
              <button
                onClick={() => selectToken(token)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-bg-tertiary transition-colors"
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
                    className="rounded-full h-7 w-7 object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{token.symbol}</span>
                    <span className="text-xs text-text-muted truncate">{token.name}</span>
                  </div>
                  <span className="text-xs text-text-muted font-mono truncate block">
                    {token.mint.slice(0, 8)}...{token.mint.slice(-4)}
                  </span>
                </div>
                {token.price !== undefined && (
                  <span className="text-sm font-mono text-text-secondary">
                    ${token.price < 0.01 ? token.price.toFixed(8) : token.price.toFixed(4)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
