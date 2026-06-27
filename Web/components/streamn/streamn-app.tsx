"use client";

import Image from "next/image";
import {
  Dices,
  Loader2,
  Search,
  Sparkles,
  Tv,
  WandSparkles,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
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

function yearAndType(item: MediaSummary) {
  return [item.year, item.mediaType === "movie" ? "Movie" : "Series"]
    .filter(Boolean)
    .join(" • ");
}

function ResultsCard({
  item,
  onSelect,
}: {
  item: MediaSummary;
  onSelect: (item: MediaSummary) => void;
}) {
  return (
    <button
      className='group media-card text-left'
      onClick={() => onSelect(item)}
      type='button'
    >
      <Image
        src={tmdbImage(item.posterPath || item.backdropPath, "w500")}
        alt=''
        fill
        sizes='(max-width: 768px) 44vw, 220px'
        className='object-cover transition duration-500 group-hover:scale-105'
      />
      {/* <span className='absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-black/45 text-white backdrop-blur'>
        +
      </span> */}
      <span className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/60 to-transparent p-4 opacity-0 transition group-hover:opacity-100'>
        <span className='block text-base font-bold text-white'>
          {item.title}
        </span>
        <span className='mt-1 block text-sm text-white/65'>
          {yearAndType(item)}
        </span>
      </span>
    </button>
  );
}

export function StreamnApp() {
  const [tab, setTab] = useState<TabMode>("title");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MediaSummary[]>([]);
  const [label, setLabel] = useState("Search for a movie, show, or mood");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<MediaSummary | null>(null);
  const [detail, setDetail] = useState<MediaDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [roulettePrompt, setRoulettePrompt] = useState(roulettePrompts[0]);

  const placeholder = useMemo(() => {
    if (tab === "title") return "Search a movie or series title";
    if (tab === "ai") return "Describe your mood";
    return "Pick a vibe and spin";
  }, [tab]);

  async function loadDetails(item: MediaSummary) {
    setSelected(item);
    setDetail(null);
    setDetailLoading(true);
    try {
      const response = await fetch(
        `/api/details?type=${item.mediaType}&id=${item.id}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load detail.");
      setDetail(data);
    } catch (detailError) {
      setError(
        detailError instanceof Error
          ? detailError.message
          : "Could not load detail.",
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
        `/api/search?mode=${tab}&q=${encodeURIComponent(query.trim())}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Search failed.");
      setResults(data.results ?? []);
      setLabel(data.label ?? `${data.results?.length ?? 0} results`);
    } catch (searchError) {
      setResults([]);
      setError(
        searchError instanceof Error ? searchError.message : "Search failed.",
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
          : "Roulette failed.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className='relative min-h-screen overflow-hidden bg-[#050101] pb-24 text-white md:pb-20'>
      <div className='morph-bg' />
      <div className='grain' />

      <StreamnNav />

      <section className='relative z-10 mx-auto flex min-h-[54vh] w-full max-w-5xl flex-col items-center justify-center px-5 pb-10 pt-28 text-center'>
        <p className='reveal mb-3 rounded-full tracking-widest font-bold uppercase border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-200'>
          Streamn Beta by Noah
        </p>
        <h1 className='reveal reveal-delay-2 max-w-3xl text-5xl font-bold leading-none tracking-tight sm:text-5xl md:text-6xl'>
          Find the perfect thing to watch.
        </h1>

        <div className='reveal reveal-delay-2 mt-8 rounded-full border border-white/10 bg-black/35 p-1 shadow-2xl shadow-red-950/30 backdrop-blur-xl'>
          {[
            ["title", Search, "Title Search"],
            ["ai", Sparkles, "AI Search"],
            ["roulette", Dices, "Roulette"],
          ].map(([value, Icon, labelText]) => (
            <button
              className={`tab-button ${tab === value ? "tab-button-active" : ""}`}
              key={value as string}
              onClick={() => setTab(value as TabMode)}
              type='button'
            >
              <Icon className='size-4' />
              {labelText as string}
            </button>
          ))}
        </div>

        {tab === "roulette" ? (
          <div className='mt-7 w-full max-w-3xl'>
            <div className='flex flex-wrap justify-center gap-2'>
              {roulettePrompts.map((prompt) => (
                <button
                  className={`prompt-chip ${roulettePrompt === prompt ? "prompt-chip-active" : ""}`}
                  key={prompt}
                  onClick={() => setRoulettePrompt(prompt)}
                  type='button'
                >
                  {prompt}
                </button>
              ))}
            </div>
            <button
              className={`search-shell mx-auto mt-5 max-w-md justify-center ${loading ? "search-shell-loading" : ""}`}
              onClick={() => spinRoulette()}
              type='button'
            >
              {loading ? (
                <Loader2 className='size-5 animate-spin' />
              ) : (
                <Dices className='size-5 text-red-300' />
              )}
              <span>Spin: {roulettePrompt}</span>
            </button>
          </div>
        ) : (
          <form
            className={`search-shell reveal reveal-delay-3 mt-7 ${loading ? "search-shell-loading" : ""}`}
            onSubmit={onSubmit}
          >
            {tab === "ai" ? (
              <WandSparkles className='size-6 text-red-300' />
            ) : (
              <Search className='size-6 text-white/55' />
            )}
            <input
              aria-label={placeholder}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              value={query}
            />
            {query ? (
              <button
                className='icon-button'
                onClick={() => setQuery("")}
                type='button'
              >
                <X className='size-5' />
              </button>
            ) : null}
            <button
              className='submit-button'
              disabled={loading || !query.trim()}
              type='submit'
            >
              {loading ? (
                <Loader2 className='size-5 animate-spin' />
              ) : (
                <Search className='size-5' />
              )}
            </button>
          </form>
        )}

        {tab === "ai" ? (
          <div className='reveal reveal-delay-4 mt-4 flex max-w-3xl flex-wrap justify-center gap-2'>
            {promptExamples.map((prompt) => (
              <button
                className='prompt-chip'
                key={prompt}
                onClick={() => {
                  setQuery(prompt);
                  setTab("ai");
                }}
                type='button'
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <section className='relative z-10 mx-auto w-full max-w-[1500px] px-5 pb-20 md:px-10'>
        <div className='results-heading mb-5 flex items-center justify-between'>
          <p className='text-sm font-semibold text-white/45'>{label}</p>
          {results.length ? (
            <span className='text-sm text-white/35'>
              {results.length} {results.length === 1 ? "pick" : "picks"}
            </span>
          ) : null}
        </div>

        {error ? (
          <div className='rounded-2xl border border-red-500/25 bg-red-950/30 p-4 text-sm text-red-100'>
            {error}
          </div>
        ) : null}

        {!results.length && !loading ? (
          <div className='empty-state'>
            <Tv className='size-8 text-red-300' />
            <p>Search by title, describe a mood, or spin the roulette wheel.</p>
          </div>
        ) : null}

        <div className='results-grid grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'>
          {results.map((item) => (
            <ResultsCard
              item={item}
              key={`${item.mediaType}-${item.id}`}
              onSelect={loadDetails}
            />
          ))}
        </div>
      </section>

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
