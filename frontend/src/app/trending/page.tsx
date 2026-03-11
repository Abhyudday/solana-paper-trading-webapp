"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, TokenInfo } from "@/lib/api";
import { formatCompact, formatPrice, shortenAddress } from "@/lib/format";
import Link from "next/link";

type SortKey = "default" | "mcap" | "volume" | "liquidity" | "price";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "default", label: "Trending" },
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

  const isTop3 = rank <= 3;

  return (
    <Link
      href={`/token/${token.mint}`}
      className="dex-row flex items-center gap-3 px-4 py-2.5 border-b border-border/30 group"
      onMouseEnter={handlePrefetch}
    >
      {/* Rank */}
      <span className={`w-7 text-center text-[11px] font-bold ${isTop3 ? "text-accent-green text-glow-green" : "text-text-muted"}`}>
        #{rank}
      </span>

      {/* Token Avatar */}
      <div className="flex-shrink-0">
        {token.image && !imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={token.image}
            alt={token.symbol}
            className="h-8 w-8 rounded-lg object-cover bg-bg-tertiary ring-1 ring-border group-hover:ring-accent-green/30 transition-all"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-accent-green/20 to-accent-blue/10 flex items-center justify-center text-[11px] font-bold text-accent-green/60 ring-1 ring-border">
            {token.symbol?.charAt(0) || "?"}
          </div>
        )}
      </div>

      {/* Token Name & Symbol */}
      <div className="flex flex-col min-w-0 w-[140px]">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-[13px] text-text-primary truncate">{token.symbol}</span>
          {isTop3 && (
            <span className="text-[7px] px-1.5 py-0.5 rounded-md bg-accent-green/10 text-accent-green font-bold border border-accent-green/20 uppercase">Hot</span>
          )}
          {token.dexPaid && (
            <span className="text-[7px] px-1 py-0.5 rounded bg-accent-green/10 text-accent-green font-bold border border-accent-green/20 flex-shrink-0">{"\u2713"} DEX</span>
          )}
        </div>
        <span className="text-[10px] text-text-muted truncate">{token.name}</span>
      </div>

      {/* Market Cap */}
      <div className="flex flex-col items-end w-[90px]">
        <span className="text-[8px] text-text-muted uppercase tracking-wider">MCap</span>
        <span className="text-[12px] font-mono font-bold text-accent-green">{formatCompact(token.marketCap)}</span>
      </div>

      {/* Price */}
      <div className="flex flex-col items-end w-[90px]">
        <span className="text-[8px] text-text-muted uppercase tracking-wider">Price</span>
        <span className="text-[12px] font-mono font-medium text-text-primary">{formatPrice(token.price)}</span>
      </div>

      {/* Volume */}
      <div className="flex flex-col items-end w-[90px]">
        <span className="text-[8px] text-text-muted uppercase tracking-wider">24h Vol</span>
        <span className="text-[12px] font-mono font-medium text-text-secondary">{formatCompact(token.volume24h || 0)}</span>
      </div>

      {/* Liquidity */}
      <div className="flex flex-col items-end w-[90px]">
        <span className="text-[8px] text-text-muted uppercase tracking-wider">Liquidity</span>
        <span className="text-[12px] font-mono font-medium text-text-secondary">{formatCompact(token.liquidity)}</span>
      </div>

      {/* Address */}
      <div className="flex flex-col items-end w-[70px] hidden lg:flex">
        <span className="text-[8px] text-text-muted uppercase tracking-wider">Mint</span>
        <span className="text-[10px] font-mono text-text-muted group-hover:text-accent-blue transition-colors">{shortenAddress(token.mint, 4)}</span>
      </div>

      {/* Arrow */}
      <svg className="w-4 h-4 text-text-muted group-hover:text-accent-green transition-colors flex-shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </Link>
  );
}

export default function TrendingPage() {
  const [sort, setSort] = useState<SortKey>("default");
  const lastTokensRef = useRef<TokenInfo[]>([]);

  const { data: trendingData, isLoading } = useQuery({
    queryKey: ["trendingTokens"],
    queryFn: () => api.market.getTrendingTokens(),
    refetchInterval: 12_000,
    staleTime: 6_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const rawTokens = trendingData?.tokens || [];
  if (rawTokens.length > 0) lastTokensRef.current = rawTokens;
  const stableTokens = rawTokens.length > 0 ? rawTokens : lastTokensRef.current;
  const sorted = useMemo(() => sortTokens(stableTokens, sort), [stableTokens, sort]);

  return (
    <div className="pt-4 pb-6 page-enter">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-accent-orange/10 border border-accent-orange/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-accent-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-text-primary">Trending Tokens</h1>
            <p className="text-[11px] text-text-muted">Top tokens by volume surge and market activity</p>
          </div>
          <span className="text-[9px] text-text-muted font-mono bg-bg-tertiary/80 px-2 py-1 rounded-md border border-border/50 ml-1">
            {sorted.length} tokens
          </span>
        </div>

        {/* Sort controls */}
        <div className="flex items-center gap-0.5 bg-bg-card border border-border rounded-lg p-0.5">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSort(opt.key)}
              className={`px-3 py-1.5 rounded-md text-[10px] font-semibold transition-all ${
                sort === opt.key
                  ? "bg-accent-green/10 text-accent-green shadow-glow-sm"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-bg-card overflow-hidden">
        {/* Table Header */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-border bg-bg-secondary text-[8px] uppercase tracking-widest text-text-muted font-bold">
          <span className="w-7 text-center">#</span>
          <span className="w-8"></span>
          <span className="w-[140px]">Token</span>
          <span className="w-[90px] text-right">Market Cap</span>
          <span className="w-[90px] text-right">Price</span>
          <span className="w-[90px] text-right">24h Volume</span>
          <span className="w-[90px] text-right">Liquidity</span>
          <span className="w-[70px] text-right hidden lg:block">Mint</span>
          <span className="ml-auto w-4"></span>
        </div>

        {/* Rows */}
        {isLoading && sorted.length === 0 ? (
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/30">
              <div className="w-7 h-4 skeleton-shimmer rounded" />
              <div className="w-8 h-8 skeleton-shimmer rounded-lg" />
              <div className="w-[140px]">
                <div className="h-4 w-16 skeleton-shimmer rounded mb-1" />
                <div className="h-3 w-24 skeleton-shimmer rounded" />
              </div>
              <div className="w-[90px] h-4 skeleton-shimmer rounded ml-auto" />
              <div className="w-[90px] h-4 skeleton-shimmer rounded" />
              <div className="w-[90px] h-4 skeleton-shimmer rounded" />
              <div className="w-[90px] h-4 skeleton-shimmer rounded" />
            </div>
          ))
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-text-muted">
            <svg className="w-10 h-10 mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
            </svg>
            <span className="text-[11px]">No trending tokens found</span>
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
