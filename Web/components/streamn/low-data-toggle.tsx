"use client";

import { Activity } from "lucide-react";
import { useLowDataMode } from "@/components/providers/low-data-provider";

export function LowDataToggle() {
  const { isLowDataMode, toggleLowDataMode } = useLowDataMode();

  return (
    <button
      onClick={toggleLowDataMode}
      className={`fixed top-4 right-4 md:top-6 md:right-6 z-50 flex items-center justify-center gap-2 px-3 py-2 rounded-full backdrop-blur-xl border transition-all duration-300 group shadow-2xl ${isLowDataMode
        ? "bg-green-500/20 border-green-500/50 text-green-400 hover:bg-green-500/30"
        : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
        }`}
      aria-label="Toggle Low Data Mode"
      title={isLowDataMode ? "Disable Low Data Mode" : "Enable Low Data Mode"}
    >
      <Activity className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" />
      <span className="text-[11px] font-bold tracking-wide uppercase sm:inline-block">
        Data saver: {isLowDataMode ? "ON" : "OFF"}
      </span>
      {/* Optional tiny indicator dot */}
      {isLowDataMode && (
        <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-black" />
      )}
    </button>
  );
}
