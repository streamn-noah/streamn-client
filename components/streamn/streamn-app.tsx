"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ChevronDown,
  Dices,
  Film,
  Loader2,
  Play,
  Search,
  Sparkles,
  Star,
  Tv,
  WandSparkles,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { ResponsiveMediaModal } from "@/components/streamn/responsive-media-modal";
import {
  type Episode,
  type MediaDetail,
  type MediaSummary,
  tmdbImage,
} from "@/lib/media";

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

function runtimeLabel(minutes: number | null) {
  if (!minutes) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins}m`;
  return `${hours}h ${mins}m`;
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

function DetailSkeleton() {
  return (
    <div className='modal-entrance h-[82vh] animate-pulse overflow-hidden'>
      <div className='h-[54vh] bg-white/10' />
      <div className='space-y-4 p-8'>
        <div className='h-10 w-64 rounded bg-white/10' />
        <div className='h-4 w-3/4 rounded bg-white/10' />
        <div className='h-4 w-2/3 rounded bg-white/10' />
      </div>
    </div>
  );
}

function DetailContent({
  detail,
  onSelect,
}: {
  detail: MediaDetail;
  onSelect: (item: MediaSummary) => void;
}) {
  const firstEpisode = detail.episodes[0];
  const watchHref =
    detail.mediaType === "movie"
      ? `/watch/movie/${detail.id}`
      : `/watch/tv/${detail.id}?s=${firstEpisode?.seasonNumber ?? 1}&e=${firstEpisode?.episodeNumber ?? 1}`;

  return (
    <div className='modal-entrance max-h-[90vh] overflow-y-auto bg-black text-white'>
      <section className='relative min-h-[58vh] overflow-hidden'>
        <Image
          src={tmdbImage(detail.backdropPath || detail.posterPath, "original")}
          alt=''
          fill
          sizes='100vw'
          className='object-cover'
          priority
        />
        <div className='absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/10' />
        <div className='absolute inset-0 bg-gradient-to-r from-black/75 via-transparent to-transparent' />
        <div className='detail-hero-content relative z-10 flex min-h-[58vh] max-w-3xl flex-col justify-end p-6 pt-24 md:p-10'>
          {detail.logoPath ? (
            <Image
              src={tmdbImage(detail.logoPath, "w500")}
              alt={detail.title}
              width={420}
              height={170}
              className='mb-5 h-auto max-h-32 w-auto max-w-[75%] object-contain object-left'
            />
          ) : (
            <h2 className='mb-5 max-w-2xl text-5xl font-black tracking-tight'>
              {detail.title}
            </h2>
          )}
          <div className='flex flex-wrap gap-2'>
            <span className='detail-pill text-yellow-300'>
              <Star className='size-4 fill-current' />
              {detail.voteAverage ? detail.voteAverage.toFixed(1) : "New"}/10
            </span>
            <span className='detail-pill'>{detail.year}</span>
            {runtimeLabel(detail.runtime) ? (
              <span className='detail-pill'>
                {runtimeLabel(detail.runtime)}
              </span>
            ) : null}
            <span className='detail-pill'>{detail.certification}</span>
            {detail.genres.slice(0, 3).map((genre) => (
              <span className='detail-pill' key={genre}>
                {genre}
              </span>
            ))}
          </div>
          <div className='mt-5 flex flex-wrap gap-3'>
            <Link className='primary-button' href={watchHref}>
              <Play className='size-5 fill-current' />
              Play
            </Link>
            {detail.trailerKey ? (
              <a
                className='ghost-button'
                href={`https://www.youtube.com/watch?v=${detail.trailerKey}`}
                rel='noreferrer'
                target='_blank'
              >
                <Film className='size-5' />
                Trailer
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className='modal-body-entrance space-y-9 px-6 pb-10 pt-6 md:px-10'>
        <p className='max-w-4xl text-base leading-7 text-white/65 md:text-lg'>
          {detail.overview}
        </p>

        {detail.cast.length ? (
          <div>
            <h3 className='section-title'>Cast</h3>
            <div className='no-scrollbar flex gap-4 overflow-x-auto pb-2'>
              {detail.cast.map((member) => (
                <div className='w-28 shrink-0' key={member.id}>
                  <div className='relative h-36 overflow-hidden rounded-2xl bg-white/8'>
                    {member.profilePath ? (
                      <Image
                        src={tmdbImage(member.profilePath, "w185")}
                        alt=''
                        fill
                        sizes='112px'
                        className='object-cover'
                      />
                    ) : null}
                  </div>
                  <p className='mt-3 truncate text-sm font-bold text-white'>
                    {member.name}
                  </p>
                  <p className='truncate text-xs text-white/45'>
                    {member.character}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {detail.episodes.length ? (
          <Episodes
            initialEpisodes={detail.episodes}
            mediaId={detail.id}
            seasons={detail.seasons}
          />
        ) : null}

        {detail.recommendations.length ? (
          <div>
            <h3 className='section-title'>More Like This</h3>
            <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
              {detail.recommendations.slice(0, 8).map((item) => (
                <button
                  className='group relative aspect-[16/9] overflow-hidden rounded-2xl bg-white/8 text-left'
                  key={`${item.mediaType}-${item.id}`}
                  onClick={() => onSelect(item)}
                  type='button'
                >
                  <Image
                    src={tmdbImage(
                      item.backdropPath || item.posterPath,
                      "w780",
                    )}
                    alt=''
                    fill
                    sizes='(max-width: 768px) 50vw, 280px'
                    className='object-cover transition group-hover:scale-105'
                  />
                  <span className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black to-transparent p-3 text-sm font-bold'>
                    {item.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Episodes({
  initialEpisodes,
  mediaId,
  seasons,
}: {
  initialEpisodes: Episode[];
  mediaId: number;
  seasons: MediaDetail["seasons"];
}) {
  const [episodes, setEpisodes] = useState(initialEpisodes);
  const [selectedSeason, setSelectedSeason] = useState(
    initialEpisodes[0]?.seasonNumber ?? seasons[0]?.seasonNumber ?? 1,
  );
  const [loadingSeason, setLoadingSeason] = useState(false);

  async function changeSeason(seasonNumber: number) {
    setSelectedSeason(seasonNumber);
    setLoadingSeason(true);

    try {
      const response = await fetch(
        `/api/season?tvId=${mediaId}&season=${seasonNumber}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load season.");
      setEpisodes(data.episodes ?? []);
    } finally {
      setLoadingSeason(false);
    }
  }

  return (
    <div>
      <div className='mb-4 flex items-center justify-between gap-4'>
        <h3 className='section-title mb-0'>Episodes</h3>
        <label className='season-select-wrap'>
          <span className='sr-only'>Choose season</span>
          <select
            className='season-select'
            disabled={loadingSeason}
            onChange={(event) => changeSeason(Number(event.target.value))}
            value={selectedSeason}
          >
            {seasons.map((season) => (
              <option key={season.id} value={season.seasonNumber}>
                {season.name}
              </option>
            ))}
          </select>
          <ChevronDown className='pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-white/55' />
        </label>
      </div>
      <div
        className={`episode-list overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] ${loadingSeason ? "opacity-55" : ""}`}
      >
        {episodes.slice(0, 8).map((episode) => (
          <Link
            className='grid grid-cols-[2rem_7rem_1fr] gap-4 border-b border-white/8 p-4 transition hover:bg-white/[0.05] md:grid-cols-[2.5rem_12.5rem_1fr_4rem]'
            href={`/watch/tv/${mediaId}?s=${episode.seasonNumber}&e=${episode.episodeNumber}`}
            key={episode.id}
          >
            <span className='self-center text-2xl font-bold text-white/45'>
              {episode.episodeNumber}
            </span>
            <span className='relative aspect-video overflow-hidden rounded-xl bg-white/8'>
              {episode.stillPath ? (
                <Image
                  src={tmdbImage(episode.stillPath, "w300")}
                  alt=''
                  fill
                  sizes='200px'
                  className='object-cover'
                />
              ) : null}
            </span>
            <span className='min-w-0'>
              <span className='block truncate text-base font-bold text-white'>
                {episode.name}
              </span>
              <span className='mt-1 block text-sm text-white/45'>
                {episode.airDate}
              </span>
              <span className='mt-2 line-clamp-2 text-sm leading-6 text-white/55'>
                {episode.overview}
              </span>
            </span>
            <span className='hidden self-start pt-1 text-sm font-semibold text-white/55 md:block'>
              {runtimeLabel(episode.runtime)}
            </span>
          </Link>
        ))}
      </div>
    </div>
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
      const pick = data.result as MediaSummary;
      window.location.assign(
        pick.mediaType === "movie"
          ? `/watch/movie/${pick.id}`
          : `/watch/tv/${pick.id}?s=1&e=1`,
      );
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
    <main className='relative min-h-screen overflow-hidden bg-[#050101] text-white'>
      <div className='morph-bg' />
      <div className='grain' />

      {/* <nav className="floating-nav">
        <Clapperboard className="size-5 text-red-500" />
        <span>Home</span>
        <span>Movies</span>
        <span>Series</span>
        <span>Discover</span>
      </nav> */}

      <section className='relative z-10 mx-auto flex min-h-[54vh] w-full max-w-5xl flex-col items-center justify-center px-5 pb-10 pt-28 text-center'>
        <p className='reveal mb-3 rounded-full tracking-widest font-bold uppercase border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-200'>
          Beta
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
          <DetailContent detail={detail} onSelect={loadDetails} />
        )}
      </ResponsiveMediaModal>
    </main>
  );
}
