"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, TokenInfo, LimitOrderResult } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatUSD, formatPrice } from "@/lib/format";

interface OrderPanelProps {
  token: TokenInfo;
  usdcBalance: number;
  tokenQty: number;
}

type OrderMode = "market" | "limit" | "stop_loss" | "take_profit";
const PRESET_AMOUNTS = [10, 25, 50, 100];

const ORDER_MODES: { key: OrderMode; label: string }[] = [
  { key: "market", label: "Market" },
  { key: "limit", label: "Limit" },
  { key: "stop_loss", label: "Stop Loss" },
  { key: "take_profit", label: "TP" },
];

export function OrderPanel({ token, usdcBalance, tokenQty }: OrderPanelProps) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderMode, setOrderMode] = useState<OrderMode>("market");
  const [amount, setAmount] = useState("");
  const [triggerPrice, setTriggerPrice] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: ordersData } = useQuery({
    queryKey: ["limitOrders", "open"],
    queryFn: () => api.orders.getAll("open"),
    enabled: isAuthenticated,
    refetchInterval: 10_000,
  });

  const openOrders = (ordersData?.orders || []).filter((o) => o.mint === token.mint);

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

  const limitMutation = useMutation({
    mutationFn: () =>
      api.orders.create({
        mint: token.mint,
        side,
        orderType: orderMode as "limit" | "stop_loss" | "take_profit",
        qty: parseFloat(amount),
        triggerPrice: parseFloat(triggerPrice),
        note: note || undefined,
      }),
    onSuccess: (result) => {
      const typeLabel = orderMode === "limit" ? "Limit" : orderMode === "stop_loss" ? "Stop Loss" : "Take Profit";
      setSuccess(`${typeLabel} ${side} order placed @ ${formatPrice(result.triggerPrice)}`);
      setAmount("");
      setTriggerPrice("");
      setNote("");
      setError(null);
      queryClient.invalidateQueries({ queryKey: ["limitOrders"] });
      setTimeout(() => setSuccess(null), 5000);
    },
    onError: (err: Error) => {
      setError(err.message);
      setSuccess(null);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => api.orders.cancel(orderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["limitOrders"] });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (orderMode === "market") {
      const val = parseFloat(amount);
      if (!val || val <= 0) { setError("Enter a valid amount"); return; }
      if (side === "buy" && val > usdcBalance) { setError("Insufficient USDC balance"); return; }
      if (side === "sell" && val > tokenQty) { setError("Insufficient token balance"); return; }
      tradeMutation.mutate();
    } else {
      const qty = parseFloat(amount);
      const price = parseFloat(triggerPrice);
      if (!qty || qty <= 0) { setError("Enter a valid quantity"); return; }
      if (!price || price <= 0) { setError("Enter a valid trigger price"); return; }
      limitMutation.mutate();
    }
  }

  const isPending = tradeMutation.isPending || limitMutation.isPending;
  const isLimitMode = orderMode !== "market";

  return (
    <div className="rounded border border-border bg-bg-card p-3">
      {/* Buy / Sell Tabs */}
      <div className="flex gap-0.5 mb-2">
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

      {/* Order type selector */}
      <div className="flex gap-0.5 mb-2 p-0.5 bg-bg-tertiary/50 rounded">
        {ORDER_MODES.map((mode) => (
          <button
            key={mode.key}
            onClick={() => setOrderMode(mode.key)}
            className={`flex-1 py-1 rounded text-[9px] font-semibold transition-colors ${
              orderMode === mode.key
                ? "bg-bg-card text-text-primary shadow-sm"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* Balance display */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[10px] text-text-muted ml-auto">
          Bal: {side === "buy" ? formatUSD(usdcBalance) : `${tokenQty.toFixed(4)} ${token.symbol}`}
        </span>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Trigger Price (for limit orders) */}
        {isLimitMode && (
          <div className="mb-2">
            <label className="text-[9px] text-text-muted uppercase tracking-wider mb-1 block">
              {orderMode === "limit" ? "Limit Price" : orderMode === "stop_loss" ? "Stop Price" : "Take Profit Price"}
            </label>
            <div className="flex items-center border border-border rounded bg-bg-tertiary overflow-hidden">
              <input
                type="number"
                step="any"
                min="0"
                value={triggerPrice}
                onChange={(e) => setTriggerPrice(e.target.value)}
                placeholder={formatPrice(token.price)}
                className="flex-1 bg-transparent px-2.5 py-2 text-xs font-mono outline-none text-text-primary"
                aria-label="Trigger price"
                disabled={!isAuthenticated}
              />
              <span className="text-[10px] text-text-muted px-2">USD</span>
            </div>
            <button
              type="button"
              onClick={() => setTriggerPrice(String(token.price))}
              className="text-[9px] text-accent-blue hover:underline mt-0.5"
            >
              Use current price
            </button>
          </div>
        )}

        {/* Amount Input */}
        <div className="mb-2">
          {isLimitMode && (
            <label className="text-[9px] text-text-muted uppercase tracking-wider mb-1 block">
              {side === "buy" ? "Quantity (tokens)" : "Quantity (tokens)"}
            </label>
          )}
          <div className="flex items-center border border-border rounded bg-bg-tertiary overflow-hidden">
            <input
              type="number"
              step="any"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent px-2.5 py-2 text-xs font-mono outline-none text-text-primary"
              aria-label={`Amount in ${!isLimitMode && side === "buy" ? "USDC" : token.symbol}`}
              disabled={!isAuthenticated}
            />
            <span className="text-[10px] text-text-muted px-2">
              {!isLimitMode && side === "buy" ? "USDC" : isLimitMode ? token.symbol : token.symbol}
            </span>
          </div>
        </div>

        {/* Preset amount buttons */}
        <div className="flex gap-1 mb-2">
          {!isLimitMode && side === "buy" ? (
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
                onClick={() => {
                  if (isLimitMode) {
                    setAmount(((tokenQty * pct) / 100).toFixed(6));
                  } else {
                    setAmount(((tokenQty * pct) / 100).toFixed(6));
                  }
                }}
                className="flex-1 text-[10px] py-1 bg-bg-tertiary rounded text-text-muted hover:text-text-secondary font-medium transition-colors"
              >
                {pct}%
              </button>
            ))
          )}
        </div>

        {/* Note input for limit orders */}
        {isLimitMode && (
          <div className="mb-2">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)"
              className="w-full bg-bg-tertiary border border-border rounded px-2.5 py-1.5 text-[10px] font-mono outline-none text-text-primary placeholder:text-text-muted/50"
              maxLength={500}
            />
          </div>
        )}

        {/* Estimates */}
        <div className="space-y-1 mb-3 text-[10px] text-text-muted border-t border-border pt-2">
          <div className="flex justify-between">
            <span>Price</span>
            <span className="font-mono text-text-secondary">{formatPrice(token.price)}</span>
          </div>
          {!isLimitMode && (
            <>
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
            </>
          )}
          {isLimitMode && parseFloat(amount || "0") > 0 && parseFloat(triggerPrice || "0") > 0 && (
            <div className="flex justify-between">
              <span>Est. Total</span>
              <span className="font-mono text-text-secondary">
                {formatUSD(parseFloat(amount) * parseFloat(triggerPrice))}
              </span>
            </div>
          )}
        </div>

        {error && <div className="text-[10px] text-accent-red mb-2 px-1" role="alert">{error}</div>}
        {success && <div className="text-[10px] text-accent-green mb-2 px-1" role="status">{success}</div>}

        <button
          type="submit"
          disabled={!isAuthenticated || isPending}
          className={`w-full py-2 rounded text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            side === "buy"
              ? "bg-accent-green text-black hover:bg-accent-green/90"
              : "bg-accent-red text-white hover:bg-accent-red/90"
          }`}
        >
          {isPending
            ? "Processing..."
            : !isAuthenticated
            ? "Connect Wallet"
            : isLimitMode
            ? `Place ${orderMode === "limit" ? "Limit" : orderMode === "stop_loss" ? "Stop Loss" : "Take Profit"} ${side === "buy" ? "Buy" : "Sell"}`
            : `${side === "buy" ? "Buy" : "Sell"} ${token.symbol}`}
        </button>
      </form>

      {/* Open orders for this token */}
      {openOrders.length > 0 && (
        <div className="mt-3 pt-2 border-t border-border">
          <div className="text-[9px] text-text-muted uppercase tracking-wider mb-1.5 font-semibold">Open Orders</div>
          <div className="space-y-1 max-h-[120px] overflow-y-auto scrollbar-thin">
            {openOrders.map((order) => (
              <div key={order.id} className="flex items-center gap-2 py-1 px-1.5 rounded bg-bg-tertiary/50 text-[9px]">
                <span className={`font-bold ${order.side === "buy" ? "text-accent-green" : "text-accent-red"}`}>
                  {order.side.toUpperCase()}
                </span>
                <span className="text-text-muted">
                  {order.orderType === "limit" ? "Limit" : order.orderType === "stop_loss" ? "SL" : "TP"}
                </span>
                <span className="font-mono text-text-secondary">{order.qty.toFixed(4)}</span>
                <span className="text-text-muted">@</span>
                <span className="font-mono text-text-secondary">{formatPrice(order.triggerPrice)}</span>
                <button
                  onClick={() => cancelMutation.mutate(order.id)}
                  disabled={cancelMutation.isPending}
                  className="ml-auto text-accent-red/70 hover:text-accent-red text-[8px] font-semibold"
                >
                  Cancel
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
