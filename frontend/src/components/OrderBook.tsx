"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatPrice, formatNumber } from "@/lib/format";

interface OrderBookProps {
  mint: string;
}

export function OrderBook({ mint }: OrderBookProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["orderbook", mint],
    queryFn: () => api.market.getOrderBook(mint),
    refetchInterval: 5000,
  });

  if (isLoading || !data) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-4">
        <h3 className="text-sm font-bold mb-3">Order Book</h3>
        <div className="text-xs text-text-muted text-center py-8">Loading...</div>
      </div>
    );
  }

  const maxQty = Math.max(
    ...data.bids.map((b) => b.qty),
    ...data.asks.map((a) => a.qty)
  );

  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold">Order Book</h3>
        <span className="text-xs text-text-muted">
          Spread: {formatPrice(data.spread)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Bids */}
        <div>
          <div className="flex justify-between text-xs text-text-muted mb-1 px-1">
            <span>Price</span>
            <span>Qty</span>
          </div>
          <div className="space-y-px">
            {data.bids.slice(0, 12).map((bid, i) => (
              <div key={i} className="relative flex justify-between text-xs font-mono px-1 py-0.5">
                <div
                  className="absolute inset-0 bg-accent-green/10 rounded-sm"
                  style={{ width: `${(bid.qty / maxQty) * 100}%` }}
                />
                <span className="relative text-accent-green">{formatPrice(bid.price)}</span>
                <span className="relative text-text-secondary">{formatNumber(bid.qty, 0)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Asks */}
        <div>
          <div className="flex justify-between text-xs text-text-muted mb-1 px-1">
            <span>Price</span>
            <span>Qty</span>
          </div>
          <div className="space-y-px">
            {data.asks.slice(0, 12).map((ask, i) => (
              <div key={i} className="relative flex justify-between text-xs font-mono px-1 py-0.5">
                <div
                  className="absolute inset-0 right-0 bg-accent-red/10 rounded-sm"
                  style={{ width: `${(ask.qty / maxQty) * 100}%`, marginLeft: "auto" }}
                />
                <span className="relative text-accent-red">{formatPrice(ask.price)}</span>
                <span className="relative text-text-secondary">{formatNumber(ask.qty, 0)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="text-center mt-3 text-xs text-text-muted">
        Mid: {formatPrice(data.midPrice)}
      </div>
    </div>
  );
}
