"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, TokenInfo, TokenFilterParams, FilteredTokenItem } from "@/lib/api";
import { formatCompact, formatPrice, shortenAddress } from "@/lib/format";
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
      staleTime: 30000,
    });
    queryClient.prefetchQuery({
      queryKey: ["chart", token.mint, "1d"],
      queryFn: () => api.market.getChart(token.mint, "1d"),
      staleTime: 30000,
    });
  }, [queryClient, token.mint]);

  return (
    <Link
      href={`/token/${token.mint}`}
      className="block rounded border border-border bg-bg-card p-2.5 hover:border-accent-green/40 transition-all group"
      onMouseEnter={handlePrefetch}
    >
      <div className="flex items-start gap-2.5">
        {/* Token Avatar */}
        <div className="flex-shrink-0">
          {token.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={token.image}
              alt={token.symbol}
              className="h-10 w-10 rounded-full object-cover bg-bg-tertiary ring-1 ring-border"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
              }}
            />
          ) : null}
          {!token.image && (
            <div className="h-10 w-10 rounded-full bg-bg-tertiary flex items-center justify-center text-xs font-bold text-text-muted ring-1 ring-border">
              {token.symbol?.charAt(0) || "?"}
            </div>
          )}
        </div>

        {/* Token Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1 min-w-0">
              <span className="font-bold text-[13px] text-text-primary truncate">{token.symbol}</span>
              <span className="text-[10px] text-text-muted truncate max-w-[80px]">{token.name}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] text-text-muted">V <span className="text-text-secondary">{formatCompact(token.volume24h || 0).replace("$", "")}</span></span>
              <span className="text-[10px] text-text-muted">MC <span className="text-accent-green">{formatCompact(token.marketCap).replace("$", "")}</span></span>
            </div>
          </div>

          {/* Stats Row */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[10px] font-mono text-text-muted">
              {shortenAddress(token.mint, 4)}
            </span>
          </div>

          {/* Bottom badges */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className="text-[9px] font-mono bg-bg-tertiary text-accent-green px-1.5 py-0.5 rounded">
              {formatPrice(token.price)}
            </span>
            <span className="text-[9px] bg-bg-tertiary text-text-muted px-1.5 py-0.5 rounded">
              Liq {formatCompact(token.liquidity).replace("$", "")}
            </span>
          </div>
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
      {/* Column Header */}
      <div className="flex items-center justify-between mb-1 px-0.5 py-1.5 border-b border-border">
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
          <h2 className="text-[11px] font-semibold text-text-primary">{title}</h2>
          <span className="text-[10px] text-text-muted">({tokens.length})</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Sort pills */}
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSort(opt.key)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
                sort === opt.key
                  ? "bg-bg-tertiary text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            onClick={onOpenFilter}
            className={`ml-0.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium transition-colors ${
              hasFilters
                ? "bg-accent-blue/15 text-accent-blue"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            {filterCount > 0 && <span>{filterCount}</span>}
          </button>
        </div>
      </div>

      {/* Token list */}
      <div className="flex flex-col gap-1 overflow-y-auto max-h-[calc(100vh-120px)] pr-0.5 scrollbar-thin pt-1">
        {loading ? (
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded border border-border bg-bg-card p-2.5 animate-pulse h-[80px]" />
          ))
        ) : tokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            <svg className="w-10 h-10 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-xs">No Data</span>
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
    <div className="pt-2 pb-4">
      {/* 3-column trenches grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <TokenColumn
          title="New"
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
          color="bg-accent-yellow"
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
