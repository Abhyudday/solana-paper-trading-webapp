"use client";

import { useQuery } from "@tanstack/react-query";
import { api, BundleInfo } from "@/lib/api";
import { shortenAddress } from "@/lib/format";

interface BundleCheckerProps {
  mint: string;
}

export function BundleChecker({ mint }: BundleCheckerProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["tokenBundles", mint],
    queryFn: () => api.market.getTokenBundles(mint),
    enabled: !!mint,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const bundles = data as BundleInfo | undefined;

  return (
    <div className="rounded border border-border bg-bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-bg-secondary">
        <h3 className="text-[10px] font-semibold text-text-muted uppercase tracking-wider">Bundle Checker</h3>
        {bundles && (
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${bundles.bundled ? "bg-accent-red/15 text-accent-red" : "bg-accent-green/15 text-accent-green"}`}>
            {bundles.bundled ? "BUNDLED" : "CLEAN"}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="px-3 py-4">
          <div className="h-4 bg-bg-tertiary rounded animate-pulse mb-2" />
          <div className="h-4 bg-bg-tertiary rounded animate-pulse w-3/4" />
        </div>
      ) : !bundles ? (
        <div className="text-center text-text-muted text-[10px] py-6">No bundle data available</div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-2 px-3 py-2 border-b border-border/40">
            <div className="flex flex-col">
              <span className="text-[9px] text-text-muted">Status</span>
              <span className={`text-[11px] font-semibold ${bundles.bundled ? "text-accent-red" : "text-accent-green"}`}>
                {bundles.bundled ? "Bundled" : "Not Bundled"}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] text-text-muted">Bundles</span>
              <span className="text-[11px] font-mono font-semibold text-text-primary">{bundles.bundleCount}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[9px] text-text-muted">Total %</span>
              <span className={`text-[11px] font-mono font-semibold ${bundles.bundlePercentage > 20 ? "text-accent-red" : bundles.bundlePercentage > 5 ? "text-accent-yellow" : "text-text-primary"}`}>
                {bundles.bundlePercentage.toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Risk indicator */}
          {bundles.bundled && (
            <div className="px-3 py-2 border-b border-border/40">
              <div className="flex items-center gap-2 p-2 rounded bg-accent-red/5 border border-accent-red/20">
                <svg className="w-4 h-4 text-accent-red flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <span className="text-[10px] text-accent-red">
                  Bundle activity detected. {bundles.bundlePercentage.toFixed(1)}% of supply held by {bundles.bundleCount} bundle(s).
                </span>
              </div>
            </div>
          )}

          {/* Bundle details */}
          {bundles.details.length > 0 && (
            <div className="max-h-[180px] overflow-y-auto scrollbar-thin">
              <div className="flex items-center gap-2 px-3 py-1 text-[9px] text-text-muted uppercase tracking-wide border-b border-border/40 sticky top-0 bg-bg-card">
                <span className="flex-1">Wallet</span>
                <span className="w-[50px] text-right">%</span>
                <span className="w-[60px] text-right">TX</span>
              </div>
              {bundles.details.map((detail, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs font-mono border-b border-border/40 hover:bg-bg-tertiary/40 transition-colors">
                  <span className="flex-1 text-text-secondary text-[10px] truncate">
                    {shortenAddress(detail.wallet, 4)}
                  </span>
                  <span className={`w-[50px] text-right text-[10px] font-semibold ${detail.percentage > 10 ? "text-accent-red" : "text-text-secondary"}`}>
                    {detail.percentage.toFixed(2)}%
                  </span>
                  <a
                    href={`https://solscan.io/tx/${detail.tx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-[60px] text-right text-[10px] text-accent-blue hover:underline"
                  >
                    {shortenAddress(detail.tx, 3)}
                  </a>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
