"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, TokenInfo } from "@/lib/api";
import { formatCompact, formatPrice, shortenAddress } from "@/lib/format";
import Link from "next/link";

type SortKey = "default" | "mcap" | "volume" | "liquidity" | "price";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "default", label: "Default" },
  { key: "mcap", label: "Market Cap" },
  { key: "volume", label: "Volume" },
  { key: "liquidity", label: "Liquidity" },
  { key: "price", label: "Price" },
];

function sortTokens(tokens: TokenInfo[], key: SortKey): TokenInfo[] {
  if (key === "default") return tokens;
  const sorted = [...tokens];
  switch (key) {
    case "mcap":
      return sorted.sort((a, b) => b.marketCap - a.marketCap);
    case "volume":
      return sorted.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
    case "liquidity":
      return sorted.sort((a, b) => b.liquidity - a.liquidity);
    case "price":
      return sorted.sort((a, b) => b.price - a.price);
    default:
      return sorted;
  }
}

function TrendingTokenRow({ token, rank }: { token: TokenInfo; rank: number }) {
  const queryClient = useQueryClient();
  const [imgError, setImgError] = useState(false);

  const handlePrefetch = useCallback(() => {
    queryClient.prefetchQuery({
      queryKey: ["token", token.mint],
      queryFn: () => api.market.getToken(token.mint),
      staleTime: 30000,
    });
    queryClient.prefetchQuery({
      queryKey: ["chart", token.mint, "15s"],
      queryFn: () => api.market.getChart(token.mint, "15s"),
      staleTime: 5000,
    });
  }, [queryClient, token.mint]);

  return (
    <Link
      href={`/token/${token.mint}`}
      className="flex items-center gap-4 px-4 py-3 border-b border-border/50 hover:bg-bg-card/80 transition-all group"
      onMouseEnter={handlePrefetch}
    >
      {/* Rank */}
      <span className={`w-8 text-center text-sm font-bold ${rank <= 3 ? "text-accent-orange" : "text-text-muted"}`}>
        {rank <= 3 ? "🔥" : `#${rank}`}
      </span>

      {/* Token Avatar */}
      <div className="flex-shrink-0">
        {token.image && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={token.image}
            alt={token.symbol}
            className="h-10 w-10 rounded-full object-cover bg-bg-tertiary ring-2 ring-border group-hover:ring-accent-green/30 transition-all"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-bg-tertiary to-bg-secondary flex items-center justify-center text-sm font-bold text-text-muted ring-2 ring-border group-hover:ring-accent-green/30 transition-all">
            {token.symbol?.charAt(0) || "?"}
          </div>
        )}
      </div>

      {/* Token Name & Symbol */}
      <div className="flex flex-col min-w-0 w-[160px]">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm text-text-primary truncate">{token.symbol}</span>
          {rank <= 3 && (
            <span className="text-[8px] px-1 py-0.5 rounded bg-accent-orange/15 text-accent-orange font-bold">HOT</span>
          )}
        </div>
        <span className="text-[11px] text-text-muted truncate">{token.name}</span>
      </div>

      {/* Market Cap - highlighted */}
      <div className="flex flex-col items-end w-[100px]">
        <span className="text-[9px] text-text-muted uppercase">MCap</span>
        <span className="text-sm font-mono font-bold text-accent-green">{formatCompact(token.marketCap)}</span>
      </div>

      {/* Price */}
      <div className="flex flex-col items-end w-[100px]">
        <span className="text-[9px] text-text-muted uppercase">Price</span>
        <span className="text-sm font-mono font-medium text-text-primary">{formatPrice(token.price)}</span>
      </div>

      {/* Volume */}
      <div className="flex flex-col items-end w-[100px]">
        <span className="text-[9px] text-text-muted uppercase">24h Vol</span>
        <span className="text-sm font-mono font-medium text-text-secondary">{formatCompact(token.volume24h || 0)}</span>
      </div>

      {/* Liquidity */}
      <div className="flex flex-col items-end w-[100px]">
        <span className="text-[9px] text-text-muted uppercase">Liquidity</span>
        <span className="text-sm font-mono font-medium text-text-secondary">{formatCompact(token.liquidity)}</span>
      </div>

      {/* Address */}
      <div className="flex flex-col items-end w-[80px] hidden lg:flex">
        <span className="text-[9px] text-text-muted uppercase">Mint</span>
        <span className="text-[10px] font-mono text-text-muted">{shortenAddress(token.mint, 4)}</span>
      </div>
    </Link>
  );
}

export default function TrendingPage() {
  const [sort, setSort] = useState<SortKey>("default");
  const lastTokensRef = useRef<TokenInfo[]>([]);

  const { data: trendingData, isLoading } = useQuery({
    queryKey: ["trendingTokens"],
    queryFn: () => api.market.getTrendingTokens(),
    refetchInterval: 5_000,
    staleTime: 3_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const rawTokens = trendingData?.tokens || [];
  if (rawTokens.length > 0) lastTokensRef.current = rawTokens;
  const stableTokens = rawTokens.length > 0 ? rawTokens : lastTokensRef.current;
  const sorted = useMemo(() => sortTokens(stableTokens, sort), [stableTokens, sort]);

  return (
    <div className="pt-4 pb-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-accent-orange/15 flex items-center justify-center">
            <span className="text-lg">🔥</span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-text-primary">Trending Tokens</h1>
            <p className="text-xs text-text-muted">Top tokens by volume surge and market activity</p>
          </div>
          <span className="text-[10px] text-text-muted font-mono bg-bg-tertiary px-2 py-1 rounded ml-2">
            {sorted.length} tokens
          </span>
        </div>

        {/* Sort controls */}
        <div className="flex items-center gap-1">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSort(opt.key)}
              className={`px-3 py-1.5 rounded text-[11px] font-medium transition-all ${
                sort === opt.key
                  ? "bg-accent-orange/15 text-accent-orange shadow-sm"
                  : "text-text-muted hover:text-text-secondary hover:bg-bg-tertiary/50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table Header */}
      <div className="rounded-lg border border-border bg-bg-card overflow-hidden">
        <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-bg-secondary text-[9px] uppercase tracking-wider text-text-muted font-semibold">
          <span className="w-8 text-center">#</span>
          <span className="w-10"></span>
          <span className="w-[160px]">Token</span>
          <span className="w-[100px] text-right">Market Cap</span>
          <span className="w-[100px] text-right">Price</span>
          <span className="w-[100px] text-right">24h Volume</span>
          <span className="w-[100px] text-right">Liquidity</span>
          <span className="w-[80px] text-right hidden lg:block">Mint</span>
        </div>

        {/* Rows */}
        {isLoading && sorted.length === 0 ? (
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-border/50 animate-pulse">
              <div className="w-8 h-4 bg-bg-tertiary rounded" />
              <div className="w-10 h-10 bg-bg-tertiary rounded-full" />
              <div className="w-[160px]">
                <div className="h-4 w-20 bg-bg-tertiary rounded mb-1" />
                <div className="h-3 w-28 bg-bg-tertiary rounded" />
              </div>
              <div className="w-[100px] h-4 bg-bg-tertiary rounded ml-auto" />
              <div className="w-[100px] h-4 bg-bg-tertiary rounded" />
              <div className="w-[100px] h-4 bg-bg-tertiary rounded" />
              <div className="w-[100px] h-4 bg-bg-tertiary rounded" />
            </div>
          ))
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <svg className="w-10 h-10 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
            </svg>
            <span className="text-xs">No trending tokens found</span>
          </div>
        ) : (
          sorted.map((token, i) => (
            <TrendingTokenRow key={token.mint} token={token} rank={i + 1} />
          ))
        )}
      </div>
    </div>
  );
}
