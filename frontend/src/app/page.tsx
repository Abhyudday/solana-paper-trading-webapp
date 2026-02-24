"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, TokenInfo, TokenFilterParams, FilteredTokenItem } from "@/lib/api";
import { formatCompact, formatPrice } from "@/lib/format";
import { FilterPanel } from "@/components/FilterPanel";
import Link from "next/link";

type SortKey = "default" | "mcap" | "volume" | "liquidity" | "price";

interface DisplayToken {
  mint: string;
  symbol: string;
  name: string;
  image?: string;
  price: number;
  marketCap: number;
  liquidity: number;
  volume24h?: number;
}

function toDisplayTokens(tokens: TokenInfo[] | FilteredTokenItem[]): DisplayToken[] {
  return tokens.map((t) => ({
    mint: t.mint,
    symbol: t.symbol,
    name: t.name,
    image: t.image,
    price: t.price,
    marketCap: t.marketCap,
    liquidity: t.liquidity,
    volume24h: t.volume24h,
  }));
}

function sortTokens(tokens: DisplayToken[], key: SortKey): DisplayToken[] {
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

function TokenCard({ token }: { token: DisplayToken }) {
  const queryClient = useQueryClient();

  const handlePrefetch = useCallback(() => {
    queryClient.prefetchQuery({
      queryKey: ["token", token.mint],
      queryFn: () => api.market.getToken(token.mint),
      staleTime: 10000,
    });
  }, [queryClient, token.mint]);

  return (
    <Link
      href={`/token/${token.mint}`}
      className="flex items-start gap-3 rounded-lg border border-border bg-bg-secondary p-3 hover:border-accent-blue/60 transition-colors"
      onMouseEnter={handlePrefetch}
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

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "default", label: "Default" },
  { key: "mcap", label: "MC" },
  { key: "volume", label: "Volume" },
  { key: "liquidity", label: "Liq" },
  { key: "price", label: "Price" },
];

function countActiveFilters(f: TokenFilterParams): number {
  const keys: (keyof TokenFilterParams)[] = [
    "minLiquidity", "maxLiquidity", "minMarketCap", "maxMarketCap",
    "minVolume", "maxVolume", "minBuys", "maxBuys", "minSells", "maxSells",
    "minTotalTransactions", "maxTotalTransactions", "minHolders", "maxHolders",
    "minCurvePercentage", "maxCurvePercentage", "minFeesTotal", "maxFeesTotal",
    "minCreatedAt", "maxCreatedAt",
  ];
  return keys.filter((k) => f[k] !== undefined).length;
}

function TokenColumn({
  title,
  defaultTokens,
  filteredTokens,
  isLoading,
  isFilterLoading,
  color,
  filters,
  onOpenFilter,
}: {
  title: string;
  defaultTokens: TokenInfo[];
  filteredTokens: FilteredTokenItem[] | undefined;
  isLoading: boolean;
  isFilterLoading: boolean;
  color: string;
  filters: TokenFilterParams;
  onOpenFilter: () => void;
}) {
  const [sort, setSort] = useState<SortKey>("default");
  const hasFilters = countActiveFilters(filters) > 0;
  const filterCount = countActiveFilters(filters);

  const tokens = useMemo(() => {
    const raw = hasFilters && filteredTokens ? toDisplayTokens(filteredTokens) : toDisplayTokens(defaultTokens);
    return sortTokens(raw, sort);
  }, [defaultTokens, filteredTokens, hasFilters, sort]);

  const loading = hasFilters ? isFilterLoading : isLoading;

  return (
    <div className="flex flex-col min-w-0">
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${color}`} />
          <h2 className="text-sm font-bold uppercase tracking-wide text-text-secondary">{title}</h2>
          <span className="text-xs text-text-muted">({tokens.length})</span>
        </div>
        <button
          onClick={onOpenFilter}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors border ${
            hasFilters
              ? "border-accent-blue/60 bg-accent-blue/10 text-accent-blue"
              : "border-border bg-bg-tertiary text-text-muted hover:text-text-secondary"
          }`}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filter{filterCount > 0 && <span className="bg-accent-blue text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold">{filterCount}</span>}
        </button>
      </div>
      {/* Sort bar */}
      <div className="flex items-center gap-1 mb-2 px-1">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setSort(opt.key)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
              sort === opt.key
                ? "bg-accent-blue/20 text-accent-blue"
                : "text-text-muted hover:text-text-secondary hover:bg-bg-tertiary"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-200px)] pr-1 scrollbar-thin">
        {loading ? (
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

type ColumnId = "new" | "migrating" | "migrated";

export default function LandingPage() {
  const [columnFilters, setColumnFilters] = useState<Record<ColumnId, TokenFilterParams>>({
    new: {},
    migrating: {},
    migrated: {},
  });
  const [filterOpen, setFilterOpen] = useState<ColumnId | null>(null);

  // Default (unfiltered) queries
  const { data: latestData, isLoading: latestLoading } = useQuery({
    queryKey: ["latestTokens"],
    queryFn: () => api.market.getLatestTokens(),
    refetchInterval: 5000,
    staleTime: 3000,
  });

  const { data: graduatingData, isLoading: graduatingLoading } = useQuery({
    queryKey: ["graduatingTokens"],
    queryFn: () => api.market.getGraduatingTokens(),
    refetchInterval: 5000,
    staleTime: 3000,
  });

  const { data: graduatedData, isLoading: graduatedLoading } = useQuery({
    queryKey: ["graduatedTokens"],
    queryFn: () => api.market.getGraduatedTokens(),
    refetchInterval: 5000,
    staleTime: 3000,
  });

  // Filtered queries — only enabled when filters are active
  const newHasFilters = countActiveFilters(columnFilters.new) > 0;
  const migratingHasFilters = countActiveFilters(columnFilters.migrating) > 0;
  const migratedHasFilters = countActiveFilters(columnFilters.migrated) > 0;

  const { data: filteredNew, isLoading: filteredNewLoading } = useQuery({
    queryKey: ["filteredNew", columnFilters.new],
    queryFn: () => api.market.getFilteredTokens({ ...columnFilters.new, sortBy: "createdAt", sortOrder: "desc" }),
    enabled: newHasFilters,
    refetchInterval: 5000,
    staleTime: 3000,
  });

  const { data: filteredMigrating, isLoading: filteredMigratingLoading } = useQuery({
    queryKey: ["filteredMigrating", columnFilters.migrating],
    queryFn: () => api.market.getFilteredTokens({ ...columnFilters.migrating, status: "graduating" }),
    enabled: migratingHasFilters,
    refetchInterval: 5000,
    staleTime: 3000,
  });

  const { data: filteredMigrated, isLoading: filteredMigratedLoading } = useQuery({
    queryKey: ["filteredMigrated", columnFilters.migrated],
    queryFn: () => api.market.getFilteredTokens({ ...columnFilters.migrated, status: "graduated" }),
    enabled: migratedHasFilters,
    refetchInterval: 5000,
    staleTime: 3000,
  });

  const handleApplyFilter = useCallback((col: ColumnId, filters: TokenFilterParams) => {
    setColumnFilters((prev) => ({ ...prev, [col]: filters }));
    setFilterOpen(null);
  }, []);

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
          title="New Tokens"
          defaultTokens={latestData?.tokens || []}
          filteredTokens={filteredNew?.tokens}
          isLoading={latestLoading}
          isFilterLoading={filteredNewLoading}
          color="bg-accent-green"
          filters={columnFilters.new}
          onOpenFilter={() => setFilterOpen("new")}
        />
        <TokenColumn
          title="Migrating"
          defaultTokens={graduatingData?.tokens || []}
          filteredTokens={filteredMigrating?.tokens}
          isLoading={graduatingLoading}
          isFilterLoading={filteredMigratingLoading}
          color="bg-yellow-400"
          filters={columnFilters.migrating}
          onOpenFilter={() => setFilterOpen("migrating")}
        />
        <TokenColumn
          title="Migrated"
          defaultTokens={graduatedData?.tokens || []}
          filteredTokens={filteredMigrated?.tokens}
          isLoading={graduatedLoading}
          isFilterLoading={filteredMigratedLoading}
          color="bg-accent-blue"
          filters={columnFilters.migrated}
          onOpenFilter={() => setFilterOpen("migrated")}
        />
      </div>

      {/* Filter panel modal */}
      {filterOpen && (
        <FilterPanel
          initialFilters={columnFilters[filterOpen]}
          onApply={(f) => handleApplyFilter(filterOpen, f)}
          onClose={() => setFilterOpen(null)}
        />
      )}
    </div>
  );
}
