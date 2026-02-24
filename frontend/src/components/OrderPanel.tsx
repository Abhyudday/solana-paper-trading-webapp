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

const PRESET_AMOUNTS = [10, 25, 50, 100];

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
    <div className="rounded border border-border bg-bg-card p-3">
      {/* Buy / Sell Tabs */}
      <div className="flex gap-0.5 mb-3">
        <button
          onClick={() => setSide("buy")}
          className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${
            side === "buy"
              ? "bg-accent-green text-black"
              : "bg-bg-tertiary text-text-muted hover:text-text-secondary"
          }`}
          aria-pressed={side === "buy"}
        >
          Buy
        </button>
        <button
          onClick={() => setSide("sell")}
          className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${
            side === "sell"
              ? "bg-accent-red text-white"
              : "bg-bg-tertiary text-text-muted hover:text-text-secondary"
          }`}
          aria-pressed={side === "sell"}
        >
          Sell
        </button>
      </div>

      {/* Market label */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] font-semibold text-text-primary bg-bg-tertiary px-2 py-0.5 rounded">Market</span>
        <span className="text-[10px] text-text-muted ml-auto">Bal: {side === "buy" ? formatUSD(usdcBalance) : `${tokenQty.toFixed(4)} ${token.symbol}`}</span>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Amount Input */}
        <div className="mb-2">
          <div className="flex items-center border border-border rounded bg-bg-tertiary overflow-hidden">
            <input
              type="number"
              step="any"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent px-2.5 py-2 text-xs font-mono outline-none text-text-primary"
              aria-label={`Amount in ${side === "buy" ? "USDC" : token.symbol}`}
              disabled={!isAuthenticated}
            />
            <span className="text-[10px] text-text-muted px-2">{side === "buy" ? "USDC" : token.symbol}</span>
          </div>
        </div>

        {/* Preset amount buttons */}
        <div className="flex gap-1 mb-3">
          {side === "buy" ? (
            PRESET_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setAmount(String(amt))}
                className={`flex-1 text-[10px] py-1 rounded font-medium transition-colors ${
                  amount === String(amt) ? "bg-accent-green/20 text-accent-green" : "bg-bg-tertiary text-text-muted hover:text-text-secondary"
                }`}
              >
                ${amt}
              </button>
            ))
          ) : (
            [10, 25, 50, 100].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => setAmount(((tokenQty * pct) / 100).toFixed(6))}
                className="flex-1 text-[10px] py-1 bg-bg-tertiary rounded text-text-muted hover:text-text-secondary font-medium transition-colors"
              >
                {pct}%
              </button>
            ))
          )}
        </div>

        {/* Estimates */}
        <div className="space-y-1 mb-3 text-[10px] text-text-muted border-t border-border pt-2">
          <div className="flex justify-between">
            <span>Price</span>
            <span className="font-mono text-text-secondary">{formatPrice(token.price)}</span>
          </div>
          <div className="flex justify-between">
            <span>Est. Slippage</span>
            <span className="font-mono text-text-secondary">~{estimatedSlippage}%</span>
          </div>
          <div className="flex justify-between">
            <span>Fee (0.1%)</span>
            <span className="font-mono text-text-secondary">{formatUSD(fee)}</span>
          </div>
          {side === "buy" && parseFloat(amount || "0") > 0 && (
            <div className="flex justify-between">
              <span>Est. Receive</span>
              <span className="font-mono text-accent-green">{estimatedQty.toFixed(6)} {token.symbol}</span>
            </div>
          )}
          {side === "sell" && parseFloat(amount || "0") > 0 && (
            <div className="flex justify-between">
              <span>Est. Receive</span>
              <span className="font-mono text-accent-green">{formatUSD(estimatedCost)}</span>
            </div>
          )}
        </div>

        {error && <div className="text-[10px] text-accent-red mb-2 px-1" role="alert">{error}</div>}
        {success && <div className="text-[10px] text-accent-green mb-2 px-1" role="status">{success}</div>}

        <button
          type="submit"
          disabled={!isAuthenticated || tradeMutation.isPending}
          className={`w-full py-2 rounded text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            side === "buy"
              ? "bg-accent-green text-black hover:bg-accent-green/90"
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
