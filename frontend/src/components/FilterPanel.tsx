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
    // Age: user enters minutes — convert to createdAt timestamps
    const ageMin = draft["ageMin"];
    const ageMax = draft["ageMax"];
    if (ageMin !== undefined && ageMin !== "") {
      // Min age → maxCreatedAt (created no later than X minutes ago)
      filters.maxCreatedAt = Date.now() - Number(ageMin) * 60000;
    }
    if (ageMax !== undefined && ageMax !== "") {
      // Max age → minCreatedAt (created no earlier than X minutes ago)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-bg-primary border border-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <h2 className="text-sm font-bold uppercase tracking-wide text-text-primary">Filters</h2>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-primary text-lg leading-none transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Filter fields */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto scrollbar-thin space-y-3">
          {/* Age row (special — uses minutes) */}
          <div className="flex items-center gap-3">
            <span className="w-24 text-sm text-text-secondary flex-shrink-0">Age</span>
            <div className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  placeholder="Min"
                  value={draft["ageMin"] || ""}
                  onChange={(e) => updateField("ageMin", e.target.value)}
                  className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/60 pr-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">min</span>
              </div>
              <div className="relative flex-1">
                <input
                  type="number"
                  placeholder="Max"
                  value={draft["ageMax"] || ""}
                  onChange={(e) => updateField("ageMax", e.target.value)}
                  className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/60 pr-10"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">min</span>
              </div>
            </div>
          </div>

          {/* Standard filter rows */}
          {FILTER_FIELDS.filter((field) => {
            // Hide B. Curve filter for migrated (graduated) tokens — they are off bonding curve by definition
            if (columnType === "migrated" && field.label === "B. Curve") return false;
            return true;
          }).map((field) => (
            <div key={field.label} className="flex items-center gap-3">
              <span className="w-24 text-sm text-text-secondary flex-shrink-0">{field.label}</span>
              <div className="flex-1 flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    placeholder="Min"
                    value={draft[field.minKey] || ""}
                    onChange={(e) => updateField(field.minKey, e.target.value)}
                    className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/60 pr-10"
                  />
                  {field.unit && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">
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
                    className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue/60 pr-10"
                  />
                  {field.unit && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">
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
            className="text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            Reset
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-medium bg-bg-tertiary text-text-secondary hover:text-text-primary border border-border transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className={`px-5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                hasFilters
                  ? "bg-white text-black hover:bg-gray-200"
                  : "bg-bg-tertiary text-text-muted"
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
