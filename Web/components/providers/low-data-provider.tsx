"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type LowDataContextType = {
  isLowDataMode: boolean;
  toggleLowDataMode: () => void;
};

const LowDataContext = createContext<LowDataContextType | undefined>(undefined);

export function LowDataProvider({ children }: { children: ReactNode }) {
  const [isLowDataMode, setIsLowDataMode] = useState(false);

  useEffect(() => {
    // Check localStorage on mount
    const saved = localStorage.getItem("streamn-low-data-mode");
    if (saved === "true") {
      setIsLowDataMode(true);
      document.body.classList.add("low-data");
    }
  }, []);

  const toggleLowDataMode = () => {
    setIsLowDataMode((prev) => {
      const next = !prev;
      localStorage.setItem("streamn-low-data-mode", String(next));
      if (next) {
        document.body.classList.add("low-data");
      } else {
        document.body.classList.remove("low-data");
      }
      
      // Reload the page to apply all changes instantly based on SSR/hydration
      window.location.reload();
      
      return next;
    });
  };

  return (
    <LowDataContext.Provider value={{ isLowDataMode, toggleLowDataMode }}>
      {children}
    </LowDataContext.Provider>
  );
}

export function useLowDataMode() {
  const context = useContext(LowDataContext);
  if (context === undefined) {
    throw new Error("useLowDataMode must be used within a LowDataProvider");
  }
  return context;
}
