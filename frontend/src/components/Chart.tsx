"use client";

import { useEffect, useRef } from "react";
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

  const volumeHeight = Math.round(height * 0.28);

  useEffect(() => {
    if (!priceContainerRef.current || !volumeContainerRef.current) return;

    const minPrice = data.reduce((min, b) => (b.low > 0 && b.low < min ? b.low : min), Infinity);
    const priceDecimals = minPrice < 0.0001 ? 10 : minPrice < 0.01 ? 8 : minPrice < 1 ? 6 : 2;
    const formatPrice = (p: number): string => {
      if (p === 0) return "0";
      if (p < 0.0001) return p.toExponential(4);
      return p.toFixed(priceDecimals);
    };

    const chartOptions = {
      layout: {
        background: { color: "#05080f" },
        textColor: "#525c6e",
        fontFamily: "'Inter', system-ui, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(26,34,53,0.5)" },
        horzLines: { color: "rgba(26,34,53,0.5)" },
      },
      crosshair: {
        mode: 0 as const,
        vertLine: {
          color: "rgba(59,139,255,0.4)",
          width: 1 as const,
          style: 2 as const,
          labelBackgroundColor: "#3b8bff",
        },
        horzLine: {
          color: "rgba(59,139,255,0.4)",
          width: 1 as const,
          style: 2 as const,
          labelBackgroundColor: "#3b8bff",
        },
      },
    };

    // --- Price chart ---
    const priceChart = createChart(priceContainerRef.current, {
      ...chartOptions,
      height,
      rightPriceScale: {
        borderColor: "#1a2235",
        scaleMargins: { top: 0.05, bottom: 0.05 },
      },
      timeScale: {
        borderColor: "#1a2235",
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        priceFormatter: formatPrice,
      },
    });

    const candleSeries = priceChart.addCandlestickSeries({
      upColor: "#00ff88",
      downColor: "#ff3358",
      borderDownColor: "#ff3358",
      borderUpColor: "#00ff88",
      wickDownColor: "#ff335899",
      wickUpColor: "#00ff8899",
    });

    // --- Volume chart (separate panel below) ---
    const volChart = createChart(volumeContainerRef.current, {
      ...chartOptions,
      height: volumeHeight,
      rightPriceScale: {
        borderColor: "#1a2235",
        scaleMargins: { top: 0.1, bottom: 0 },
      },
      timeScale: {
        borderColor: "#1a2235",
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
    const filtered = dedupAndSort(data);

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
      color: bar.close >= bar.open ? "rgba(0,255,136,0.55)" : "rgba(255,51,88,0.55)",
    }));

    if (mapped.length > 0) {
      candleSeries.setData(mapped);
      volumeSeries.setData(volumeData);
      priceChart.timeScale().fitContent();
      volChart.timeScale().fitContent();
    }

    // Sync time scales between the two charts
    priceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) volChart.timeScale().setVisibleLogicalRange(range);
    });
    volChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) priceChart.timeScale().setVisibleLogicalRange(range);
    });

    // Sync crosshair
    priceChart.subscribeCrosshairMove((param) => {
      if (param.time) {
        volChart.setCrosshairPosition(NaN, param.time, volumeSeries);
      } else {
        volChart.clearCrosshairPosition();
      }
    });
    volChart.subscribeCrosshairMove((param) => {
      if (param.time) {
        priceChart.setCrosshairPosition(NaN, param.time, candleSeries);
      } else {
        priceChart.clearCrosshairPosition();
      }
    });

    priceChartRef.current = priceChart;
    volumeChartRef.current = volChart;

    const handleResize = () => {
      if (priceContainerRef.current) {
        const w = priceContainerRef.current.clientWidth;
        priceChart.applyOptions({ width: w });
        volChart.applyOptions({ width: w });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      priceChart.remove();
      volChart.remove();
    };
  }, [data, height, volumeHeight]);

  return (
    <div className="w-full rounded-lg overflow-hidden" role="img" aria-label="Token price chart">
      <div ref={priceContainerRef} className="w-full" />
      <div className="flex items-center gap-1.5 px-2 py-1 bg-[#05080f]">
        <span className="text-[10px] font-medium text-[#525c6e] uppercase tracking-wider">Buy Volume</span>
        <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#00ff88]/60" />
        <span className="text-[10px] font-medium text-[#525c6e] uppercase tracking-wider ml-2">Sell Volume</span>
        <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#ff3358]/60" />
      </div>
      <div ref={volumeContainerRef} className="w-full" />
    </div>
  );
}
