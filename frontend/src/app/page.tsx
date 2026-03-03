"use client";

import { useState, useMemo, useCallback, useRef, useEffect, Fragment } from "react";
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
  const [imgError, setImgError] = useState(false);
  const [mintCopied, setMintCopied] = useState(false);

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
      className={`token-card block rounded-lg border border-border bg-bg-card p-3.5 hover:border-accent-green/50 hover:bg-bg-card/80 transition-all duration-200 group ${isNew ? "token-card-enter" : ""}`}
      onMouseEnter={handlePrefetch}
    >
      <div className="flex items-center gap-3">
        {/* Token Avatar */}
        <div className="flex-shrink-0">
          {token.image && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={token.image}
              alt={token.symbol}
              className="h-11 w-11 rounded-full object-cover bg-bg-tertiary ring-2 ring-border group-hover:ring-accent-green/30 transition-all"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="h-11 w-11 rounded-full bg-gradient-to-br from-bg-tertiary to-bg-secondary flex items-center justify-center text-sm font-bold text-text-muted ring-2 ring-border group-hover:ring-accent-green/30 transition-all">
              {token.symbol?.charAt(0) || "?"}
            </div>
          )}
        </div>

        {/* Token Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-bold text-sm text-text-primary truncate">{token.symbol}</span>
              <span className="text-[11px] text-text-muted truncate max-w-[100px]">{token.name}</span>
            </div>
            <span className="text-sm font-mono font-bold text-accent-green flex-shrink-0">
              {formatCompact(token.marketCap)}
            </span>
          </div>

          {/* Stats Row */}
          <div className="flex items-center gap-3 mt-1.5">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigator.clipboard.writeText(token.mint);
                setMintCopied(true);
                setTimeout(() => setMintCopied(false), 1500);
              }}
              className={`text-[10px] font-mono transition-colors ${mintCopied ? "text-accent-green" : "text-text-muted hover:text-text-primary"}`}
              title={mintCopied ? "Copied!" : "Click to copy address"}
            >
              {mintCopied ? "Copied!" : shortenAddress(token.mint, 4)}
            </button>
            <span className="text-[10px] font-mono text-text-secondary ml-auto">
              {formatPrice(token.price)}
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Stats Bar */}
      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-border/50">
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-muted">MC</span>
          <span className="text-[11px] font-mono font-semibold text-accent-green">{formatCompact(token.marketCap)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-muted">Price</span>
          <span className="text-[11px] font-mono font-medium text-text-primary">{formatPrice(token.price)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-muted">Vol</span>
          <span className="text-[11px] font-mono font-medium text-text-secondary">{formatCompact(token.volume24h || 0)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-text-muted">Liq</span>
          <span className="text-[11px] font-mono font-medium text-text-secondary">{formatCompact(token.liquidity)}</span>
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

type TimeFilter = "1h" | "6h" | "24h" | "all";
const TIME_FILTER_OPTIONS: { key: TimeFilter; label: string; ms: number }[] = [
  { key: "1h", label: "1H", ms: 3_600_000 },
  { key: "6h", label: "6H", ms: 21_600_000 },
  { key: "24h", label: "24H", ms: 86_400_000 },
  { key: "all", label: "All", ms: 0 },
];

function TokenColumn({
  title,
  columnId,
  defaultTokens,
  filteredTokens,
  isLoading,
  isFilterLoading,
  hasData,
  color,
  filters,
  onOpenFilter,
  onTimeFilter,
}: {
  title: string;
  columnId: ColumnId;
  defaultTokens: TokenInfo[];
  filteredTokens: FilteredTokenItem[] | undefined;
  isLoading: boolean;
  isFilterLoading: boolean;
  hasData: boolean;
  color: string;
  filters: TokenFilterParams;
  onOpenFilter: () => void;
  onTimeFilter?: (tf: TimeFilter) => void;
}) {
  const [sort, setSort] = useState<SortKey>(columnId === "migrating" ? "mcap" : "default");
  const [activeTimeFilter, setActiveTimeFilter] = useState<TimeFilter>("all");
  const hasFilters = countActiveFilters(filters) > 0;
  const filterCount = countActiveFilters(filters);
  const lastTokensRef = useRef<DisplayToken[]>([]);
  const seenMintsRef = useRef<Set<string>>(new Set());
  const hasSeenFirstBatchRef = useRef(false);
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
  // Only detect new tokens AFTER we've already shown the first batch
  const newMints = useMemo(() => {
    if (!hasSeenFirstBatchRef.current) return new Set<string>();
    const fresh = new Set<string>();
    for (const t of displayTokens) {
      if (!seenMintsRef.current.has(t.mint)) fresh.add(t.mint);
    }
    return fresh;
  }, [displayTokens]);

  // After render, update seen mints
  useEffect(() => {
    if (displayTokens.length > 0) {
      hasSeenFirstBatchRef.current = true;
    }
    seenMintsRef.current = new Set(displayTokens.map((t) => t.mint));
  }, [displayTokens]);

  // Show loading skeleton when we've never received data
  const loading = !hasEverLoadedRef.current && displayTokens.length === 0;

  return (
    <div className="flex flex-col min-w-0">
      {/* Column Header */}
      <div className="mb-2 px-1.5 py-2 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${color} shadow-sm`} style={{ boxShadow: `0 0 8px ${color === 'bg-accent-green' ? '#00c853' : color === 'bg-accent-yellow' ? '#ffd600' : '#3b8bff'}50` }} />
            <h2 className="text-[13px] font-extrabold text-text-primary uppercase tracking-wide">{title}</h2>
            <span className="text-[10px] text-text-muted font-mono bg-bg-tertiary px-1.5 py-0.5 rounded-full">{displayTokens.length}</span>
            {columnId === "migrating" && (
              <span className="text-[9px] text-[#ffd600]/80 bg-[#ffd600]/10 px-1.5 py-0.5 rounded-full font-semibold">Highest MC first</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Sort pills */}
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSort(opt.key)}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                  sort === opt.key
                    ? "bg-bg-tertiary text-text-primary shadow-sm"
                    : "text-text-muted hover:text-text-secondary hover:bg-bg-tertiary/50"
                }`}
              >
                {opt.label}
              </button>
            ))}
            <button
              onClick={onOpenFilter}
              className={`ml-1 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-all ${
                hasFilters
                  ? "bg-accent-blue/15 text-accent-blue"
                  : "text-text-muted hover:text-text-secondary hover:bg-bg-tertiary/50"
              }`}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {filterCount > 0 && <span>{filterCount}</span>}
            </button>
          </div>
        </div>
        {/* Time filter bar for New Pairs */}
        {columnId === "new" && onTimeFilter && (
          <div className="flex items-center gap-1 mt-1.5">
            <span className="text-[9px] text-text-muted mr-1">Age:</span>
            {TIME_FILTER_OPTIONS.map((tf) => (
              <button
                key={tf.key}
                onClick={() => {
                  setActiveTimeFilter(tf.key);
                  onTimeFilter(tf.key);
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                  activeTimeFilter === tf.key
                    ? "bg-accent-green/20 text-accent-green shadow-sm"
                    : "text-text-muted hover:text-text-secondary hover:bg-bg-tertiary/50"
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Token list — shows ~6-7 cards with smooth scroll for more */}
      <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-130px)] pr-1 scroll-smooth token-list-scroll pt-1.5">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-bg-card p-3.5 animate-pulse h-[100px]" />
          ))
        ) : displayTokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            {(isLoading || isFilterLoading) ? (
              <>
                <div className="w-7 h-7 border-2 border-text-muted/30 border-t-accent-green rounded-full animate-spin mb-3" />
                <span className="text-xs">Loading tokens...</span>
              </>
            ) : (
              <>
                <svg className="w-10 h-10 mb-2 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-xs">No tokens found</span>
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
    refetchInterval: 2_000,
    staleTime: 1_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const { data: graduatingData, isLoading: graduatingLoading } = useQuery({
    queryKey: ["graduatingTokens"],
    queryFn: () => api.market.getGraduatingTokens(),
    refetchInterval: 2_000,
    staleTime: 1_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const { data: graduatedData, isLoading: graduatedLoading } = useQuery({
    queryKey: ["graduatedTokens"],
    queryFn: () => api.market.getGraduatedTokens(),
    refetchInterval: 2_000,
    staleTime: 1_000,
    refetchOnWindowFocus: false,
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
    refetchInterval: 2_000,
    staleTime: 1_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const { data: filteredMigrating, isLoading: filteredMigratingLoading } = useQuery({
    queryKey: ["filteredMigrating", columnFilters.migrating],
    queryFn: () => api.market.getFilteredTokens({ ...columnFilters.migrating, status: "graduating" }),
    enabled: migratingHasFilters,
    refetchInterval: 2_000,
    staleTime: 1_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const { data: filteredMigrated, isLoading: filteredMigratedLoading } = useQuery({
    queryKey: ["filteredMigrated", columnFilters.migrated],
    queryFn: () => api.market.getFilteredTokens({ ...columnFilters.migrated, status: "graduated" }),
    enabled: migratedHasFilters,
    refetchInterval: 2_000,
    staleTime: 1_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const handleApplyFilter = useCallback((col: ColumnId, filters: TokenFilterParams) => {
    setColumnFilters((prev) => ({ ...prev, [col]: filters }));
    setFilterOpen(null);
  }, []);

  const handleTimeFilter = useCallback((tf: TimeFilter) => {
    setColumnFilters((prev) => {
      const tfOption = TIME_FILTER_OPTIONS.find((o) => o.key === tf);
      if (!tfOption || tf === "all") {
        const next = { ...prev.new };
        delete next.minCreatedAt;
        return { ...prev, new: next };
      }
      return {
        ...prev,
        new: { ...prev.new, minCreatedAt: Date.now() - tfOption.ms },
      };
    });
  }, []);

  return (
    <div className="pt-2 pb-4">
      {/* 3-column trenches grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <TokenColumn
          title="New Pairs"
          columnId="new"
          defaultTokens={stableLatest}
          filteredTokens={filteredNew?.tokens}
          isLoading={latestLoading}
          isFilterLoading={filteredNewLoading}
          hasData={!!latestData}
          color="bg-accent-green"
          filters={columnFilters.new}
          onOpenFilter={() => setFilterOpen("new")}
          onTimeFilter={handleTimeFilter}
        />
        <TokenColumn
          title="Migrating"
          columnId="migrating"
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
          columnId="migrated"
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
          columnType={filterOpen}
        />
      )}
    </div>
  );
}
