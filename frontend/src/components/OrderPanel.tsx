"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, TokenInfo, LimitOrderResult, clearResponseCache } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatUSD, formatPrice, formatCompact } from "@/lib/format";

interface OrderPanelProps {
  token: TokenInfo;
  usdcBalance: number;
  tokenQty: number;
  avgEntryPrice?: number;
  portfolioLoading?: boolean;
}

type OrderMode = "market" | "limit" | "stop_loss" | "take_profit";
type TriggerMode = "price" | "pnl_percent" | "market_cap";
const PRESET_AMOUNTS = [10, 25, 50, 100];

const ORDER_MODES: { key: OrderMode; label: string }[] = [
  { key: "market", label: "Market" },
  { key: "limit", label: "Limit" },
  { key: "stop_loss", label: "Stop Loss" },
  { key: "take_profit", label: "TP" },
];

export function OrderPanel({ token, usdcBalance, tokenQty, avgEntryPrice, portfolioLoading }: OrderPanelProps) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [orderMode, setOrderMode] = useState<OrderMode>("market");
  const [triggerMode, setTriggerMode] = useState<TriggerMode>("price");
  const [amount, setAmount] = useState("");
  const [triggerPrice, setTriggerPrice] = useState("");
  const [pnlPercent, setPnlPercent] = useState("");
  const [targetMarketCap, setTargetMarketCap] = useState("");
  const [mcapUsdcAmount, setMcapUsdcAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const { data: ordersData } = useQuery({
    queryKey: ["limitOrders", "open"],
    queryFn: () => api.orders.getAll("open"),
    enabled: isAuthenticated,
    refetchInterval: 20_000,
    staleTime: 10_000,
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
      // Clear the response cache so next fetch gets fresh server data
      clearResponseCache("/api/portfolio");
      clearResponseCache("/api/trades");
      queryClient.invalidateQueries({ queryKey: ["portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["userTrades"] });
      queryClient.invalidateQueries({ queryKey: ["trades"] });
      queryClient.invalidateQueries({ queryKey: ["orderbook", token.mint] });
      setTimeout(() => setSuccess(null), 5000);
    },
    onError: (err: Error) => {
      setError(err.message);
      setSuccess(null);
    },
  });

  const limitMutation = useMutation({
    mutationFn: () => {
      const params: import("@/lib/api").CreateLimitOrderParams = {
        mint: token.mint,
        side,
        orderType: orderMode as "limit" | "stop_loss" | "take_profit",
        qty: triggerMode === "market_cap" ? 0 : parseFloat(amount),
        triggerPrice: triggerMode === "pnl_percent" ? 0 : parseFloat(triggerPrice || "0"),
        triggerType: triggerMode,
        note: note || undefined,
      };
      if (triggerMode === "pnl_percent") {
        params.triggerPnlPercent = parseFloat(pnlPercent);
        params.qty = parseFloat(amount);
      }
      if (triggerMode === "market_cap") {
        params.triggerMarketCap = parseFloat(targetMarketCap);
        params.usdcAmount = parseFloat(mcapUsdcAmount);
      }
      return api.orders.create(params);
    },
    onSuccess: () => {
      const typeLabel = orderMode === "limit" ? "Limit" : orderMode === "stop_loss" ? "Stop Loss" : "Take Profit";
      const modeLabel = triggerMode === "pnl_percent" ? ` (PnL ${pnlPercent}%)` : triggerMode === "market_cap" ? ` (MCap ${formatCompact(parseFloat(targetMarketCap || "0"))})` : "";
      setSuccess(`${typeLabel} ${side} order placed${modeLabel}`);
      setAmount(""); setTriggerPrice(""); setPnlPercent(""); setTargetMarketCap(""); setMcapUsdcAmount(""); setNote("");
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

    if (portfolioLoading) {
      setError("Loading portfolio data...");
      return;
    }

    if (orderMode === "market") {
      const val = parseFloat(amount);
      if (!val || val <= 0) { setError("Enter a valid amount"); return; }
      if (side === "buy" && val > usdcBalance) { setError("Insufficient USDC balance"); return; }
      if (side === "sell" && val > tokenQty + 0.000001) { setError(`Insufficient token balance (have ${tokenQty.toFixed(6)})`); return; }
      tradeMutation.mutate();
    } else {
      if (triggerMode === "pnl_percent") {
        const pct = parseFloat(pnlPercent);
        if (isNaN(pct)) { setError("Enter a valid PnL %"); return; }
        const qty = parseFloat(amount);
        if (!qty || qty <= 0) { setError("Enter a valid quantity"); return; }
      } else if (triggerMode === "market_cap") {
        const mcap = parseFloat(targetMarketCap);
        const usdc = parseFloat(mcapUsdcAmount);
        if (!mcap || mcap <= 0) { setError("Enter a valid target market cap"); return; }
        if (side === "buy" && (!usdc || usdc <= 0)) { setError("Enter USDC amount to spend"); return; }
        if (side === "sell") {
          const qty = parseFloat(amount);
          if (!qty || qty <= 0) { setError("Enter a valid quantity"); return; }
        }
      } else {
        const qty = parseFloat(amount);
        const price = parseFloat(triggerPrice);
        if (!qty || qty <= 0) { setError("Enter a valid quantity"); return; }
        if (!price || price <= 0) { setError("Enter a valid trigger price"); return; }
      }
      limitMutation.mutate();
    }
  }

  const isPending = tradeMutation.isPending || limitMutation.isPending;
  const isLimitMode = orderMode !== "market";

  return (
    <div className="rounded-xl border border-white/10 bg-black/35 backdrop-blur p-3.5">
      {/* Buy / Sell Tabs */}
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => setSide("buy")}
          className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all duration-200 ${
            side === "buy"
              ? "bg-[#39FF14] text-black shadow-glow-sm"
              : "bg-white/[0.04] text-white/50 hover:text-white/70 border border-white/10"
          }`}
          aria-pressed={side === "buy"}
        >
          Buy
        </button>
        <button
          onClick={() => setSide("sell")}
          className={`flex-1 py-2 rounded-lg text-[11px] font-bold transition-all duration-200 ${
            side === "sell"
              ? "bg-accent-red text-white shadow-[0_0_15px_rgba(255,56,96,0.2)]"
              : "bg-white/[0.04] text-white/50 hover:text-white/70 border border-white/10"
          }`}
          aria-pressed={side === "sell"}
        >
          Sell
        </button>
      </div>

      {/* Order type selector */}
      <div className="flex gap-0.5 mb-3 p-0.5 bg-white/[0.03] rounded-lg border border-white/10">
        {ORDER_MODES.map((mode) => (
          <button
            key={mode.key}
            onClick={() => { setOrderMode(mode.key); if (mode.key === "market") setTriggerMode("price"); }}
            className={`flex-1 py-1.5 rounded-md text-[9px] font-bold transition-all ${
              orderMode === mode.key
                ? "bg-black/40 text-white shadow-sm border border-white/15"
                : "text-white/50 hover:text-white/70"
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {/* Trigger mode selector for SL/TP/Limit */}
      {isLimitMode && (
        <div className="flex gap-0.5 mb-3 p-0.5 bg-white/[0.02] rounded-lg border border-white/[0.06]">
          {(["price", ...(orderMode !== "limit" ? ["pnl_percent"] : []), "market_cap"] as TriggerMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setTriggerMode(mode)}
              className={`flex-1 py-1 rounded-md text-[8px] font-bold transition-all ${
                triggerMode === mode
                  ? "bg-[#4fc3f7]/10 text-[#4fc3f7] border border-[#4fc3f7]/20"
                  : "text-white/50 hover:text-white/70"
              }`}
            >
              {mode === "price" ? "Price" : mode === "pnl_percent" ? "PnL %" : "MCap"}
            </button>
          ))}
        </div>
      )}

      {/* Balance display */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-[9px] text-white/50 ml-auto font-mono">
          Bal: {portfolioLoading ? "Loading..." : (side === "buy" ? formatUSD(usdcBalance) : `${tokenQty.toFixed(4)} ${token.symbol}`)}
        </span>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Trigger Price (standard price mode) */}
        {isLimitMode && triggerMode === "price" && (
          <div className="mb-2.5">
            <label className="text-[8px] text-white/40 uppercase tracking-widest font-bold mb-1 block">
              {orderMode === "limit" ? "Limit Price" : orderMode === "stop_loss" ? "Stop Price" : "Take Profit Price"}
            </label>
            <div className="flex items-center border border-white/10 rounded-lg bg-white/[0.03] overflow-hidden">
              <input
                type="number"
                step="any"
                min="0"
                value={triggerPrice}
                onChange={(e) => setTriggerPrice(e.target.value)}
                placeholder={formatPrice(token.price)}
                className="flex-1 bg-transparent px-3 py-2 text-[11px] font-mono outline-none text-white"
                aria-label="Trigger price"
                />
              <span className="text-[9px] text-white/40 px-3 font-semibold">USD</span>
            </div>
            <button
              type="button"
              onClick={() => setTriggerPrice(String(token.price))}
              className="text-[9px] text-[#4fc3f7] hover:text-[#39FF14] mt-1 transition-colors font-semibold"
            >
              Use current price
            </button>
          </div>
        )}

        {/* PnL % trigger mode */}
        {isLimitMode && triggerMode === "pnl_percent" && (
          <div className="mb-2.5">
            <label className="text-[8px] text-white/40 uppercase tracking-widest font-bold mb-1 block">
              {orderMode === "stop_loss" ? "Stop Loss at PnL %" : "Take Profit at PnL %"}
            </label>
            <div className="flex items-center border border-white/10 rounded-lg bg-white/[0.03] overflow-hidden">
              <input
                type="number"
                step="any"
                value={pnlPercent}
                onChange={(e) => setPnlPercent(e.target.value)}
                placeholder={orderMode === "stop_loss" ? "-10" : "20"}
                className="flex-1 bg-transparent px-3 py-2 text-[11px] font-mono outline-none text-white"
                aria-label="PnL percentage"
              />
              <span className="text-[9px] text-white/40 px-3 font-semibold">%</span>
            </div>
            {avgEntryPrice && avgEntryPrice > 0 && (
              <div className="text-[8px] text-white/40 mt-1">
                Entry: {formatPrice(avgEntryPrice)} — triggers at {parseFloat(pnlPercent || "0") !== 0 ? formatPrice(avgEntryPrice * (1 + parseFloat(pnlPercent) / 100)) : "..."}
              </div>
            )}
          </div>
        )}

        {/* Market Cap trigger mode */}
        {isLimitMode && triggerMode === "market_cap" && (
          <div className="mb-2.5 space-y-2">
            <div>
              <label className="text-[8px] text-white/40 uppercase tracking-widest font-bold mb-1 block">Target Market Cap</label>
              <div className="flex items-center border border-white/10 rounded-lg bg-white/[0.03] overflow-hidden">
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={targetMarketCap}
                  onChange={(e) => setTargetMarketCap(e.target.value)}
                  placeholder={formatCompact(token.marketCap)}
                  className="flex-1 bg-transparent px-3 py-2 text-[11px] font-mono outline-none text-white"
                  aria-label="Target market cap"
                />
                <span className="text-[9px] text-white/40 px-3 font-semibold">USD</span>
              </div>
              <button
                type="button"
                onClick={() => setTargetMarketCap(String(token.marketCap))}
                className="text-[9px] text-[#4fc3f7] hover:text-[#39FF14] mt-1 transition-colors font-semibold"
              >
                Use current MCap ({formatCompact(token.marketCap)})
              </button>
            </div>
            {side === "buy" && (
              <div>
                <label className="text-[8px] text-white/40 uppercase tracking-widest font-bold mb-1 block">USDC Amount</label>
                <div className="flex items-center border border-white/10 rounded-lg bg-white/[0.03] overflow-hidden">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={mcapUsdcAmount}
                    onChange={(e) => setMcapUsdcAmount(e.target.value)}
                    placeholder="0.00"
                    className="flex-1 bg-transparent px-3 py-2 text-[11px] font-mono outline-none text-white"
                    aria-label="USDC amount"
                  />
                  <span className="text-[9px] text-white/40 px-3 font-semibold">USDC</span>
                </div>
              </div>
            )}
            {parseFloat(targetMarketCap || "0") > 0 && token.supply > 0 && (
              <div className="text-[8px] text-white/40">
                Est. price at target: {formatPrice(parseFloat(targetMarketCap) / token.supply)}
                {side === "buy" && parseFloat(mcapUsdcAmount || "0") > 0 && (
                  <> — Est. tokens: {(parseFloat(mcapUsdcAmount) / (parseFloat(targetMarketCap) / token.supply)).toFixed(4)}</>
                )}
              </div>
            )}
          </div>
        )}

        {/* Amount Input */}
        <div className="mb-2.5">
          {isLimitMode && (
            <label className="text-[8px] text-white/40 uppercase tracking-widest font-bold mb-1 block">
              Quantity (tokens)
            </label>
          )}
          <div className="flex items-center border border-white/10 rounded-lg bg-white/[0.03] overflow-hidden">
            <input
              type="number"
              step="any"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 bg-transparent px-3 py-2 text-[11px] font-mono outline-none text-white"
              aria-label={`Amount in ${!isLimitMode && side === "buy" ? "USDC" : token.symbol}`}
            />
            <span className="text-[9px] text-white/40 px-3 font-semibold">
              {!isLimitMode && side === "buy" ? "USDC" : isLimitMode ? token.symbol : token.symbol}
            </span>
          </div>
        </div>

        {/* Preset amount buttons */}
        <div className="flex gap-1 mb-3">
          {!isLimitMode && side === "buy" ? (
            PRESET_AMOUNTS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setAmount(String(amt))}
                className={`flex-1 text-[9px] py-1.5 rounded-lg font-bold transition-all ${
                  amount === String(amt) ? "bg-[#39FF14]/10 text-[#39FF14] border border-[#39FF14]/20" : "bg-white/[0.04] text-white/50 hover:text-white/70 border border-white/10"
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
                  if (pct === 100) {
                    setAmount(tokenQty.toString());
                  } else {
                    setAmount(((tokenQty * pct) / 100).toFixed(6));
                  }
                }}
                className="flex-1 text-[9px] py-1.5 bg-white/[0.04] rounded-lg text-white/50 hover:text-white/70 font-bold transition-all border border-white/10"
              >
                {pct}%
              </button>
            ))
          )}
        </div>

        {/* Note input for limit orders */}
        {isLimitMode && (
          <div className="mb-2.5">
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note (optional)"
              className="w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-2 text-[10px] font-mono outline-none text-white placeholder:text-white/30"
              maxLength={500}
            />
          </div>
        )}

        {/* Estimates */}
        <div className="space-y-1.5 mb-3 text-[10px] text-white/50 border-t border-white/10 pt-2.5">
          <div className="flex justify-between">
            <span>Price</span>
            <span className="font-mono text-white/70">{formatPrice(token.price)}</span>
          </div>
          {!isLimitMode && (
            <>
              <div className="flex justify-between">
                <span>Est. Slippage</span>
                <span className="font-mono text-white/70">~{estimatedSlippage}%</span>
              </div>
              <div className="flex justify-between">
                <span>Fee (0.1%)</span>
                <span className="font-mono text-white/70">{formatUSD(fee)}</span>
              </div>
              {side === "buy" && parseFloat(amount || "0") > 0 && (
                <div className="flex justify-between items-center py-1 px-2 -mx-1 rounded-lg bg-[#39FF14]/5 border border-[#39FF14]/10">
                  <span className="text-[11px] font-semibold text-white/60">Est. Receive</span>
                  <span className="font-mono text-[#39FF14] font-bold text-[13px]">{estimatedQty.toFixed(6)} {token.symbol}</span>
                </div>
              )}
              {side === "sell" && parseFloat(amount || "0") > 0 && (
                <div className="flex justify-between items-center py-1 px-2 -mx-1 rounded-lg bg-[#39FF14]/5 border border-[#39FF14]/10">
                  <span className="text-[11px] font-semibold text-white/60">Est. Receive</span>
                  <span className="font-mono text-[#39FF14] font-bold text-[13px]">{formatUSD(estimatedCost)}</span>
                </div>
              )}
            </>
          )}
          {isLimitMode && parseFloat(amount || "0") > 0 && parseFloat(triggerPrice || "0") > 0 && (
            <div className="flex justify-between">
              <span>Est. Total</span>
              <span className="font-mono text-white/70">
                {formatUSD(parseFloat(amount) * parseFloat(triggerPrice))}
              </span>
            </div>
          )}
        </div>

        {error && <div className="text-[10px] text-accent-red mb-2 px-1 font-semibold" role="alert">{error}</div>}
        {success && <div className="text-[10px] text-accent-green mb-2 px-1 font-semibold" role="status">{success}</div>}

        <button
          type="submit"
          disabled={isPending}
          className={`w-full py-2.5 rounded-lg text-[11px] font-bold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
            side === "buy"
              ? "bg-[#39FF14] text-black hover:shadow-glow"
              : "bg-accent-red text-white hover:shadow-[0_0_20px_rgba(255,56,96,0.25)]"
          }`}
        >
          {isPending
            ? "Processing..."
            : isLimitMode
            ? `Place ${orderMode === "limit" ? "Limit" : orderMode === "stop_loss" ? "Stop Loss" : "Take Profit"} ${side === "buy" ? "Buy" : "Sell"}`
            : `${side === "buy" ? "Buy" : "Sell"} ${token.symbol}`}
        </button>
      </form>

      {/* Open orders for this token */}
      {openOrders.length > 0 && (
        <div className="mt-3 pt-2.5 border-t border-white/10">
          <div className="text-[8px] text-white/40 uppercase tracking-widest font-bold mb-2">Open Orders</div>
          <div className="space-y-1 max-h-[120px] overflow-y-auto">
            {openOrders.map((order) => (
              <div key={order.id} className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-[9px]">
                <span className={`font-bold ${order.side === "buy" ? "text-accent-green" : "text-accent-red"}`}>
                  {order.side.toUpperCase()}
                </span>
                <span className="text-white/50">
                  {order.orderType === "limit" ? "Limit" : order.orderType === "stop_loss" ? "SL" : "TP"}
                </span>
                <span className="font-mono text-white/70">{order.qty > 0 ? order.qty.toFixed(4) : ""}</span>
                {order.triggerType === "pnl_percent" && order.triggerPnlPercent !== null ? (
                  <span className="font-mono text-accent-blue">{order.triggerPnlPercent > 0 ? "+" : ""}{order.triggerPnlPercent}%</span>
                ) : order.triggerType === "market_cap" && order.triggerMarketCap ? (
                  <span className="font-mono text-accent-yellow">MCap {formatCompact(order.triggerMarketCap)}</span>
                ) : (
                  <><span className="text-white/50">@</span><span className="font-mono text-white/70">{formatPrice(order.triggerPrice)}</span></>
                )}
                <button
                  onClick={() => cancelMutation.mutate(order.id)}
                  disabled={cancelMutation.isPending}
                  className="ml-auto text-accent-red/60 hover:text-accent-red text-[8px] font-bold transition-colors"
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
