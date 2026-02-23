"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, TokenInfo } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatUSD, formatPrice } from "@/lib/format";

interface OrderPanelProps {
  token: TokenInfo;
  usdcBalance: number;
  tokenQty: number;
}

export function OrderPanel({ token, usdcBalance, tokenQty }: OrderPanelProps) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const estimatedSlippage = 0.15;
  const fee = parseFloat(amount || "0") * 0.001;
  const estimatedQty = side === "buy"
    ? (parseFloat(amount || "0") - fee) / (token.price * (1 + estimatedSlippage / 100))
    : parseFloat(amount || "0");
  const estimatedCost = side === "sell"
    ? parseFloat(amount || "0") * token.price * (1 - estimatedSlippage / 100) - fee
    : 0;

  const tradeMutation = useMutation({
    mutationFn: () => api.trade.execute(token.mint, parseFloat(amount), side),
    onSuccess: (result) => {
      setSuccess(`${side === "buy" ? "Bought" : "Sold"} ${result.qty.toFixed(4)} ${token.symbol} @ ${formatPrice(result.price)}`);
      setAmount("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["orderbook", token.mint] });
      setTimeout(() => setSuccess(null), 5000);
    },
    onError: (err: Error) => {
      setError(err.message);
      setSuccess(null);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const val = parseFloat(amount);
    if (!val || val <= 0) {
      setError("Enter a valid amount");
      return;
    }
    if (side === "buy" && val > usdcBalance) {
      setError("Insufficient USDC balance");
      return;
    }
    if (side === "sell" && val > tokenQty) {
      setError("Insufficient token balance");
      return;
    }
    tradeMutation.mutate();
  }

  return (
    <div className="rounded-lg border border-border bg-bg-secondary p-4">
      <h3 className="text-sm font-bold mb-3">Order Entry</h3>

      {/* Side Tabs */}
      <div className="flex gap-1 mb-4">
        <button
          onClick={() => setSide("buy")}
          className={`flex-1 py-2 rounded-md text-sm font-bold transition-colors ${
            side === "buy"
              ? "bg-accent-green/20 text-accent-green border border-accent-green/40"
              : "bg-bg-tertiary text-text-muted hover:text-text-secondary"
          }`}
          aria-pressed={side === "buy"}
        >
          Buy
        </button>
        <button
          onClick={() => setSide("sell")}
          className={`flex-1 py-2 rounded-md text-sm font-bold transition-colors ${
            side === "sell"
              ? "bg-accent-red/20 text-accent-red border border-accent-red/40"
              : "bg-bg-tertiary text-text-muted hover:text-text-secondary"
          }`}
          aria-pressed={side === "sell"}
        >
          Sell
        </button>
      </div>

      {/* Balance Info */}
      <div className="flex justify-between text-xs text-text-muted mb-3">
        <span>Paper USDC: {formatUSD(usdcBalance)}</span>
        <span>{token.symbol}: {tokenQty.toFixed(4)}</span>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Amount Input */}
        <div className="mb-3">
          <label className="text-xs text-text-muted mb-1 block">
            Amount ({side === "buy" ? "USDC" : token.symbol})
          </label>
          <input
            type="number"
            step="any"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-md border border-border bg-bg-tertiary px-3 py-2 text-sm font-mono outline-none focus:border-accent-blue"
            aria-label={`Amount in ${side === "buy" ? "USDC" : token.symbol}`}
            disabled={!isAuthenticated}
          />
          {/* Quick fill buttons */}
          <div className="flex gap-1 mt-1">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => {
                  const max = side === "buy" ? usdcBalance : tokenQty;
                  setAmount(((max * pct) / 100).toFixed(side === "buy" ? 2 : 6));
                }}
                className="flex-1 text-xs py-1 bg-bg-tertiary rounded text-text-muted hover:text-text-primary transition-colors"
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* Estimates */}
        <div className="space-y-1 mb-3 text-xs text-text-muted">
          <div className="flex justify-between">
            <span>Price</span>
            <span className="font-mono">{formatPrice(token.price)}</span>
          </div>
          <div className="flex justify-between">
            <span>Est. Slippage</span>
            <span className="font-mono">~{estimatedSlippage}%</span>
          </div>
          <div className="flex justify-between">
            <span>Fee (0.1%)</span>
            <span className="font-mono">{formatUSD(fee)}</span>
          </div>
          {side === "buy" && parseFloat(amount || "0") > 0 && (
            <div className="flex justify-between text-text-secondary">
              <span>Est. Receive</span>
              <span className="font-mono">{estimatedQty.toFixed(6)} {token.symbol}</span>
            </div>
          )}
          {side === "sell" && parseFloat(amount || "0") > 0 && (
            <div className="flex justify-between text-text-secondary">
              <span>Est. Receive</span>
              <span className="font-mono">{formatUSD(estimatedCost)}</span>
            </div>
          )}
        </div>

        {error && <div className="text-xs text-accent-red mb-2" role="alert">{error}</div>}
        {success && <div className="text-xs text-accent-green mb-2" role="status">{success}</div>}

        <button
          type="submit"
          disabled={!isAuthenticated || tradeMutation.isPending}
          className={`w-full py-2.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            side === "buy"
              ? "bg-accent-green text-bg-primary hover:bg-accent-green/90"
              : "bg-accent-red text-white hover:bg-accent-red/90"
          }`}
        >
          {tradeMutation.isPending
            ? "Processing..."
            : !isAuthenticated
            ? "Connect Wallet"
            : `${side === "buy" ? "Buy" : "Sell"} ${token.symbol}`}
        </button>
      </form>
    </div>
  );
}
