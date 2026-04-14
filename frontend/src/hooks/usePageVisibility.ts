"use client";

import { useState, useEffect } from "react";

/**
 * Returns true when the page/tab is visible, false when hidden.
 * Use to reduce polling intervals when the user isn't looking.
 */
export function usePageVisibility(): boolean {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    function handleVisibility() {
      setIsVisible(document.visibilityState === "visible");
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  return isVisible;
}

/**
 * Returns a refetch interval that is multiplied by a factor when the tab is hidden.
 * @param baseInterval - interval in ms when tab is visible
 * @param hiddenMultiplier - factor to multiply by when hidden (default 4x)
 */
export function useVisibilityInterval(baseInterval: number, hiddenMultiplier = 4): number {
  const isVisible = usePageVisibility();
  return isVisible ? baseInterval : baseInterval * hiddenMultiplier;
}
