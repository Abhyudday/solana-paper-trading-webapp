"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, TokenInfo } from "@/lib/api";
import { formatCompact, formatPrice, shortenAddress } from "@/lib/format";
import Link from "next/link";

type SortKey = "default" | "mcap" | "volume" | "liquidity" | "price";
type VolumePeriod = "5m" | "1h" | "6h" | "24h";
const VOLUME_PERIODS: VolumePeriod[] = ["5m", "1h", "6h", "24h"];

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

function estimateVolume(volume24h: number, period: VolumePeriod): number {
  if (period === "24h") return volume24h;
  const scaleMap: Record<string, number> = { "5m": 5 / 1440, "1h": 1 / 24, "6h": 6 / 24 };
  return volume24h * (scaleMap[period] || 1);
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
  const vol24 = token.volume24h || 0;

  return (
    <Link
      href={`/token/${token.mint}`}
      className="dex-row border-b border-white/[0.06] group block"
      onMouseEnter={handlePrefetch}
    >
      {/* ── Desktop row (hidden on small screens) ── */}
      <div className="hidden md:flex items-center gap-2 px-4 py-2.5">
        {/* Rank */}
        <span className={`w-6 text-center text-[11px] font-bold flex-shrink-0 ${isTop3 ? "text-accent-green text-glow-green" : "text-text-muted"}`}>
          #{rank}
        </span>

        {/* Token Avatar */}
        <div className="flex-shrink-0">
          {token.image && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={token.image}
              alt={token.symbol}
              className="h-8 w-8 rounded-lg object-cover bg-black/40 ring-1 ring-white/10 group-hover:ring-[#39FF14]/30 transition-all"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#39FF14]/20 to-[#4fc3f7]/10 flex items-center justify-center text-[11px] font-bold text-[#39FF14]/60 ring-1 ring-white/10">
              {token.symbol?.charAt(0) || "?"}
            </div>
          )}
        </div>

        {/* Token Name & Symbol */}
        <div className="flex flex-col min-w-0 w-[120px] flex-shrink-0">
          <div className="flex items-center gap-1">
            <span className="font-bold text-[13px] text-white truncate">{token.symbol}</span>
            {isTop3 && (
              <span className="text-[7px] px-1 py-0.5 rounded-md bg-accent-green/10 text-accent-green font-bold border border-accent-green/20 uppercase">Hot</span>
            )}
            {token.dexPaid && (
              <span className="text-[7px] px-1 py-0.5 rounded bg-accent-green/10 text-accent-green font-bold border border-accent-green/20 flex-shrink-0">{"\u2713"} DEX</span>
            )}
          </div>
          <span className="text-[10px] text-white/50 truncate">{token.name}</span>
        </div>

        {/* Market Cap */}
        <div className="flex flex-col items-end w-[80px] flex-shrink-0">
          <span className="text-[7px] text-text-muted uppercase tracking-wider">MCap</span>
          <span className="text-[12px] font-mono font-bold text-accent-green">{formatCompact(token.marketCap)}</span>
        </div>

        {/* Price */}
        <div className="flex flex-col items-end w-[90px] flex-shrink-0">
          <span className="text-[7px] text-text-muted uppercase tracking-wider">Price</span>
          <span className="text-[12px] font-mono font-medium text-text-primary">{formatPrice(token.price)}</span>
        </div>

        {/* Volumes — inline row, flex-1 fills remaining space */}
        <div className="flex items-center flex-1 min-w-0">
          {VOLUME_PERIODS.map((vp) => (
            <div key={vp} className="flex-1 text-center">
              <div className="text-[7px] text-text-muted uppercase tracking-wider">{vp}</div>
              <div className="text-[11px] font-mono font-medium text-text-secondary">{formatCompact(estimateVolume(vol24, vp))}</div>
            </div>
          ))}
        </div>

        {/* Liquidity */}
        <div className="flex flex-col items-end w-[80px] flex-shrink-0">
          <span className="text-[7px] text-text-muted uppercase tracking-wider">Liquidity</span>
          <span className="text-[12px] font-mono font-medium text-text-secondary">{formatCompact(token.liquidity)}</span>
        </div>

        {/* Address */}
        <div className="flex flex-col items-end w-[70px] flex-shrink-0 hidden lg:flex">
          <span className="text-[7px] text-text-muted uppercase tracking-wider">Mint</span>
          <span className="text-[10px] font-mono text-text-muted group-hover:text-accent-blue transition-colors">{shortenAddress(token.mint, 4)}</span>
        </div>

        {/* Arrow */}
        <svg className="w-4 h-4 text-text-muted group-hover:text-accent-green transition-colors flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      </div>

      {/* ── Mobile card (shown only on small screens) ── */}
      <div className="md:hidden px-3 py-3">
        <div className="flex items-center gap-2.5 mb-2">
          <span className={`text-[11px] font-bold ${isTop3 ? "text-accent-green" : "text-text-muted"}`}>#{rank}</span>
          {token.image && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={token.image} alt={token.symbol} className="h-7 w-7 rounded-lg object-cover bg-black/40 ring-1 ring-white/10" onError={() => setImgError(true)} />
          ) : (
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#39FF14]/20 to-[#4fc3f7]/10 flex items-center justify-center text-[10px] font-bold text-[#39FF14]/60 ring-1 ring-white/10">
              {token.symbol?.charAt(0) || "?"}
            </div>
          )}
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="font-bold text-[13px] text-white truncate">{token.symbol}</span>
              {isTop3 && <span className="text-[7px] px-1 py-0.5 rounded-md bg-accent-green/10 text-accent-green font-bold border border-accent-green/20">Hot</span>}
              {token.dexPaid && <span className="text-[7px] px-1 py-0.5 rounded bg-accent-green/10 text-accent-green font-bold border border-accent-green/20">{"\u2713"} DEX</span>}
            </div>
            <span className="text-[10px] text-white/50 truncate">{token.name}</span>
          </div>
          <svg className="w-4 h-4 text-text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>
        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <div className="text-[7px] text-text-muted uppercase">MCap</div>
            <div className="text-[11px] font-mono font-bold text-accent-green">{formatCompact(token.marketCap)}</div>
          </div>
          <div>
            <div className="text-[7px] text-text-muted uppercase">Price</div>
            <div className="text-[11px] font-mono font-medium text-text-primary">{formatPrice(token.price)}</div>
          </div>
          <div>
            <div className="text-[7px] text-text-muted uppercase">24h Vol</div>
            <div className="text-[11px] font-mono font-medium text-text-secondary">{formatCompact(vol24)}</div>
          </div>
          <div>
            <div className="text-[7px] text-text-muted uppercase">Liq</div>
            <div className="text-[11px] font-mono font-medium text-text-secondary">{formatCompact(token.liquidity)}</div>
          </div>
        </div>
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
    refetchInterval: 25_000,
    staleTime: 12_000,
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
          <div className="h-9 w-9 rounded-xl bg-[#39FF14]/10 border border-[#39FF14]/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-[#39FF14]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold text-white">Trending Tokens</h1>
            <p className="text-[11px] text-white/50">Top tokens by volume surge and market activity</p>
          </div>
          <span className="text-[9px] text-white/50 font-mono bg-white/[0.04] px-2 py-1 rounded-md border border-white/10 ml-1">
            {sorted.length} tokens
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Sort controls */}
          <div className="flex items-center gap-0.5 bg-black/35 border border-white/10 rounded-lg p-0.5">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSort(opt.key)}
                className={`px-3 py-1.5 rounded-md text-[10px] font-semibold transition-all ${
                  sort === opt.key
                    ? "bg-white/10 text-white border border-white/15"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-white/10 bg-black/35 backdrop-blur overflow-hidden">
        {/* Table Header (desktop only) */}
        <div className="hidden md:flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-white/[0.03] text-[7px] uppercase tracking-widest text-white/40 font-bold">
          <span className="w-6 text-center">#</span>
          <span className="w-8"></span>
          <span className="w-[120px]">Token</span>
          <span className="w-[80px] text-right">Market Cap</span>
          <span className="w-[90px] text-right">Price</span>
          <div className="flex flex-1 min-w-0">
            {VOLUME_PERIODS.map((vp) => (
              <span key={vp} className="flex-1 text-center">{vp} Vol</span>
            ))}
          </div>
          <span className="w-[80px] text-right">Liquidity</span>
          <span className="w-[70px] text-right hidden lg:block">Mint</span>
          <span className="w-4"></span>
        </div>

        {/* Rows */}
        {isLoading && sorted.length === 0 ? (
          Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06]">
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
