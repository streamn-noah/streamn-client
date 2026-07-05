"use client";

import Image from "next/image";
import {
  RiSearch2Line,
  RiSearch2Fill,
  RiSparklingLine,
  RiSparklingFill,
  RiDice5Line,
  RiDice5Fill,
  RiStarFill,
} from "@remixicon/react";
import { Loader2, Tv, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  DetailSkeleton,
  MediaDetailContent,
} from "@/components/streamn/media-detail-content";
import { ResponsiveMediaModal } from "@/components/streamn/responsive-media-modal";
import { StreamnNav } from "@/components/streamn/streamn-nav";
import { type MediaDetail, type MediaSummary, tmdbImage } from "@/lib/media";
import { setRouletteQueue, watchHref } from "@/lib/streamn-storage";

type TabMode = "title" | "ai" | "roulette";

const promptExamples = [
  "something scary but not too scary",
  "a clever sci-fi mystery with rain-soaked city vibes",
  "comfort comedy for a Sunday night",
  "romantic drama with rich people problems",
];

const roulettePrompts = [
  "high tension thriller",
  "space survival",
  "cozy animated adventure",
  "crime mystery",
  "red-hot action movie",
  "slow-burn horror",
];

function MediaCard({
  item,
  onSelect,
}: {
  item: MediaSummary;
  onSelect: (item: MediaSummary) => void;
}) {
  return (
    <div
      className="flex flex-col gap-1.5 shrink-0 group cursor-pointer"
      onClick={() => onSelect(item)}
    >
      <div className="relative aspect-[1/1.4] w-full rounded-xl overflow-hidden bg-zinc-900 border border-white/5 shadow-md group-hover:-translate-y-1.5 group-hover:ring-2 group-hover:ring-white/40 group-hover:border-white/50 transition-all duration-300">
        <Image
          src={tmdbImage(item.posterPath || item.backdropPath, "w500")}
          alt={item.title}
          fill
          sizes="(max-width: 640px) 150px, 200px"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
      <div className="flex flex-col gap-0.5 px-0.5">
        <h3 className="text-white font-semibold text-xs sm:text-sm line-clamp-1 group-hover:text-white/90 transition-colors">
          {item.title}
        </h3>
        <div className="flex items-center gap-1 text-[11px] sm:text-xs text-white/50 font-medium">
          <RiStarFill className="w-3 h-3 text-white shrink-0" />
          <span>{item.voteAverage ? item.voteAverage.toFixed(1) : "N/A"}</span>
          <span>·</span>
          <span>{item.year || "2026"}</span>
          <span>·</span>
          <span className="capitalize">{item.mediaType === "movie" ? "Movie" : "Series"}</span>
        </div>
      </div>
    </div>
  );
}

export function StreamnApp() {
  const [tab, setTab] = useState<TabMode>("title");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaSummary[]>([]);
  const [label, setLabel] = useState("Trending in Nigeria");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<MediaSummary | null>(null);
  const [detail, setDetail] = useState<MediaDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [roulettePrompt, setRoulettePrompt] = useState(roulettePrompts[0]);

  // Initial fetch for trending items on mount
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetch("/api/search?mode=title&q=a")
      .then((res) => res.json())
      .then((data) => {
        if (mounted && data.results?.length) {
          setResults(data.results);
          setLabel("Trending in Nigeria");
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const placeholder = useMemo(() => {
    if (tab === "title") return "Movies, shows, anime and more";
    if (tab === "ai") return "Describe your mood (e.g. scary sci-fi comedy)";
    return "Pick a vibe and spin";
  }, [tab]);

  async function loadDetails(item: MediaSummary) {
    setSelected(item);
    setDetail(null);
    setDetailLoading(true);
    try {
      const response = await fetch(
        `/api/details?type=${item.mediaType}&id=${item.id}`
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load detail.");
      setDetail(data);
    } catch (detailError) {
      setError(
        detailError instanceof Error
          ? detailError.message
          : "Could not load detail."
      );
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function onSubmit(event?: FormEvent) {
    event?.preventDefault();
    if (tab === "roulette") return spinRoulette();
    if (!query.trim()) return;

    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/search?mode=${tab}&q=${encodeURIComponent(query.trim())}`
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Search failed.");
      setResults(data.results ?? []);
      setLabel(data.label ?? `Results for "${query.trim()}"`);
    } catch (searchError) {
      setResults([]);
      setError(
        searchError instanceof Error ? searchError.message : "Search failed."
      );
    } finally {
      setLoading(false);
    }
  }

  async function spinRoulette(prompt = roulettePrompt) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/roulette", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Roulette failed.");
      const results = (data.results ?? []) as MediaSummary[];
      if (!results.length) throw new Error("Roulette returned no picks.");
      setRouletteQueue(results, prompt);
      window.location.assign(watchHref(results[0]));
    } catch (rouletteError) {
      setError(
        rouletteError instanceof Error
          ? rouletteError.message
          : "Roulette failed."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen bg-black text-white pl-0 md:pl-[72px] pb-24 md:pb-20 transition-all duration-300">
      <StreamnNav />

      {/* Top Search Bar Header Section */}
      <section className="relative z-10 px-4 sm:px-8 md:px-12 pt-8 pb-4 max-w-[1500px]">
        <div className="flex flex-col md:flex-row md:items-center gap-4 justify-between">
          {/* Main Search Input */}
          <form
            onSubmit={onSubmit}
            className="relative flex items-center w-full max-w-xl bg-[#161a23] border border-white/10 rounded-xl px-4 py-2.5 shadow-inner focus-within:border-white/30 transition-all"
          >
            {tab === "ai" ? (
              <RiSparklingFill className="w-5 h-5 text-white shrink-0 mr-3" />
            ) : tab === "roulette" ? (
              <RiDice5Fill className="w-5 h-5 text-white shrink-0 mr-3" />
            ) : (
              <RiSearch2Line className="w-5 h-5 text-white/50 shrink-0 mr-3" />
            )}
            <input
              type="text"
              aria-label={placeholder}
              placeholder={placeholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="bg-transparent text-white placeholder-white/30 text-xs sm:text-sm font-medium w-full outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="text-white/40 hover:text-white p-1 transition-colors mr-1"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              disabled={loading || (tab !== "roulette" && !query.trim())}
              className="px-3.5 py-1.5 rounded-lg bg-white text-black font-bold text-xs hover:bg-white/90 transition-colors shrink-0 disabled:opacity-40"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : "Search"}
            </button>
          </form>

          {/* Search Mode Toggles (Title, AI, Roulette using Remix Icons) */}
          <div className="flex items-center gap-2 bg-[#161a23] border border-white/10 p-1 rounded-xl shrink-0 w-fit">
            <button
              type="button"
              onClick={() => setTab("title")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === "title"
                  ? "bg-white text-black shadow-md"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              {tab === "title" ? (
                <RiSearch2Fill className="w-3.5 h-3.5 text-black" />
              ) : (
                <RiSearch2Line className="w-3.5 h-3.5" />
              )}
              <span>Title</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("ai")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === "ai"
                  ? "bg-white text-black shadow-md"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              {tab === "ai" ? (
                <RiSparklingFill className="w-3.5 h-3.5 text-black" />
              ) : (
                <RiSparklingLine className="w-3.5 h-3.5" />
              )}
              <span>AI Search</span>
            </button>

            <button
              type="button"
              onClick={() => setTab("roulette")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === "roulette"
                  ? "bg-white text-black shadow-md"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              {tab === "roulette" ? (
                <RiDice5Fill className="w-3.5 h-3.5 text-black" />
              ) : (
                <RiDice5Line className="w-3.5 h-3.5" />
              )}
              <span>Roulette</span>
            </button>
          </div>
        </div>

        {/* AI Prompt Suggestions */}
        {tab === "ai" && (
          <div className="mt-3 flex flex-wrap gap-2">
            {promptExamples.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => {
                  setQuery(prompt);
                }}
                className="px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-xs text-white/70 hover:text-white transition-all"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}

        {/* Roulette Vibe Chips */}
        {tab === "roulette" && (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap gap-2">
              {roulettePrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setRoulettePrompt(prompt)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    roulettePrompt === prompt
                      ? "bg-white text-black border-white"
                      : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {prompt}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => spinRoulette()}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-red-500 text-white font-bold text-sm shadow-xl hover:opacity-95 transition-all w-fit"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RiDice5Fill className="w-4 h-4" />
              )}
              <span>Spin: {roulettePrompt}</span>
            </button>
          </div>
        )}
      </section>

      {/* Main Grid Content Section */}
      <section className="relative z-10 px-4 sm:px-8 md:px-12 py-4 max-w-[1500px]">
        <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight mb-4">
          {label}
        </h2>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-950/20 p-4 text-xs text-red-200">
            {error}
          </div>
        )}

        {!results.length && !loading && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] text-white/50 gap-3">
            <Tv className="w-10 h-10 text-white/30" />
            <p className="text-sm">No results found. Try searching for a title or mood.</p>
          </div>
        )}

        {/* 7-Column Grid matching reference screenshot */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-7 gap-4">
          {results.map((item) => (
            <MediaCard
              key={`${item.mediaType}-${item.id}`}
              item={item}
              onSelect={loadDetails}
            />
          ))}
        </div>
      </section>

      {/* Media Detail Modal */}
      <ResponsiveMediaModal
        description={selected?.overview ?? "Media details"}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        open={Boolean(selected)}
        title={selected?.title ?? "Details"}
      >
        {detailLoading || !detail ? (
          <DetailSkeleton />
        ) : (
          <MediaDetailContent detail={detail} onSelect={loadDetails} />
        )}
      </ResponsiveMediaModal>
    </main>
  );
}
