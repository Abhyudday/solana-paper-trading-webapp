"use client";

import { useEffect, useRef } from "react";
import { createChart, IChartApi, CandlestickData, Time } from "lightweight-charts";
import { OHLCVBar } from "@/lib/api";

interface ChartProps {
  data: OHLCVBar[];
  height?: number;
}

export function Chart({ data, height = 400 }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const minPrice = data.reduce((min, b) => (b.low > 0 && b.low < min ? b.low : min), Infinity);
    const priceDecimals = minPrice < 0.0001 ? 10 : minPrice < 0.01 ? 8 : minPrice < 1 ? 6 : 2;
    const formatPrice = (p: number): string => {
      if (p === 0) return "0";
      if (p < 0.0001) return p.toExponential(4);
      return p.toFixed(priceDecimals);
    };

    const chart = createChart(containerRef.current, {
      height,
      layout: {
        background: { color: "#0a0e17" },
        textColor: "#9ca3af",
      },
      grid: {
        vertLines: { color: "#1f293722" },
        horzLines: { color: "#1f293722" },
      },
      crosshair: {
        mode: 0,
      },
      rightPriceScale: {
        borderColor: "#374151",
      },
      timeScale: {
        borderColor: "#374151",
        timeVisible: true,
        secondsVisible: false,
      },
      localization: {
        priceFormatter: formatPrice,
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#00e676",
      downColor: "#ff1744",
      borderDownColor: "#ff1744",
      borderUpColor: "#00e676",
      wickDownColor: "#ff1744",
      wickUpColor: "#00e676",
    });

    const seen = new Set<number>();
    const mapped: CandlestickData<Time>[] = data
      .filter((bar) => bar.time > 0 && bar.open > 0)
      .sort((a, b) => a.time - b.time)
      .filter((bar) => {
        if (seen.has(bar.time)) return false;
        seen.add(bar.time);
        return true;
      })
      .map((bar) => ({
        time: bar.time as Time,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      }));

    if (mapped.length > 0) {
      candleSeries.setData(mapped);
      chart.timeScale().fitContent();
    }
    chartRef.current = chart;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [data, height]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden"
      role="img"
      aria-label="Token price chart"
    />
  );
}
