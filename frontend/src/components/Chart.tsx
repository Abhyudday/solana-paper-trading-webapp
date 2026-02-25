"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, IChartApi, CandlestickData, HistogramData, Time } from "lightweight-charts";
import { OHLCVBar } from "@/lib/api";

interface ChartProps {
  data: OHLCVBar[];
  height?: number;
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

export function Chart({ data, height = 400 }: ChartProps) {
  const priceContainerRef = useRef<HTMLDivElement>(null);
  const volumeContainerRef = useRef<HTMLDivElement>(null);
  const priceChartRef = useRef<IChartApi | null>(null);
  const volumeChartRef = useRef<IChartApi | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);

  const volumeHeight = Math.round(height * 0.28);

  useEffect(() => {
    if (!priceContainerRef.current || !volumeContainerRef.current) return;

    // Guard: no valid data
    const filtered = dedupAndSort(data);
    if (filtered.length === 0) {
      setChartError(null); // Not an error, just no data
      return;
    }

    setChartError(null);

    let priceChart: IChartApi | null = null;
    let volChart: IChartApi | null = null;
    let resizeObserver: ResizeObserver | null = null;

    try {
      const minPrice = filtered.reduce((min, b) => (b.low > 0 && b.low < min ? b.low : min), Infinity);
      const priceDecimals = minPrice < 0.0001 ? 10 : minPrice < 0.01 ? 8 : minPrice < 1 ? 6 : 2;
      const formatPrice = (p: number): string => {
        if (p === 0) return "0";
        return p.toFixed(priceDecimals);
      };

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
          vertLine: {
            color: "rgba(0,200,83,0.3)",
            width: 1 as const,
            style: 2 as const,
            labelBackgroundColor: "#00c853",
          },
          horzLine: {
            color: "rgba(0,200,83,0.3)",
            width: 1 as const,
            style: 2 as const,
            labelBackgroundColor: "#00c853",
          },
        },
      };

      // --- Price chart ---
      priceChart = createChart(priceContainerRef.current!, {
        ...chartOptions,
        height,
        rightPriceScale: {
          borderColor: "#1e2128",
          scaleMargins: { top: 0.05, bottom: 0.05 },
        },
        timeScale: {
          borderColor: "#1e2128",
          timeVisible: true,
          secondsVisible: false,
        },
        localization: {
          priceFormatter: formatPrice,
        },
      });

      const candleSeries = priceChart.addCandlestickSeries({
        upColor: "#00c853",
        downColor: "#ff3b3b",
        borderDownColor: "#ff3b3b",
        borderUpColor: "#00c853",
        wickDownColor: "#ff3b3b99",
        wickUpColor: "#00c85399",
      });

      // --- Volume chart (separate panel below) ---
      volChart = createChart(volumeContainerRef.current!, {
        ...chartOptions,
        height: volumeHeight,
        rightPriceScale: {
          borderColor: "#1e2128",
          scaleMargins: { top: 0.1, bottom: 0 },
        },
        timeScale: {
          borderColor: "#1e2128",
          timeVisible: true,
          secondsVisible: false,
          visible: true,
        },
      });

      const volumeSeries = volChart.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "right",
      });

      // Prepare data
      const mapped: CandlestickData<Time>[] = filtered.map((bar) => ({
        time: bar.time as Time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }));

      const volumeData: HistogramData<Time>[] = filtered.map((bar) => ({
        time: bar.time as Time,
        value: bar.volume,
        color: bar.close >= bar.open ? "rgba(0,200,83,0.55)" : "rgba(255,59,59,0.55)",
      }));

      candleSeries.setData(mapped);
      volumeSeries.setData(volumeData);
      priceChart.timeScale().fitContent();
      volChart.timeScale().fitContent();

      // Cap bar width so new tokens with few bars don't show huge candles
      const MAX_BAR_SPACING = 10;
      if (filtered.length < 60) {
        priceChart.timeScale().applyOptions({ barSpacing: MAX_BAR_SPACING, rightOffset: 5 });
        volChart.timeScale().applyOptions({ barSpacing: MAX_BAR_SPACING, rightOffset: 5 });
      }

      // Sync time scales between the two charts
      const pChart = priceChart;
      const vChart = volChart;

      pChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) vChart.timeScale().setVisibleLogicalRange(range);
      });
      vChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (range) pChart.timeScale().setVisibleLogicalRange(range);
      });

      // Sync crosshair
      pChart.subscribeCrosshairMove((param) => {
        if (param.time) {
          vChart.setCrosshairPosition(NaN, param.time, volumeSeries);
        } else {
          vChart.clearCrosshairPosition();
        }
      });
      vChart.subscribeCrosshairMove((param) => {
        if (param.time) {
          pChart.setCrosshairPosition(NaN, param.time, candleSeries);
        } else {
          pChart.clearCrosshairPosition();
        }
      });

      priceChartRef.current = pChart;
      volumeChartRef.current = vChart;

      // Use ResizeObserver for more reliable sizing than window resize
      resizeObserver = new ResizeObserver(() => {
        if (priceContainerRef.current) {
          const w = priceContainerRef.current.clientWidth;
          if (w > 0) {
            pChart.applyOptions({ width: w });
            vChart.applyOptions({ width: w });
          }
        }
      });
      resizeObserver.observe(priceContainerRef.current!);

    } catch (err) {
      console.error("Chart creation error:", err);
      setChartError("Failed to render chart");
    }

    return () => {
      resizeObserver?.disconnect();
      try { priceChart?.remove(); } catch { /* already removed */ }
      try { volChart?.remove(); } catch { /* already removed */ }
      priceChartRef.current = null;
      volumeChartRef.current = null;
    };
  }, [data, height, volumeHeight]);

  // No valid bars after filtering
  const filtered = dedupAndSort(data);
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
    <div className="w-full rounded-lg overflow-hidden" role="img" aria-label="Token price chart">
      <div ref={priceContainerRef} className="w-full" />
      <div className="flex items-center gap-1.5 px-2 py-1 bg-[#0b0e11]">
        <span className="text-[9px] font-medium text-[#505258] uppercase tracking-wider">Buy</span>
        <span className="inline-block w-2 h-2 rounded-sm bg-[#00c853]/60" />
        <span className="text-[9px] font-medium text-[#505258] uppercase tracking-wider ml-2">Sell</span>
        <span className="inline-block w-2 h-2 rounded-sm bg-[#ff3b3b]/60" />
      </div>
      <div ref={volumeContainerRef} className="w-full" />
    </div>
  );
}
