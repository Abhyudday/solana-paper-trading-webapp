"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, BundleInfo, SniperInfo } from "@/lib/api";
import { shortenAddress, formatCompact } from "@/lib/format";

interface BundleCheckerProps {
  mint: string;
}

const RISK_COLORS = {
  low: { text: "text-accent-green", bg: "bg-accent-green", ring: "ring-accent-green/20" },
  medium: { text: "text-accent-yellow", bg: "bg-accent-yellow", ring: "ring-accent-yellow/20" },
  high: { text: "text-accent-orange", bg: "bg-accent-orange", ring: "ring-accent-orange/20" },
  critical: { text: "text-accent-red", bg: "bg-accent-red", ring: "ring-accent-red/20" },
};

type BundleTab = "overview" | "bundles" | "snipers";

function RiskGauge({ score, level }: { score: number; level: keyof typeof RISK_COLORS }) {
  const colors = RISK_COLORS[level];
  const rotation = (score / 100) * 180 - 90;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-9 overflow-hidden">
        {/* Background arc */}
        <div className="absolute inset-0 rounded-t-full border-4 border-bg-tertiary border-b-0" />
        {/* Colored fill */}
        <div
          className={`absolute bottom-0 left-1/2 w-1 h-8 origin-bottom ${colors.bg} rounded-full transition-transform duration-700`}
          style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}
        />
        {/* Center dot */}
        <div className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${colors.bg}`} />
      </div>
      <div className="flex items-center gap-1">
        <span className={`text-sm font-bold font-mono ${colors.text}`}>{score}</span>
        <span className="text-[8px] text-text-muted">/100</span>
      </div>
      <span className={`text-[8px] font-bold uppercase ${colors.text}`}>{level} RISK</span>
    </div>
  );
}

export function BundleChecker({ mint }: BundleCheckerProps) {
  const [tab, setTab] = useState<BundleTab>("overview");

  const { data, isLoading } = useQuery({
    queryKey: ["tokenBundles", mint],
    queryFn: () => api.market.getTokenBundles(mint),
    enabled: !!mint,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const bundles = data as BundleInfo | undefined;
  const sniperInfo = bundles?.sniperInfo;

  return (
    <div className="overflow-hidden">
      {isLoading ? (
        <div className="px-3 py-4">
          <div className="h-4 bg-bg-tertiary rounded animate-pulse mb-2" />
          <div className="h-4 bg-bg-tertiary rounded animate-pulse w-3/4 mb-2" />
          <div className="h-4 bg-bg-tertiary rounded animate-pulse w-1/2" />
        </div>
      ) : !bundles ? (
        <div className="text-center text-text-muted text-[10px] py-6">No bundle data available</div>
      ) : (
        <>
          {/* Sub-tabs */}
          <div className="flex border-b border-border/40">
            {(["overview", "bundles", "snipers"] as BundleTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-1.5 text-[9px] font-semibold uppercase tracking-wider transition-colors ${
                  tab === t
                    ? "text-accent-green border-b border-accent-green/50 bg-bg-card"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {t === "overview" ? "Overview" : t === "bundles" ? `Bundles (${bundles.bundleCount})` : `Snipers (${sniperInfo?.sniperCount || 0})`}
              </button>
            ))}
          </div>

          {/* Overview tab */}
          {tab === "overview" && (
            <div className="p-3">
              {/* Risk Score + Status */}
              <div className="flex items-center justify-between mb-3">
                <RiskGauge score={bundles.riskScore} level={bundles.riskLevel || "low"} />
                <div className="flex flex-col gap-1.5 text-right">
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="text-[9px] text-text-muted">Bundle Status</span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${bundles.bundled ? "bg-accent-red/15 text-accent-red" : "bg-accent-green/15 text-accent-green"}`}>
                      {bundles.bundled ? "BUNDLED" : "CLEAN"}
                    </span>
                  </div>
                  {sniperInfo && (
                    <div className="flex items-center gap-1.5 justify-end">
                      <span className="text-[9px] text-text-muted">Sniper Status</span>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${sniperInfo.hasSnipers ? "bg-accent-orange/15 text-accent-orange" : "bg-accent-green/15 text-accent-green"}`}>
                        {sniperInfo.hasSnipers ? `${sniperInfo.sniperCount} DETECTED` : "NONE"}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col p-2 rounded bg-bg-tertiary/30">
                  <span className="text-[8px] text-text-muted uppercase">Bundles</span>
                  <span className="text-[11px] font-mono font-semibold text-text-primary">{bundles.bundleCount}</span>
                </div>
                <div className="flex flex-col p-2 rounded bg-bg-tertiary/30">
                  <span className="text-[8px] text-text-muted uppercase">Bundle %</span>
                  <span className={`text-[11px] font-mono font-semibold ${bundles.bundlePercentage > 20 ? "text-accent-red" : bundles.bundlePercentage > 5 ? "text-accent-yellow" : "text-text-primary"}`}>
                    {bundles.bundlePercentage.toFixed(2)}%
                  </span>
                </div>
                <div className="flex flex-col p-2 rounded bg-bg-tertiary/30">
                  <span className="text-[8px] text-text-muted uppercase">Snipers</span>
                  <span className="text-[11px] font-mono font-semibold text-text-primary">{sniperInfo?.sniperCount || 0}</span>
                </div>
                <div className="flex flex-col p-2 rounded bg-bg-tertiary/30">
                  <span className="text-[8px] text-text-muted uppercase">Sniper %</span>
                  <span className={`text-[11px] font-mono font-semibold ${(sniperInfo?.sniperPercentage || 0) > 10 ? "text-accent-red" : "text-text-primary"}`}>
                    {(sniperInfo?.sniperPercentage || 0).toFixed(2)}%
                  </span>
                </div>
                {bundles.totalBalance > 0 && (
                  <div className="flex flex-col p-2 rounded bg-bg-tertiary/30 col-span-2">
                    <span className="text-[8px] text-text-muted uppercase">Total Bundled Balance</span>
                    <span className="text-[11px] font-mono font-semibold text-text-primary">{formatCompact(bundles.totalBalance)}</span>
                  </div>
                )}
              </div>

              {/* Risk warning */}
              {bundles.riskLevel === "high" || bundles.riskLevel === "critical" ? (
                <div className="mt-2 flex items-center gap-2 p-2 rounded bg-accent-red/5 border border-accent-red/20">
                  <svg className="w-4 h-4 text-accent-red flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  <span className="text-[9px] text-accent-red">
                    High risk detected. Exercise extreme caution with this token.
                  </span>
                </div>
              ) : null}
            </div>
          )}

          {/* Bundles tab */}
          {tab === "bundles" && (
            <div className="max-h-[200px] overflow-y-auto scrollbar-thin">
              {bundles.details.length === 0 ? (
                <div className="text-center text-text-muted text-[10px] py-6">No bundles detected</div>
              ) : (
                <>
                  <div className="flex items-center gap-2 px-3 py-1 text-[9px] text-text-muted uppercase tracking-wide border-b border-border/40 sticky top-0 bg-bg-card z-10">
                    <span className="flex-1">Wallet</span>
                    <span className="w-[60px] text-right">Balance</span>
                    <span className="w-[45px] text-right">%</span>
                    <span className="w-[55px] text-right">Time</span>
                  </div>
                  {bundles.details.map((detail, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border-b border-border/40 hover:bg-bg-tertiary/40 transition-colors group">
                      <div className="flex-1 flex items-center gap-1 min-w-0">
                        <a
                          href={`https://solscan.io/account/${detail.wallet}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-text-secondary hover:text-accent-blue text-[10px] truncate transition-colors"
                          title={detail.wallet}
                        >
                          {shortenAddress(detail.wallet, 4)}
                        </a>
                        {detail.percentage > 10 && (
                          <span className="text-[7px] px-1 py-0.5 rounded bg-accent-red/15 text-accent-red font-bold">HIGH</span>
                        )}
                      </div>
                      <span className="w-[60px] text-right text-[10px] text-text-secondary">
                        {formatCompact(detail.balance)}
                      </span>
                      <span className={`w-[45px] text-right text-[10px] font-semibold ${detail.percentage > 10 ? "text-accent-red" : "text-text-secondary"}`}>
                        {detail.percentage.toFixed(2)}%
                      </span>
                      <span className="w-[55px] text-right text-[9px] text-text-muted">
                        {detail.bundleTime > 0
                          ? new Date(detail.bundleTime > 1e12 ? detail.bundleTime : detail.bundleTime * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                          : "—"}
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Snipers tab */}
          {tab === "snipers" && (
            <div className="max-h-[200px] overflow-y-auto scrollbar-thin">
              {!sniperInfo || sniperInfo.snipers.length === 0 ? (
                <div className="text-center text-text-muted text-[10px] py-6">
                  <div className="flex flex-col items-center gap-2">
                    <svg className="w-6 h-6 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                    <span>No snipers detected</span>
                  </div>
                </div>
              ) : (
                <>
                  {/* Sniper summary */}
                  <div className="px-3 py-2 border-b border-border/40 bg-accent-orange/5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-accent-orange font-semibold">
                        {sniperInfo.sniperCount} sniper(s) detected holding {sniperInfo.sniperPercentage.toFixed(1)}% of supply
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 px-3 py-1 text-[9px] text-text-muted uppercase tracking-wide border-b border-border/40 sticky top-0 bg-bg-card z-10">
                    <span className="flex-1">Wallet</span>
                    <span className="w-[50px] text-right">Bought</span>
                    <span className="w-[40px] text-right">%</span>
                    <span className="w-[40px] text-right">Delay</span>
                  </div>
                  {sniperInfo.snipers.map((sniper, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border-b border-border/40 hover:bg-bg-tertiary/40 transition-colors group">
                      <div className="flex-1 flex items-center gap-1 min-w-0">
                        <a
                          href={`https://solscan.io/account/${sniper.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-text-secondary hover:text-accent-blue text-[10px] truncate transition-colors"
                          title={sniper.address}
                        >
                          {shortenAddress(sniper.address, 4)}
                        </a>
                        <span className="text-[7px] px-1 py-0.5 rounded bg-accent-orange/15 text-accent-orange font-bold flex-shrink-0">
                          SNIPER
                        </span>
                      </div>
                      <span className="w-[50px] text-right text-[10px] text-text-secondary">
                        {formatCompact(sniper.amountUsd)}
                      </span>
                      <span className={`w-[40px] text-right text-[10px] font-semibold ${sniper.percentage > 5 ? "text-accent-red" : "text-text-secondary"}`}>
                        {sniper.percentage.toFixed(1)}%
                      </span>
                      <span className="w-[40px] text-right text-[9px] text-text-muted">
                        {sniper.blockOffset}s
                      </span>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
