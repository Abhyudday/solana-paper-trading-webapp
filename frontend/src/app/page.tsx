"use client";

import { useState, useMemo, useCallback, useRef, useEffect, Fragment } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api, TokenInfo, TokenFilterParams, FilteredTokenItem } from "@/lib/api";
import { formatCompact, formatPrice, shortenAddress } from "@/lib/format";
import { usePageVisibility } from "@/hooks/usePageVisibility";
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
  dexPaid?: boolean;
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
    dexPaid: "dexPaid" in t ? (t as TokenInfo).dexPaid : undefined,
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

// Stagger sparkline fetches so they don't all fire at once
let sparklineIdx = 0;
function MiniSparkline({ mint }: { mint: string }) {
  const delay = useMemo(() => (sparklineIdx++) * 200, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { data } = useQuery({
    queryKey: ["sparkline", mint],
    queryFn: () => new Promise<Awaited<ReturnType<typeof api.market.getChart>>>((resolve) =>
      setTimeout(() => resolve(api.market.getChart(mint, "5m")), delay)
    ),
    staleTime: 120_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
  });

  const bars = data?.bars;
  if (!bars || bars.length < 2) return <div className="h-[28px] w-full" />;

  const closes = bars.slice(-30).map((b) => b.close).filter((c) => c > 0);
  if (closes.length < 2) return <div className="h-[28px] w-full" />;

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const h = 28;
  const w = 100; // percentage-based, will stretch
  const points = closes.map((c, i) => {
    const x = (i / (closes.length - 1)) * w;
    const y = h - ((c - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });

  const isUp = closes[closes.length - 1] >= closes[0];
  const color = isUp ? "#39FF14" : "#ff3860";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[28px]" preserveAspectRatio="none">
      <defs>
        <linearGradient id={`sg-${mint.slice(0, 8)}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={`0,${h} ${points.join(" ")} ${w},${h}`}
        fill={`url(#sg-${mint.slice(0, 8)})`}
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
      className={`token-card block rounded-xl border border-white/10 bg-black/35 backdrop-blur p-3 hover:bg-white/[0.04] group ${isNew ? "token-card-enter" : ""}`}
      onMouseEnter={handlePrefetch}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex-shrink-0 relative">
          {token.image && !imgError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={token.image}
              alt={token.symbol}
              className="h-10 w-10 rounded-lg object-cover bg-black/40 ring-1 ring-white/10 group-hover:ring-[#39FF14]/30 transition-all"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-[#39FF14]/20 to-[#4fc3f7]/10 flex items-center justify-center text-sm font-bold text-[#39FF14]/70 ring-1 ring-white/10 group-hover:ring-[#39FF14]/30 transition-all">
              {token.symbol?.charAt(0) || "?"}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-bold text-[13px] text-white truncate">{token.symbol}</span>
              <span className="text-[10px] text-white/50 truncate max-w-[80px] hidden sm:inline">{token.name}</span>
              {token.dexPaid && (
                <span className="text-[7px] font-bold px-1 py-0.5 rounded bg-[#39FF14]/10 text-[#39FF14] border border-[#39FF14]/20 flex-shrink-0">{"\u2713"} DEX</span>
              )}
            </div>
            <span className="text-xs font-mono font-bold text-[#39FF14] flex-shrink-0 text-glow-green">
              {formatCompact(token.marketCap)}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigator.clipboard.writeText(token.mint);
                setMintCopied(true);
                setTimeout(() => setMintCopied(false), 1500);
              }}
              className={`text-[9px] font-mono transition-colors ${mintCopied ? "text-[#39FF14]" : "text-white/50 hover:text-white"}`}
              title={mintCopied ? "Copied!" : "Click to copy address"}
            >
              {mintCopied ? "Copied!" : shortenAddress(token.mint, 4)}
            </button>
            <span className="text-[10px] font-mono text-white/60 ml-auto">
              {formatPrice(token.price)}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-2 -mx-1">
        <MiniSparkline mint={token.mint} />
      </div>

      <div className="grid grid-cols-4 gap-1 mt-1 pt-2 border-t border-white/[0.06]">
        <div className="text-center">
          <div className="text-[8px] text-white/40 uppercase tracking-wider">MC</div>
          <div className="text-[10px] font-mono font-semibold text-[#39FF14]">{formatCompact(token.marketCap)}</div>
        </div>
        <div className="text-center">
          <div className="text-[8px] text-white/40 uppercase tracking-wider">Price</div>
          <div className="text-[10px] font-mono font-medium text-white">{formatPrice(token.price)}</div>
        </div>
        <div className="text-center">
          <div className="text-[8px] text-white/40 uppercase tracking-wider">Vol</div>
          <div className="text-[10px] font-mono font-medium text-white/70">{formatCompact(token.volume24h || 0)}</div>
        </div>
        <div className="text-center">
          <div className="text-[8px] text-white/40 uppercase tracking-wider">Liq</div>
          <div className="text-[10px] font-mono font-medium text-white/70">{formatCompact(token.liquidity)}</div>
        </div>
      </div>
    </Link>
  );
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "default", label: "New" },
  { key: "mcap", label: "MC" },
  { key: "volume", label: "Vol" },
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
  glowColor,
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
  glowColor: string;
  filters: TokenFilterParams;
  onOpenFilter: () => void;
  onTimeFilter?: (tf: TimeFilter) => void;
}) {
  const [sort, setSort] = useState<SortKey>("default");
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

  if (tokens.length > 0) {
    lastTokensRef.current = tokens;
    hasEverLoadedRef.current = true;
  }
  if (hasData) hasEverLoadedRef.current = true;
  const displayTokens = tokens.length > 0 ? tokens : lastTokensRef.current;

  const newMints = useMemo(() => {
    if (!hasSeenFirstBatchRef.current) return new Set<string>();
    const fresh = new Set<string>();
    for (const t of displayTokens) {
      if (!seenMintsRef.current.has(t.mint)) fresh.add(t.mint);
    }
    return fresh;
  }, [displayTokens]);

  useEffect(() => {
    if (displayTokens.length > 0) {
      hasSeenFirstBatchRef.current = true;
    }
    seenMintsRef.current = new Set(displayTokens.map((t) => t.mint));
  }, [displayTokens]);

  const loading = !hasEverLoadedRef.current && displayTokens.length === 0;

  return (
    <div className="flex flex-col min-w-0">
      {/* Column Header */}
      <div className="mb-2 px-1 py-2.5 border-b border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <span className={`h-2 w-2 rounded-full ${color} block`} style={{ boxShadow: `0 0 8px ${glowColor}` }} />
            </div>
            <h2 className="text-xs font-extrabold text-white uppercase tracking-wider">{title}</h2>
            <span className="text-[9px] text-white/50 font-mono bg-white/[0.04] px-1.5 py-0.5 rounded-md border border-white/10">{displayTokens.length}</span>
          </div>
          <div className="flex items-center gap-0.5">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setSort(opt.key)}
                className={`px-2 py-1 rounded-md text-[9px] font-semibold transition-all ${
                  sort === opt.key
                    ? "bg-white/10 text-white border border-white/15"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                {opt.label}
              </button>
            ))}
            <button
              onClick={onOpenFilter}
              className={`ml-0.5 flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold transition-all ${
                hasFilters
                  ? "bg-[#4fc3f7]/10 text-[#4fc3f7] border border-[#4fc3f7]/20"
                  : "text-white/50 hover:text-white/70"
              }`}
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {filterCount > 0 && <span>{filterCount}</span>}
            </button>
          </div>
        </div>
        {columnId === "new" && onTimeFilter && (
          <div className="flex items-center gap-1 mt-2">
            <span className="text-[8px] text-white/40 mr-1 uppercase tracking-wider font-semibold">Age</span>
            {TIME_FILTER_OPTIONS.map((tf) => (
              <button
                key={tf.key}
                onClick={() => {
                  setActiveTimeFilter(tf.key);
                  onTimeFilter(tf.key);
                }}
                className={`px-2 py-0.5 rounded-md text-[9px] font-bold transition-all ${
                  activeTimeFilter === tf.key
                    ? "bg-[#39FF14]/10 text-[#39FF14] border border-[#39FF14]/20"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5 overflow-y-auto max-h-[calc(100vh-140px)] pr-1 scroll-smooth token-list-scroll pt-1">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-black/35 p-3 h-[90px] skeleton-shimmer" />
          ))
        ) : displayTokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-white/40">
            {(isLoading || isFilterLoading) ? (
              <>
                <div className="w-6 h-6 border-2 border-white/20 border-t-[#39FF14] rounded-full animate-spin mb-3" />
                <span className="text-[11px]">Loading tokens...</span>
              </>
            ) : (
              <>
                <svg className="w-8 h-8 mb-2 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="text-[11px]">No tokens found</span>
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
  const isTabVisible = usePageVisibility();
  const visScale = isTabVisible ? 1 : 4;

  const lastLatestRef = useRef<TokenInfo[]>([]);
  const lastGraduatingRef = useRef<TokenInfo[]>([]);
  const lastGraduatedRef = useRef<TokenInfo[]>([]);

  // Single batch request for all 3 homepage lists (3 API calls → 1)
  const { data: homeData, isLoading: homeLoading } = useQuery({
    queryKey: ["homeTokens"],
    queryFn: () => api.market.getHomeTokens(),
    refetchInterval: 25_000 * visScale,
    staleTime: 12_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const rawLatest = homeData?.latest || [];
  const rawGraduating = homeData?.graduating || [];
  const rawGraduated = homeData?.graduated || [];
  if (rawLatest.length > 0) lastLatestRef.current = rawLatest;
  if (rawGraduating.length > 0) lastGraduatingRef.current = rawGraduating;
  if (rawGraduated.length > 0) lastGraduatedRef.current = rawGraduated;
  const stableLatest = rawLatest.length > 0 ? rawLatest : lastLatestRef.current;
  const stableGraduating = rawGraduating.length > 0 ? rawGraduating : lastGraduatingRef.current;
  const stableGraduated = rawGraduated.length > 0 ? rawGraduated : lastGraduatedRef.current;

  const newHasFilters = countActiveFilters(columnFilters.new) > 0;
  const migratingHasFilters = countActiveFilters(columnFilters.migrating) > 0;
  const migratedHasFilters = countActiveFilters(columnFilters.migrated) > 0;

  const { data: filteredNew, isLoading: filteredNewLoading } = useQuery({
    queryKey: ["filteredNew", columnFilters.new],
    queryFn: () => api.market.getFilteredTokens({ ...columnFilters.new, sortBy: "createdAt", sortOrder: "desc" }),
    enabled: newHasFilters,
    refetchInterval: 25_000 * visScale,
    staleTime: 12_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const { data: filteredMigrating, isLoading: filteredMigratingLoading } = useQuery({
    queryKey: ["filteredMigrating", columnFilters.migrating],
    queryFn: () => api.market.getFilteredTokens({ ...columnFilters.migrating, status: "graduating" }),
    enabled: migratingHasFilters,
    refetchInterval: 25_000 * visScale,
    staleTime: 12_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });

  const { data: filteredMigrated, isLoading: filteredMigratedLoading } = useQuery({
    queryKey: ["filteredMigrated", columnFilters.migrated],
    queryFn: () => api.market.getFilteredTokens({ ...columnFilters.migrated, status: "graduated" }),
    enabled: migratedHasFilters,
    refetchInterval: 25_000 * visScale,
    staleTime: 12_000,
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
    <div className="pt-3 pb-4 page-enter">
      {/* 3-column trenches grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        <TokenColumn
          title="New Pairs"
          columnId="new"
          defaultTokens={stableLatest}
          filteredTokens={filteredNew?.tokens}
          isLoading={homeLoading}
          isFilterLoading={filteredNewLoading}
          hasData={!!homeData}
          color="bg-accent-green"
          glowColor="#39FF1450"
          filters={columnFilters.new}
          onOpenFilter={() => setFilterOpen("new")}
          onTimeFilter={handleTimeFilter}
        />
        <TokenColumn
          title="Migrating"
          columnId="migrating"
          defaultTokens={stableGraduating}
          filteredTokens={filteredMigrating?.tokens}
          isLoading={homeLoading}
          isFilterLoading={filteredMigratingLoading}
          hasData={!!homeData}
          color="bg-accent-yellow"
          glowColor="#ffd00050"
          filters={columnFilters.migrating}
          onOpenFilter={() => setFilterOpen("migrating")}
        />
        <TokenColumn
          title="Migrated"
          columnId="migrated"
          defaultTokens={stableGraduated}
          filteredTokens={filteredMigrated?.tokens}
          isLoading={homeLoading}
          isFilterLoading={filteredMigratedLoading}
          hasData={!!homeData}
          color="bg-accent-blue"
          glowColor="#4fc3f750"
          filters={columnFilters.migrated}
          onOpenFilter={() => setFilterOpen("migrated")}
        />
      </div>

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
