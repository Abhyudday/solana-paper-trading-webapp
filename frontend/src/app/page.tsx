"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
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

function TokenCard({ token, isNew }: { token: DisplayToken; isNew?: boolean }) {
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
      className={`block rounded border border-border bg-bg-card p-2.5 hover:border-accent-green/40 transition-all group overflow-hidden ${isNew ? "token-card-enter" : ""}`}
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
  hasData,
  color,
  filters,
  onOpenFilter,
}: {
  title: string;
  defaultTokens: TokenInfo[];
  filteredTokens: FilteredTokenItem[] | undefined;
  isLoading: boolean;
  isFilterLoading: boolean;
  hasData: boolean;
  color: string;
  filters: TokenFilterParams;
  onOpenFilter: () => void;
}) {
  const [sort, setSort] = useState<SortKey>("default");
  const hasFilters = countActiveFilters(filters) > 0;
  const filterCount = countActiveFilters(filters);
  const lastTokensRef = useRef<DisplayToken[]>([]);
  const seenMintsRef = useRef<Set<string>>(new Set());
  const isFirstRenderRef = useRef(true);
  const hasEverLoadedRef = useRef(false);

  const tokens = useMemo(() => {
    const raw = hasFilters && filteredTokens ? toDisplayTokens(filteredTokens) : toDisplayTokens(defaultTokens);
    return sortTokens(raw, sort);
  }, [defaultTokens, filteredTokens, hasFilters, sort]);

  // Remember last non-empty list so columns never blank out during refetches
  if (tokens.length > 0) {
    lastTokensRef.current = tokens;
    hasEverLoadedRef.current = true;
  }
  if (hasData) hasEverLoadedRef.current = true;
  const displayTokens = tokens.length > 0 ? tokens : lastTokensRef.current;

  // Detect which tokens are new (not in the previously seen set)
  const newMints = useMemo(() => {
    if (isFirstRenderRef.current) return new Set<string>();
    const fresh = new Set<string>();
    for (const t of displayTokens) {
      if (!seenMintsRef.current.has(t.mint)) fresh.add(t.mint);
    }
    return fresh;
  }, [displayTokens]);

  // After render, update seen mints
  useEffect(() => {
    isFirstRenderRef.current = false;
    seenMintsRef.current = new Set(displayTokens.map((t) => t.mint));
  }, [displayTokens]);

  // Show loading skeleton when we've never received data
  const loading = !hasEverLoadedRef.current && displayTokens.length === 0;

  return (
    <div className="flex flex-col min-w-0">
      {/* Column Header */}
      <div className="flex items-center justify-between mb-1 px-0.5 py-1.5 border-b border-border">
        <div className="flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
          <h2 className="text-[11px] font-semibold text-text-primary">{title}</h2>
          <span className="text-[10px] text-text-muted">({displayTokens.length})</span>
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
        ) : displayTokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted">
            {(isLoading || isFilterLoading) ? (
              <>
                <div className="w-6 h-6 border-2 border-text-muted/30 border-t-accent-green rounded-full animate-spin mb-3" />
                <span className="text-xs">Loading...</span>
              </>
            ) : (
              <>
                <svg className="w-10 h-10 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-xs">No Data</span>
              </>
            )}
          </div>
        ) : (
          displayTokens.map((token) => <TokenCard key={token.mint} token={token} isNew={newMints.has(token.mint)} />)
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

  // Refs to hold last non-empty token arrays — guarantees columns never go blank
  const lastLatestRef = useRef<TokenInfo[]>([]);
  const lastGraduatingRef = useRef<TokenInfo[]>([]);
  const lastGraduatedRef = useRef<TokenInfo[]>([]);

  // Default (unfiltered) queries
  const { data: latestData, isLoading: latestLoading } = useQuery({
    queryKey: ["latestTokens"],
    queryFn: () => api.market.getLatestTokens(),
    refetchInterval: 1_500,
    staleTime: 1_000,
    placeholderData: keepPreviousData,
  });

  const { data: graduatingData, isLoading: graduatingLoading } = useQuery({
    queryKey: ["graduatingTokens"],
    queryFn: () => api.market.getGraduatingTokens(),
    refetchInterval: 1_500,
    staleTime: 1_000,
    placeholderData: keepPreviousData,
  });

  const { data: graduatedData, isLoading: graduatedLoading } = useQuery({
    queryKey: ["graduatedTokens"],
    queryFn: () => api.market.getGraduatedTokens(),
    refetchInterval: 1_500,
    staleTime: 1_000,
    placeholderData: keepPreviousData,
  });

  // Stabilize token arrays: never pass [] if we had data before
  const rawLatest = latestData?.tokens || [];
  const rawGraduating = graduatingData?.tokens || [];
  const rawGraduated = graduatedData?.tokens || [];
  if (rawLatest.length > 0) lastLatestRef.current = rawLatest;
  if (rawGraduating.length > 0) lastGraduatingRef.current = rawGraduating;
  if (rawGraduated.length > 0) lastGraduatedRef.current = rawGraduated;
  const stableLatest = rawLatest.length > 0 ? rawLatest : lastLatestRef.current;
  const stableGraduating = rawGraduating.length > 0 ? rawGraduating : lastGraduatingRef.current;
  const stableGraduated = rawGraduated.length > 0 ? rawGraduated : lastGraduatedRef.current;

  // Filtered queries — only enabled when filters are active
  const newHasFilters = countActiveFilters(columnFilters.new) > 0;
  const migratingHasFilters = countActiveFilters(columnFilters.migrating) > 0;
  const migratedHasFilters = countActiveFilters(columnFilters.migrated) > 0;

  const { data: filteredNew, isLoading: filteredNewLoading } = useQuery({
    queryKey: ["filteredNew", columnFilters.new],
    queryFn: () => api.market.getFilteredTokens({ ...columnFilters.new, sortBy: "createdAt", sortOrder: "desc" }),
    enabled: newHasFilters,
    refetchInterval: 1_500,
    staleTime: 1_000,
    placeholderData: keepPreviousData,
  });

  const { data: filteredMigrating, isLoading: filteredMigratingLoading } = useQuery({
    queryKey: ["filteredMigrating", columnFilters.migrating],
    queryFn: () => api.market.getFilteredTokens({ ...columnFilters.migrating, status: "graduating" }),
    enabled: migratingHasFilters,
    refetchInterval: 1_500,
    staleTime: 1_000,
    placeholderData: keepPreviousData,
  });

  const { data: filteredMigrated, isLoading: filteredMigratedLoading } = useQuery({
    queryKey: ["filteredMigrated", columnFilters.migrated],
    queryFn: () => api.market.getFilteredTokens({ ...columnFilters.migrated, status: "graduated" }),
    enabled: migratedHasFilters,
    refetchInterval: 1_500,
    staleTime: 1_000,
    placeholderData: keepPreviousData,
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
          defaultTokens={stableLatest}
          filteredTokens={filteredNew?.tokens}
          isLoading={latestLoading}
          isFilterLoading={filteredNewLoading}
          hasData={!!latestData}
          color="bg-accent-green"
          filters={columnFilters.new}
          onOpenFilter={() => setFilterOpen("new")}
        />
        <TokenColumn
          title="Migrating"
          defaultTokens={stableGraduating}
          filteredTokens={filteredMigrating?.tokens}
          isLoading={graduatingLoading}
          isFilterLoading={filteredMigratingLoading}
          hasData={!!graduatingData}
          color="bg-accent-yellow"
          filters={columnFilters.migrating}
          onOpenFilter={() => setFilterOpen("migrating")}
        />
        <TokenColumn
          title="Migrated"
          defaultTokens={stableGraduated}
          filteredTokens={filteredMigrated?.tokens}
          isLoading={graduatedLoading}
          isFilterLoading={filteredMigratedLoading}
          hasData={!!graduatedData}
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
