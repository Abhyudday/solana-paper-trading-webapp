"use client";

import { useQuery } from "@tanstack/react-query";
import { api, TokenInfo } from "@/lib/api";
import { formatCompact, formatPrice } from "@/lib/format";
import Link from "next/link";

function TokenCard({ token }: { token: TokenInfo }) {
  return (
    <Link
      href={`/token/${token.mint}`}
      className="flex items-start gap-3 rounded-lg border border-border bg-bg-secondary p-3 hover:border-accent-blue/60 transition-colors"
    >
      <div className="flex-shrink-0 mt-0.5">
        {token.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={token.image}
            alt={token.symbol}
            className="h-9 w-9 rounded-full object-cover bg-bg-tertiary"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="h-9 w-9 rounded-full bg-bg-tertiary flex items-center justify-center text-xs font-bold text-text-muted">
            {token.symbol?.charAt(0) || "?"}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex items-baseline gap-1.5 min-w-0">
            <span className="font-bold text-sm text-text-primary truncate">{token.symbol}</span>
            <span className="text-xs text-text-muted truncate hidden sm:inline">{token.name}</span>
          </div>
          <span className="text-xs font-mono text-text-primary flex-shrink-0">
            {formatPrice(token.price)}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-text-muted">
          <span>MCap: <span className="text-text-secondary">{formatCompact(token.marketCap)}</span></span>
          <span>Liq: <span className="text-text-secondary">{formatCompact(token.liquidity)}</span></span>
          {token.volume24h ? (
            <span>Vol: <span className="text-text-secondary">{formatCompact(token.volume24h)}</span></span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function TokenColumn({
  title,
  tokens,
  isLoading,
  color,
}: {
  title: string;
  tokens: TokenInfo[];
  isLoading: boolean;
  color: string;
}) {
  return (
    <div className="flex flex-col min-w-0">
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className={`h-2 w-2 rounded-full ${color}`} />
        <h2 className="text-sm font-bold uppercase tracking-wide text-text-secondary">{title}</h2>
        <span className="text-xs text-text-muted">({tokens.length})</span>
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-160px)] pr-1 scrollbar-thin">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-bg-secondary p-3 animate-pulse h-[72px]" />
          ))
        ) : tokens.length === 0 ? (
          <div className="rounded-lg border border-border bg-bg-secondary p-4 text-center text-text-muted text-sm">
            No tokens found
          </div>
        ) : (
          tokens.map((token) => <TokenCard key={token.mint} token={token} />)
        )}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { data: latestData, isLoading: latestLoading } = useQuery({
    queryKey: ["latestTokens"],
    queryFn: () => api.market.getLatestTokens(),
    refetchInterval: 15000,
    staleTime: 30000,
  });

  const { data: trendingData, isLoading: trendingLoading } = useQuery({
    queryKey: ["trendingTokens"],
    queryFn: () => api.market.getTrendingTokens(),
    refetchInterval: 15000,
    staleTime: 30000,
  });

  const { data: topData, isLoading: topLoading } = useQuery({
    queryKey: ["topTokens"],
    queryFn: () => api.market.getTopTokens(),
    refetchInterval: 15000,
    staleTime: 30000,
  });

  return (
    <div className="py-4">
      {/* Header bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-accent-green animate-pulse" />
          <span className="text-xs text-text-muted">Solana Mainnet — Live Data</span>
        </div>
        <Link
          href="/portfolio"
          className="text-xs bg-bg-tertiary text-text-secondary hover:text-text-primary border border-border rounded-lg px-3 py-1.5 transition-colors"
        >
          Portfolio →
        </Link>
      </div>

      {/* 3-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TokenColumn
          title="New"
          tokens={latestData?.tokens || []}
          isLoading={latestLoading}
          color="bg-accent-green"
        />
        <TokenColumn
          title="Trending"
          tokens={trendingData?.tokens || []}
          isLoading={trendingLoading}
          color="bg-yellow-400"
        />
        <TokenColumn
          title="Top Volume"
          tokens={topData?.tokens || []}
          isLoading={topLoading}
          color="bg-accent-blue"
        />
      </div>
    </div>
  );
}
