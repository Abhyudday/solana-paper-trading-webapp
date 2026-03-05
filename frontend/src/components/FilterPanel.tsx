"use client";

import { useState, useCallback } from "react";
import { TokenFilterParams } from "@/lib/api";

interface FilterField {
  label: string;
  minKey: keyof TokenFilterParams;
  maxKey: keyof TokenFilterParams;
  unit?: string;
  multiplier?: number;
}

const FILTER_FIELDS: FilterField[] = [
  { label: "B. Curve", minKey: "minCurvePercentage", maxKey: "maxCurvePercentage", unit: "%" },
  { label: "Liquidity", minKey: "minLiquidity", maxKey: "maxLiquidity", unit: "K", multiplier: 1000 },
  { label: "MKT Cap", minKey: "minMarketCap", maxKey: "maxMarketCap", unit: "K", multiplier: 1000 },
  { label: "Volume", minKey: "minVolume", maxKey: "maxVolume", unit: "K", multiplier: 1000 },
  { label: "TXs", minKey: "minTotalTransactions", maxKey: "maxTotalTransactions" },
  { label: "Buys", minKey: "minBuys", maxKey: "maxBuys" },
  { label: "Sells", minKey: "minSells", maxKey: "maxSells" },
  { label: "Holders", minKey: "minHolders", maxKey: "maxHolders" },
  { label: "Total Fees", minKey: "minFeesTotal", maxKey: "maxFeesTotal", unit: "SOL" },
];

interface FilterPanelProps {
  onApply: (filters: TokenFilterParams) => void;
  onClose: () => void;
  initialFilters?: TokenFilterParams;
  columnType?: "new" | "migrating" | "migrated";
}

type DraftValues = Record<string, string>;

export function FilterPanel({ onApply, onClose, initialFilters, columnType }: FilterPanelProps) {
  const buildInitialDraft = useCallback((): DraftValues => {
    const draft: DraftValues = {};
    if (!initialFilters) return draft;
    for (const field of FILTER_FIELDS) {
      const minVal = initialFilters[field.minKey];
      const maxVal = initialFilters[field.maxKey];
      const div = field.multiplier || 1;
      if (minVal !== undefined) draft[field.minKey] = String(Number(minVal) / div);
      if (maxVal !== undefined) draft[field.maxKey] = String(Number(maxVal) / div);
    }
    if (initialFilters.minCreatedAt !== undefined) {
      const ageMaxMin = Math.round((Date.now() - Number(initialFilters.minCreatedAt)) / 60000);
      draft["ageMax"] = String(ageMaxMin);
    }
    if (initialFilters.maxCreatedAt !== undefined) {
      const ageMinMin = Math.round((Date.now() - Number(initialFilters.maxCreatedAt)) / 60000);
      draft["ageMin"] = String(ageMinMin);
    }
    return draft;
  }, [initialFilters]);

  const [draft, setDraft] = useState<DraftValues>(buildInitialDraft);

  const updateField = (key: string, value: string) => {
    setDraft((prev) => {
      if (value === "") {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: value };
    });
  };

  const handleApply = () => {
    const filters: TokenFilterParams = {};
    for (const field of FILTER_FIELDS) {
      const minStr = draft[field.minKey];
      const maxStr = draft[field.maxKey];
      const mult = field.multiplier || 1;
      if (minStr !== undefined && minStr !== "") {
        (filters as Record<string, number>)[field.minKey] = Number(minStr) * mult;
      }
      if (maxStr !== undefined && maxStr !== "") {
        (filters as Record<string, number>)[field.maxKey] = Number(maxStr) * mult;
      }
    }
    const ageMin = draft["ageMin"];
    const ageMax = draft["ageMax"];
    if (ageMin !== undefined && ageMin !== "") {
      filters.maxCreatedAt = Date.now() - Number(ageMin) * 60000;
    }
    if (ageMax !== undefined && ageMax !== "") {
      filters.minCreatedAt = Date.now() - Number(ageMax) * 60000;
    }
    onApply(filters);
  };

  const handleReset = () => {
    setDraft({});
    onApply({});
  };

  const hasFilters = Object.keys(draft).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-md bg-bg-primary border border-border rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-[13px] font-bold uppercase tracking-wider text-text-primary">Filters</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary h-6 w-6 rounded-lg flex items-center justify-center hover:bg-bg-tertiary transition-all"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filter fields */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-3">
          {/* Age row */}
          <div className="flex items-center gap-3">
            <span className="w-20 text-[11px] text-text-secondary flex-shrink-0 font-semibold">Age</span>
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  placeholder="Min"
                  value={draft["ageMin"] || ""}
                  onChange={(e) => updateField("ageMin", e.target.value)}
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-[11px] text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-green/30 focus:ring-1 focus:ring-accent-green/10 pr-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-text-muted">min</span>
              </div>
              <div className="relative flex-1">
                <input
                  type="number"
                  placeholder="Max"
                  value={draft["ageMax"] || ""}
                  onChange={(e) => updateField("ageMax", e.target.value)}
                  className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-[11px] text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-green/30 focus:ring-1 focus:ring-accent-green/10 pr-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-text-muted">min</span>
              </div>
            </div>
          </div>

          {/* Standard filter rows */}
          {FILTER_FIELDS.filter((field) => {
            if (columnType === "migrated" && field.label === "B. Curve") return false;
            return true;
          }).map((field) => (
            <div key={field.label} className="flex items-center gap-3">
              <span className="w-20 text-[11px] text-text-secondary flex-shrink-0 font-semibold">{field.label}</span>
              <div className="flex-1 flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    placeholder="Min"
                    value={draft[field.minKey] || ""}
                    onChange={(e) => updateField(field.minKey, e.target.value)}
                    className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-[11px] text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-green/30 focus:ring-1 focus:ring-accent-green/10 pr-10"
                  />
                  {field.unit && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-text-muted">
                      {field.unit}
                    </span>
                  )}
                </div>
                <div className="relative flex-1">
                  <input
                    type="number"
                    placeholder="Max"
                    value={draft[field.maxKey] || ""}
                    onChange={(e) => updateField(field.maxKey, e.target.value)}
                    className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-[11px] text-text-primary placeholder:text-text-muted/50 focus:outline-none focus:border-accent-green/30 focus:ring-1 focus:ring-accent-green/10 pr-10"
                  />
                  {field.unit && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-text-muted">
                      {field.unit}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-border">
          <button
            onClick={handleReset}
            className="text-[11px] text-text-muted hover:text-accent-red transition-colors font-semibold"
          >
            Reset All
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-[11px] font-semibold bg-bg-tertiary text-text-secondary hover:text-text-primary border border-border transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className={`px-5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                hasFilters
                  ? "bg-accent-green text-bg-primary hover:shadow-glow"
                  : "bg-bg-tertiary text-text-muted border border-border"
              }`}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
