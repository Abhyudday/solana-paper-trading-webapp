"use client";

import { useEffect, useRef, useState, useCallback, useMemo, memo } from "react";
import { createChart, IChartApi, ISeriesApi, CandlestickData, HistogramData, LineData, Time, SeriesType } from "lightweight-charts";
import { OHLCVBar } from "@/lib/api";

// ──────────── Indicator calculation helpers ────────────

function calcSMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    result.push(sum / period);
  }
  return result;
}

function calcEMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  let ema: number | null = null;
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    if (ema === null) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += closes[j];
      ema = sum / period;
    } else {
      ema = closes[i] * k + ema * (1 - k);
    }
    result.push(ema);
  }
  return result;
}

function calcRSI(closes: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];
  if (closes.length < period + 1) return closes.map(() => null);
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff; else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;
  for (let i = 0; i < period; i++) result.push(null);
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push(100 - 100 / (1 + rs));
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
    result.push(rsi);
  }
  return result;
}

function calcMACD(closes: number[], fast = 12, slow = 26, signal = 9): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);
  const macdLine: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (emaFast[i] !== null && emaSlow[i] !== null) {
      macdLine.push(emaFast[i]! - emaSlow[i]!);
    } else {
      macdLine.push(null);
    }
  }
  const validMacd = macdLine.filter((v) => v !== null) as number[];
  const signalLine = calcEMA(validMacd, signal);
  const hist: (number | null)[] = [];
  const sigResult: (number | null)[] = [];
  let vi = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] === null) { sigResult.push(null); hist.push(null); continue; }
    const sig = signalLine[vi] ?? null;
    sigResult.push(sig);
    hist.push(sig !== null ? macdLine[i]! - sig : null);
    vi++;
  }
  return { macd: macdLine, signal: sigResult, histogram: hist };
}

function calcBollingerBands(closes: number[], period = 20, mult = 2): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = calcSMA(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (middle[i] === null) { upper.push(null); lower.push(null); continue; }
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      variance += (closes[j] - middle[i]!) ** 2;
    }
    const stdDev = Math.sqrt(variance / period);
    upper.push(middle[i]! + mult * stdDev);
    lower.push(middle[i]! - mult * stdDev);
  }
  return { upper, middle, lower };
}

// ──────────── Indicator types ────────────

type IndicatorKey = "ma7" | "ma25" | "ma99" | "ema12" | "ema26" | "rsi" | "macd" | "bb";

interface IndicatorOption {
  key: IndicatorKey;
  label: string;
  color: string;
  category: "overlay" | "oscillator";
}

const INDICATORS: IndicatorOption[] = [
  { key: "ma7", label: "MA 7", color: "#f5c542", category: "overlay" },
  { key: "ma25", label: "MA 25", color: "#42a5f5", category: "overlay" },
  { key: "ma99", label: "MA 99", color: "#ab47bc", category: "overlay" },
  { key: "ema12", label: "EMA 12", color: "#26a69a", category: "overlay" },
  { key: "ema26", label: "EMA 26", color: "#ef5350", category: "overlay" },
  { key: "bb", label: "Bollinger", color: "#78909c", category: "overlay" },
  { key: "rsi", label: "RSI 14", color: "#ff9800", category: "oscillator" },
  { key: "macd", label: "MACD", color: "#e040fb", category: "oscillator" },
];

// ──────────── Component ────────────

type ChartMode = "price" | "mcap";

interface ChartProps {
  data: OHLCVBar[];
  height?: number;
  supply?: number;
  marketCap?: number;
  currentPrice?: number;
  range?: string;
}

function dedupAndSort(data: OHLCVBar[]) {
  const seen = new Set<number>();
  return data
    .filter((bar) => bar.time > 0 && bar.open > 0)
    .sort((a, b) => a.time - b.time)
    .filter((bar) => {
      if (seen.has(bar.time)) return false;
      seen.add(bar.time);
      return true;
    });
}

export const Chart = memo(function Chart({ data, height = 400, supply, marketCap, currentPrice, range }: ChartProps) {
  const [chartMode, setChartMode] = useState<ChartMode>("price");
  const priceContainerRef = useRef<HTMLDivElement>(null);
  const volumeContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef = useRef<HTMLDivElement>(null);
  const macdContainerRef = useRef<HTMLDivElement>(null);
  const priceChartRef = useRef<IChartApi | null>(null);
  const volumeChartRef = useRef<IChartApi | null>(null);
  const rsiChartRef = useRef<IChartApi | null>(null);
  const macdChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const overlaySeriesRef = useRef<ISeriesApi<SeriesType>[]>([]);
  const rsiSeriesRef = useRef<{ rsi: ISeriesApi<"Line">; ob: ISeriesApi<"Line">; os: ISeriesApi<"Line"> } | null>(null);
  const macdSeriesRef = useRef<{ line: ISeriesApi<"Line">; signal: ISeriesApi<"Line">; hist: ISeriesApi<"Histogram"> } | null>(null);
  const savedLogicalRangeRef = useRef<{ from: number; to: number } | null>(null);
  const prevRangeRef = useRef<string | undefined>(range);
  const chartCreatedForRef = useRef<string>("");
  const prevDataLenRef = useRef<number>(0);
  const prevLastTimeRef = useRef<number>(0);
  const prevChartModeRef = useRef<ChartMode>("price");
  const microTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRealBarRef = useRef<OHLCVBar | null>(null);
  const mcapMultiplierRef = useRef<number>(0);
  const [chartError, setChartError] = useState<string | null>(null);
  const [activeIndicators, setActiveIndicators] = useState<Set<IndicatorKey>>(new Set());
  const [showIndicatorPanel, setShowIndicatorPanel] = useState(false);

  const volumeHeight = Math.round(height * 0.25);
  const oscillatorHeight = 100;

  const hasRSI = activeIndicators.has("rsi");
  const hasMACD = activeIndicators.has("macd");

  const toggleIndicator = useCallback((key: IndicatorKey) => {
    setActiveIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  // Reset saved viewport when timeframe changes so chart fits new data
  useEffect(() => {
    if (range !== prevRangeRef.current) {
      savedLogicalRangeRef.current = null;
      prevRangeRef.current = range;
    }
  }, [range]);

  // Build a key that determines when to RECREATE charts vs just update data
  const structureKey = `${height}-${volumeHeight}-${oscillatorHeight}-${hasRSI}-${hasMACD}`;

  // ── CHART CREATION (only on mount or structural changes) ──
  useEffect(() => {
    if (!priceContainerRef.current || !volumeContainerRef.current) return;

    const chartOptions = {
      layout: {
        background: { color: "#0b0e11" },
        textColor: "#505258",
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(30,33,40,0.5)" },
        horzLines: { color: "rgba(30,33,40,0.5)" },
      },
      crosshair: {
        mode: 0 as const,
        vertLine: { color: "rgba(0,200,83,0.3)", width: 1 as const, style: 2 as const, labelBackgroundColor: "#00c853" },
        horzLine: { color: "rgba(0,200,83,0.3)", width: 1 as const, style: 2 as const, labelBackgroundColor: "#00c853" },
      },
    };

    // --- Price chart ---
    const priceChart = createChart(priceContainerRef.current!, {
      ...chartOptions,
      height,
      rightPriceScale: { borderColor: "#1e2128", scaleMargins: { top: 0.05, bottom: 0.05 } },
      timeScale: { borderColor: "#1e2128", timeVisible: true, secondsVisible: false, rightOffset: 3, minBarSpacing: 2 },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      kineticScroll: { mouse: true, touch: true },
    });
    const candleSeries = priceChart.addCandlestickSeries({
      upColor: "#00c853", downColor: "#ff3b3b",
      borderDownColor: "#ff3b3b", borderUpColor: "#00c853",
      wickDownColor: "#ff3b3b99", wickUpColor: "#00c85399",
    });

    // --- Volume chart ---
    const volChart = createChart(volumeContainerRef.current!, {
      ...chartOptions,
      height: volumeHeight,
      rightPriceScale: { borderColor: "#1e2128", scaleMargins: { top: 0.1, bottom: 0 } },
      timeScale: { borderColor: "#1e2128", timeVisible: true, secondsVisible: false, visible: !hasRSI && !hasMACD },
    });
    const volumeSeries = volChart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "right" });

    // --- RSI chart ---
    let rsiChart: IChartApi | null = null;
    let rsiSeries: typeof rsiSeriesRef.current = null;
    if (hasRSI && rsiContainerRef.current) {
      rsiChart = createChart(rsiContainerRef.current, {
        ...chartOptions, height: oscillatorHeight,
        rightPriceScale: { borderColor: "#1e2128", scaleMargins: { top: 0.05, bottom: 0.05 } },
        timeScale: { borderColor: "#1e2128", timeVisible: true, secondsVisible: false, visible: !hasMACD },
      });
      const rsi = rsiChart.addLineSeries({ color: "#ff9800", lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
      const ob = rsiChart.addLineSeries({ color: "rgba(255,59,59,0.3)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, lineStyle: 2 });
      const os = rsiChart.addLineSeries({ color: "rgba(0,200,83,0.3)", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, lineStyle: 2 });
      rsiSeries = { rsi, ob, os };
    }

    // --- MACD chart ---
    let macdChart: IChartApi | null = null;
    let macdSeries: typeof macdSeriesRef.current = null;
    if (hasMACD && macdContainerRef.current) {
      macdChart = createChart(macdContainerRef.current, {
        ...chartOptions, height: oscillatorHeight,
        rightPriceScale: { borderColor: "#1e2128", scaleMargins: { top: 0.1, bottom: 0.1 } },
        timeScale: { borderColor: "#1e2128", timeVisible: true, secondsVisible: false, visible: true },
      });
      const line = macdChart.addLineSeries({ color: "#e040fb", lineWidth: 2, priceLineVisible: false, lastValueVisible: true });
      const signal = macdChart.addLineSeries({ color: "#ff9800", lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      const hist = macdChart.addHistogramSeries({ priceFormat: { type: "volume" }, priceScaleId: "right" });
      macdSeries = { line, signal, hist };
    }

    // Sync time scales
    const allCharts = [priceChart, volChart, rsiChart, macdChart].filter(Boolean) as IChartApi[];
    for (let i = 0; i < allCharts.length; i++) {
      for (let j = 0; j < allCharts.length; j++) {
        if (i !== j) {
          const src = allCharts[i]; const dst = allCharts[j];
          src.timeScale().subscribeVisibleLogicalRangeChange((r) => { if (r) { try { dst.timeScale().setVisibleLogicalRange(r); } catch {} } });
        }
      }
    }

    // Persist viewport
    priceChart.timeScale().subscribeVisibleLogicalRangeChange((lr) => { if (lr) savedLogicalRangeRef.current = lr; });

    // Sync crosshairs
    priceChart.subscribeCrosshairMove((p) => { if (p.time) volChart.setCrosshairPosition(NaN, p.time, volumeSeries); else volChart.clearCrosshairPosition(); });
    volChart.subscribeCrosshairMove((p) => { if (p.time) priceChart.setCrosshairPosition(NaN, p.time, candleSeries); else priceChart.clearCrosshairPosition(); });

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (priceContainerRef.current) {
        const w = priceContainerRef.current.clientWidth;
        if (w > 0) allCharts.forEach((c) => c.applyOptions({ width: w }));
      }
    });
    resizeObserver.observe(priceContainerRef.current!);

    // Store refs
    priceChartRef.current = priceChart;
    volumeChartRef.current = volChart;
    rsiChartRef.current = rsiChart;
    macdChartRef.current = macdChart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    rsiSeriesRef.current = rsiSeries;
    macdSeriesRef.current = macdSeries;
    overlaySeriesRef.current = [];
    chartCreatedForRef.current = "";

    return () => {
      resizeObserver.disconnect();
      try { priceChart.remove(); } catch {}
      try { volChart.remove(); } catch {}
      try { rsiChart?.remove(); } catch {}
      try { macdChart?.remove(); } catch {}
      priceChartRef.current = null;
      volumeChartRef.current = null;
      rsiChartRef.current = null;
      macdChartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      rsiSeriesRef.current = null;
      macdSeriesRef.current = null;
      overlaySeriesRef.current = [];
      chartCreatedForRef.current = "";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey]);

  // ── DATA UPDATE (runs on every data change — NO chart recreation) ──
  useEffect(() => {
    const priceChart = priceChartRef.current;
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!priceChart || !candleSeries || !volumeSeries) return;

    const filtered = dedupAndSort(data);
    if (filtered.length === 0) return;

    // Compute MCap multiplier: prefer supply, fall back to marketCap/currentPrice
    let mcapMultiplier = 0;
    if (supply && supply > 0) {
      mcapMultiplier = supply;
    } else if (marketCap && currentPrice && currentPrice > 0) {
      mcapMultiplier = marketCap / currentPrice;
    }
    const canShowMcap = chartMode === "mcap" && mcapMultiplier > 0;

    const displayData = canShowMcap
      ? filtered.map((bar) => ({ ...bar, open: bar.open * mcapMultiplier, high: bar.high * mcapMultiplier, low: bar.low * mcapMultiplier, close: bar.close * mcapMultiplier }))
      : filtered;

    setChartError(null);

    // Store last real bar and multiplier for micro-tick generation
    lastRealBarRef.current = filtered[filtered.length - 1];
    mcapMultiplierRef.current = mcapMultiplier;

    const lastBar = displayData[displayData.length - 1];
    const modeChanged = chartMode !== prevChartModeRef.current;
    prevChartModeRef.current = chartMode;

    const isLastBarUpdate = !modeChanged
      && displayData.length === prevDataLenRef.current
      && lastBar.time === prevLastTimeRef.current
      && displayData.length > 0;
    const isSingleNewCandle = !modeChanged
      && displayData.length === prevDataLenRef.current + 1
      && prevDataLenRef.current > 0;

    // FAST PATH: only last bar changed (WS price tick) — use update() which is O(1)
    if (isLastBarUpdate) {
      const candleBar: CandlestickData<Time> = {
        time: lastBar.time as Time, open: lastBar.open, high: lastBar.high, low: lastBar.low, close: lastBar.close,
      };
      const volBar: HistogramData<Time> = {
        time: lastBar.time as Time, value: lastBar.volume,
        color: lastBar.close >= lastBar.open ? "rgba(0,200,83,0.55)" : "rgba(255,59,59,0.55)",
      };
      candleSeries.update(candleBar);
      volumeSeries.update(volBar);
      return;
    }

    // APPEND PATH: single new candle arrived — use update() instead of full setData()
    if (isSingleNewCandle) {
      const candleBar: CandlestickData<Time> = {
        time: lastBar.time as Time, open: lastBar.open, high: lastBar.high, low: lastBar.low, close: lastBar.close,
      };
      const volBar: HistogramData<Time> = {
        time: lastBar.time as Time, value: lastBar.volume,
        color: lastBar.close >= lastBar.open ? "rgba(0,200,83,0.55)" : "rgba(255,59,59,0.55)",
      };
      candleSeries.update(candleBar);
      volumeSeries.update(volBar);
      prevDataLenRef.current = displayData.length;
      prevLastTimeRef.current = lastBar.time;
      return;
    }

    // MODE TOGGLE: save viewport before full setData so we can restore it
    const savedRange = modeChanged ? savedLogicalRangeRef.current : null;

    prevDataLenRef.current = displayData.length;
    prevLastTimeRef.current = lastBar.time;

    // Update price formatter based on current data
    const minPrice = displayData.reduce((min, b) => (b.low > 0 && b.low < min ? b.low : min), Infinity);
    const isMcap = canShowMcap;
    const priceDecimals = isMcap ? 2 : (minPrice < 0.0001 ? 10 : minPrice < 0.01 ? 8 : minPrice < 1 ? 6 : 2);
    const priceFormatter = isMcap
      ? (p: number) => {
          if (p === 0) return "$0";
          if (p >= 1_000_000_000) return `$${(p / 1_000_000_000).toFixed(2)}B`;
          if (p >= 1_000_000) return `$${(p / 1_000_000).toFixed(2)}M`;
          if (p >= 1_000) return `$${(p / 1_000).toFixed(1)}K`;
          return `$${p.toFixed(2)}`;
        }
      : (p: number) => p === 0 ? "0" : p.toFixed(priceDecimals);
    priceChart.applyOptions({ localization: { priceFormatter } });

    const closes = displayData.map((b) => b.close);
    const times = displayData.map((b) => b.time as Time);

    // FULL PATH: new candles arrived — use setData() for complete refresh
    const mapped: CandlestickData<Time>[] = displayData.map((bar) => ({
      time: bar.time as Time, open: bar.open, high: bar.high, low: bar.low, close: bar.close,
    }));
    const volumeData: HistogramData<Time>[] = displayData.map((bar) => ({
      time: bar.time as Time, value: bar.volume,
      color: bar.close >= bar.open ? "rgba(0,200,83,0.55)" : "rgba(255,59,59,0.55)",
    }));
    candleSeries.setData(mapped);
    volumeSeries.setData(volumeData);

    // Build indicator key to detect changes
    const indicatorKey = Array.from(activeIndicators).sort().join(",");
    const dataKey = `${indicatorKey}-${chartMode}-${mcapMultiplier}`;

    // Remove old overlay series if indicator set changed
    if (chartCreatedForRef.current !== dataKey) {
      for (const s of overlaySeriesRef.current) {
        try { priceChart.removeSeries(s); } catch {}
      }
      overlaySeriesRef.current = [];

      // Re-add overlay indicators
      const addOverlay = (values: (number | null)[], color: string, lw: number = 1) => {
        const series = priceChart.addLineSeries({
          color, lineWidth: lw as 1 | 2 | 3 | 4,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
        });
        const ld: LineData<Time>[] = [];
        for (let i = 0; i < values.length; i++) { if (values[i] !== null) ld.push({ time: times[i], value: values[i]! }); }
        series.setData(ld);
        overlaySeriesRef.current.push(series);
        return series;
      };

      if (activeIndicators.has("ma7")) addOverlay(calcSMA(closes, 7), "#f5c542");
      if (activeIndicators.has("ma25")) addOverlay(calcSMA(closes, 25), "#42a5f5");
      if (activeIndicators.has("ma99")) addOverlay(calcSMA(closes, 99), "#ab47bc");
      if (activeIndicators.has("ema12")) addOverlay(calcEMA(closes, 12), "#26a69a");
      if (activeIndicators.has("ema26")) addOverlay(calcEMA(closes, 26), "#ef5350");
      if (activeIndicators.has("bb")) {
        const bb = calcBollingerBands(closes, 20, 2);
        addOverlay(bb.upper, "#78909c"); addOverlay(bb.middle, "#78909c88"); addOverlay(bb.lower, "#78909c");
      }

      chartCreatedForRef.current = dataKey;
    } else {
      // Same indicators — just update overlay data in place
      let idx = 0;
      const updateOverlay = (values: (number | null)[]) => {
        if (idx < overlaySeriesRef.current.length) {
          const ld: LineData<Time>[] = [];
          for (let i = 0; i < values.length; i++) { if (values[i] !== null) ld.push({ time: times[i], value: values[i]! }); }
          overlaySeriesRef.current[idx].setData(ld);
          idx++;
        }
      };
      if (activeIndicators.has("ma7")) updateOverlay(calcSMA(closes, 7));
      if (activeIndicators.has("ma25")) updateOverlay(calcSMA(closes, 25));
      if (activeIndicators.has("ma99")) updateOverlay(calcSMA(closes, 99));
      if (activeIndicators.has("ema12")) updateOverlay(calcEMA(closes, 12));
      if (activeIndicators.has("ema26")) updateOverlay(calcEMA(closes, 26));
      if (activeIndicators.has("bb")) {
        const bb = calcBollingerBands(closes, 20, 2);
        updateOverlay(bb.upper); updateOverlay(bb.middle); updateOverlay(bb.lower);
      }
    }

    // Update RSI data
    if (rsiSeriesRef.current) {
      const rsiValues = calcRSI(closes, 14);
      const rsiData: LineData<Time>[] = [];
      for (let i = 0; i < rsiValues.length; i++) { if (rsiValues[i] !== null) rsiData.push({ time: times[i], value: rsiValues[i]! }); }
      rsiSeriesRef.current.rsi.setData(rsiData);
      rsiSeriesRef.current.ob.setData(rsiData.map((d) => ({ time: d.time, value: 70 })));
      rsiSeriesRef.current.os.setData(rsiData.map((d) => ({ time: d.time, value: 30 })));
    }

    // Update MACD data
    if (macdSeriesRef.current) {
      const macdCalc = calcMACD(closes, 12, 26, 9);
      const mld: LineData<Time>[] = []; const sld: LineData<Time>[] = []; const hld: HistogramData<Time>[] = [];
      let vi = 0;
      for (let i = 0; i < macdCalc.macd.length; i++) {
        if (macdCalc.macd[i] === null) continue;
        mld.push({ time: times[i], value: macdCalc.macd[i]! });
        if (macdCalc.signal[vi] !== null) sld.push({ time: times[i], value: macdCalc.signal[vi]! });
        if (macdCalc.histogram[vi] !== null) hld.push({ time: times[i], value: macdCalc.histogram[vi]!, color: macdCalc.histogram[vi]! >= 0 ? "rgba(0,200,83,0.5)" : "rgba(255,59,59,0.5)" });
        vi++;
      }
      macdSeriesRef.current.line.setData(mld);
      macdSeriesRef.current.signal.setData(sld);
      macdSeriesRef.current.hist.setData(hld);
    }

    // On mode toggle, restore the viewport so chart doesn't jump
    if (modeChanged && savedRange) {
      const allCharts = [priceChartRef.current, volumeChartRef.current, rsiChartRef.current, macdChartRef.current].filter(Boolean) as IChartApi[];
      requestAnimationFrame(() => {
        allCharts.forEach((c) => { try { c.timeScale().setVisibleLogicalRange(savedRange); } catch {} });
      });
    } else if (!savedLogicalRangeRef.current) {
      // On first data load or timeframe change, fit content
      const allCharts = [priceChartRef.current, volumeChartRef.current, rsiChartRef.current, macdChartRef.current].filter(Boolean) as IChartApi[];
      allCharts.forEach((c) => c.timeScale().fitContent());
      if (displayData.length < 60) {
        allCharts.forEach((c) => c.timeScale().applyOptions({ barSpacing: 10, rightOffset: 5 }));
      }
    }
  }, [data, chartMode, supply, marketCap, currentPrice, activeIndicators]);

  // ── MICRO-TICK: synthetic small movements between real updates for real-time feel ──
  useEffect(() => {
    // Clear any existing micro-tick interval
    if (microTickRef.current) { clearInterval(microTickRef.current); microTickRef.current = null; }

    const candleSeries = candleSeriesRef.current;
    if (!candleSeries || !lastRealBarRef.current) return;

    microTickRef.current = setInterval(() => {
      const realBar = lastRealBarRef.current;
      if (!realBar || !candleSeriesRef.current) return;

      const mult = chartMode === "mcap" && mcapMultiplierRef.current > 0 ? mcapMultiplierRef.current : 1;
      const baseClose = realBar.close * mult;
      // Random walk: ±0.15% of the close
      const jitter = baseClose * (Math.random() - 0.5) * 0.003;
      const fakeClose = baseClose + jitter;
      const fakeHigh = Math.max(realBar.high * mult, fakeClose);
      const fakeLow = Math.min(realBar.low * mult, fakeClose);

      try {
        candleSeriesRef.current!.update({
          time: realBar.time as Time,
          open: realBar.open * mult,
          high: fakeHigh,
          low: fakeLow,
          close: fakeClose,
        });
      } catch {}
    }, 300);

    return () => {
      if (microTickRef.current) { clearInterval(microTickRef.current); microTickRef.current = null; }
    };
  }, [data, chartMode]);

  const filtered = useMemo(() => dedupAndSort(data), [data]);
  if (filtered.length === 0 && !chartError) {
    return (
      <div className="w-full rounded-lg overflow-hidden bg-[#0b0e11] flex items-center justify-center" style={{ height: height + volumeHeight + 28 }}>
        <div className="flex flex-col items-center gap-2 text-text-muted">
          <svg className="w-8 h-8 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
          <span className="text-xs">No chart data available</span>
        </div>
      </div>
    );
  }

  if (chartError) {
    return (
      <div className="w-full rounded-lg overflow-hidden bg-[#0b0e11] flex items-center justify-center" style={{ height: height + volumeHeight + 28 }}>
        <div className="flex flex-col items-center gap-2 text-accent-red/70">
          <svg className="w-8 h-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span className="text-xs">{chartError}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-lg overflow-hidden chart-fade-in" role="img" aria-label="Token price chart">
      {/* Indicator toolbar */}
      <div className="flex items-center gap-1 px-2 py-1 bg-[#0b0e11] border-b border-[#1e2128]/50">
        {/* Price / MCap toggle */}
        <div className="flex items-center rounded-md bg-[#1a1d23] border border-[#1e2128] mr-2">
          <button
            onClick={() => setChartMode("price")}
            className={`px-3 py-1 rounded-md text-[11px] font-bold tracking-wide transition-all ${
              chartMode === "price"
                ? "bg-accent-green/20 text-accent-green shadow-sm shadow-accent-green/10"
                : "text-[#505258] hover:text-text-secondary"
            }`}
          >
            Price
          </button>
          <button
            onClick={() => setChartMode("mcap")}
            className={`px-3 py-1 rounded-md text-[11px] font-bold tracking-wide transition-all ${
              chartMode === "mcap"
                ? "bg-[#f59e0b]/20 text-[#f59e0b] shadow-sm shadow-[#f59e0b]/10"
                : "text-[#505258] hover:text-text-secondary"
            }`}
            title={!supply ? "Supply data needed for MCap chart" : undefined}
          >
            MCap
          </button>
        </div>
        {chartMode === "mcap" && (
          <span className="text-[9px] font-semibold text-[#f59e0b] bg-[#f59e0b]/10 px-2 py-0.5 rounded-full mr-1 animate-pulse">
            Market Cap View
          </span>
        )}
        <button
          onClick={() => setShowIndicatorPanel(!showIndicatorPanel)}
          className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-semibold transition-colors ${
            showIndicatorPanel ? "bg-accent-blue/15 text-accent-blue" : "text-[#505258] hover:text-text-secondary hover:bg-[#1a1d23]"
          }`}
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
          </svg>
          Indicators
          {activeIndicators.size > 0 && (
            <span className="bg-accent-blue/20 text-accent-blue px-1 rounded text-[8px]">{activeIndicators.size}</span>
          )}
        </button>
        {/* Active indicator pills */}
        {Array.from(activeIndicators).map((key) => {
          const ind = INDICATORS.find((i) => i.key === key)!;
          return (
            <span key={key} className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-semibold bg-[#1a1d23]">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ind.color }} />
              <span style={{ color: ind.color }}>{ind.label}</span>
              <button onClick={() => toggleIndicator(key)} className="text-text-muted hover:text-text-primary ml-0.5">&times;</button>
            </span>
          );
        })}
      </div>

      {/* Indicator selection panel */}
      {showIndicatorPanel && (
        <div className="px-3 py-2 bg-[#111418] border-b border-[#1e2128]/50">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <div>
              <span className="text-[8px] text-text-muted uppercase tracking-wider font-semibold">Overlays</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {INDICATORS.filter((i) => i.category === "overlay").map((ind) => (
                  <button
                    key={ind.key}
                    onClick={() => toggleIndicator(ind.key)}
                    className={`px-2 py-0.5 rounded text-[9px] font-semibold transition-all border ${
                      activeIndicators.has(ind.key)
                        ? "border-current opacity-100"
                        : "border-transparent opacity-50 hover:opacity-80"
                    }`}
                    style={{ color: ind.color, backgroundColor: activeIndicators.has(ind.key) ? `${ind.color}15` : "transparent" }}
                  >
                    {ind.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="text-[8px] text-text-muted uppercase tracking-wider font-semibold">Oscillators</span>
              <div className="flex flex-wrap gap-1 mt-1">
                {INDICATORS.filter((i) => i.category === "oscillator").map((ind) => (
                  <button
                    key={ind.key}
                    onClick={() => toggleIndicator(ind.key)}
                    className={`px-2 py-0.5 rounded text-[9px] font-semibold transition-all border ${
                      activeIndicators.has(ind.key)
                        ? "border-current opacity-100"
                        : "border-transparent opacity-50 hover:opacity-80"
                    }`}
                    style={{ color: ind.color, backgroundColor: activeIndicators.has(ind.key) ? `${ind.color}15` : "transparent" }}
                  >
                    {ind.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={priceContainerRef} className="w-full" />
      <div className="flex items-center gap-1.5 px-2 py-1 bg-[#0b0e11]">
        <span className="text-[9px] font-medium text-[#505258] uppercase tracking-wider">Buy</span>
        <span className="inline-block w-2 h-2 rounded-sm bg-[#00c853]/60" />
        <span className="text-[9px] font-medium text-[#505258] uppercase tracking-wider ml-2">Sell</span>
        <span className="inline-block w-2 h-2 rounded-sm bg-[#ff3b3b]/60" />
      </div>
      <div ref={volumeContainerRef} className="w-full" />
      {hasRSI && (
        <div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#0b0e11] border-t border-[#1e2128]/50">
            <span className="text-[8px] font-semibold text-[#ff9800] uppercase tracking-wider">RSI 14</span>
          </div>
          <div ref={rsiContainerRef} className="w-full" />
        </div>
      )}
      {hasMACD && (
        <div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-[#0b0e11] border-t border-[#1e2128]/50">
            <span className="text-[8px] font-semibold text-[#e040fb] uppercase tracking-wider">MACD (12,26,9)</span>
          </div>
          <div ref={macdContainerRef} className="w-full" />
        </div>
      )}
    </div>
  );
});
