"use client";

import Image from "next/image";
import Link from "next/link";
import { Calendar, Clock, Info, Play, Plus, Star } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  DetailSkeleton,
  MediaDetailContent,
} from "@/components/streamn/media-detail-content";
import { ResponsiveMediaModal } from "@/components/streamn/responsive-media-modal";
import { StreamnNav } from "@/components/streamn/streamn-nav";
import type { MediaDetail, MediaSummary, MediaType } from "@/lib/media";
import { tmdbImage } from "@/lib/media";
import {
  getContinueWatching,
  getLastWatched,
  watchHref,
} from "@/lib/streamn-storage";
import amazonLogo from "@/assets/images/Amazon_Prime_logo_(2024).svg";
import disneyLogo from "@/assets/images/Disney_Plus_logo.svg";
import huluLogo from "@/assets/images/Hulu_logo_(2014).svg";
import maxLogo from "@/assets/images/Max_logo.svg";
import netflixLogo from "@/assets/images/Netflix_2014_logo.svg";

type DiscoverTab = "movies" | "shows" | "genre" | "new-hot";

const providerLogoMap: Record<string, string> = {
  netflix: netflixLogo.src,
  prime: amazonLogo.src,
  disney: disneyLogo.src,
  max: maxLogo.src,
  hulu: huluLogo.src,
};

export type DiscoverPageData = {
  bannerItems: MediaSummary[];
  trendingWeek: MediaSummary[];
  trendingMovies: MediaSummary[];
  trendingTv: MediaSummary[];
  latestMovies: MediaSummary[];
  latestTv: MediaSummary[];
  topRatedMovies: MediaSummary[];
  topRatedTv: MediaSummary[];
  providers: { name: string; slug: string }[];
  movieGenres: { id: number; name: string }[];
  tvGenres: { id: number; name: string }[];
};

function useRevealOnScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || visible) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "140px 0px", threshold: 0.08 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return { ref, visible };
}

function LazyRevealRow({
  animationIndex,
  children,
  placeholderClassName = "discover-row-placeholder",
}: {
  animationIndex: number;
  children: ReactNode;
  placeholderClassName?: string;
}) {
  const { ref, visible } = useRevealOnScroll();

  return (
    <div ref={ref}>
      {visible ? (
        <div
          className='discover-row-enter'
          style={{ animationDelay: `${80 + animationIndex * 90}ms` }}
        >
          {children}
        </div>
      ) : (
        <div aria-hidden className={placeholderClassName} />
      )}
    </div>
  );
}

function MediaRow({
  title,
  items,
  onSelect,
  wide = false,
}: {
  title: ReactNode;
  items: MediaSummary[];
  onSelect: (item: MediaSummary) => void;
  wide?: boolean;
}) {
  if (!items.length) return null;

  return (
    <section className='discover-row'>
      <div className='discover-row-header'>
        <h2 className='discover-row-title'>{title}</h2>
      </div>
      <div className='discover-row-track no-scrollbar'>
        {items.map((item) => (
          <button
            className={`discover-card ${wide ? "discover-card-wide" : ""}`}
            key={`${item.mediaType}-${item.id}`}
            onClick={() => onSelect(item)}
            type='button'
          >
            <Image
              src={tmdbImage(
                wide
                  ? item.backdropPath || item.posterPath
                  : item.posterPath || item.backdropPath,
                wide ? "w780" : "w500",
              )}
              alt={item.title}
              fill
              sizes={wide ? "320px" : "180px"}
              className='object-cover'
            />
            <span className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-3 text-left'>
              <span className='block truncate text-sm font-bold'>
                {item.title}
              </span>
              <span className='mt-0.5 block text-xs text-white/55'>
                {item.year} • {item.subtitle}
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ProviderRowTitle({
  slug,
  mediaLabel,
}: {
  slug: string;
  mediaLabel: string;
}) {
  const logo = providerLogoMap[slug];

  return (
    <span className='flex flex-wrap items-center gap-2.5'>
      <span>{mediaLabel} from</span>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt='' className='discover-provider-logo' src={logo} />
      ) : null}
    </span>
  );
}

function LazyProviderRow({
  animationIndex,
  mediaLabel,
  onSelect,
  slug,
  tab,
}: {
  animationIndex: number;
  mediaLabel: string;
  onSelect: (item: MediaSummary) => void;
  slug: string;
  tab: DiscoverTab;
}) {
  const { ref, visible } = useRevealOnScroll();
  const [items, setItems] = useState<MediaSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!visible || loaded) return;

    fetch(`/api/discover/provider?slug=${slug}`)
      .then((response) => response.json())
      .then((payload) => setItems(payload.results ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoaded(true));
  }, [loaded, slug, visible]);

  const filtered = useMemo(() => {
    if (tab === "shows") return items.filter((item) => item.mediaType === "tv");
    if (tab === "movies")
      return items.filter((item) => item.mediaType === "movie");
    return items;
  }, [items, tab]);

  return (
    <div ref={ref}>
      {!visible || !loaded ? (
        <div aria-hidden className='discover-row-placeholder' />
      ) : !filtered.length ? null : (
        <div
          className='discover-row-enter'
          style={{ animationDelay: `${80 + animationIndex * 90}ms` }}
        >
          <MediaRow
            items={filtered}
            onSelect={onSelect}
            title={<ProviderRowTitle mediaLabel={mediaLabel} slug={slug} />}
          />
        </div>
      )}
    </div>
  );
}

function BannerSlideContent({
  item,
  onInfo,
}: {
  item: MediaSummary;
  onInfo: () => void;
}) {
  return (
    <>
      {item.logoPath ? (
        <Image
          src={tmdbImage(item.logoPath, "w500")}
          alt={item.title}
          width={520}
          height={180}
          className='mb-4 h-auto max-h-16 md:max-h-36 w-auto max-w-[min(100%,32rem)] object-contain object-left drop-shadow-[0_0_30px_rgba(255,255,255,0.18)]'
        />
      ) : (
        <h1 className='text-4xl font-black uppercase tracking-tight drop-shadow-[0_0_30px_rgba(255,255,255,0.18)] md:text-6xl'>
          {item.title}
        </h1>
      )}
      <div className='mt-4 flex flex-wrap gap-2'>
        <span className='detail-pill text-yellow-300'>
          <Star className='size-4 fill-current' />
          {item.voteAverage ? item.voteAverage.toFixed(1) : "New"}/10
        </span>
        {item.year ? (
          <span className='detail-pill'>
            <Calendar className='size-4' />
            {item.year}
          </span>
        ) : null}
        <span className='detail-pill'>
          <Clock className='size-4' />
          {item.subtitle}
        </span>
      </div>
      <p className='mt-4 line-clamp-2 max-w-2xl text-sm leading-7 text-white/72 md:text-base'>
        {item.overview}
      </p>
      <div className='mt-5 flex flex-wrap gap-3'>
        <Link className='primary-button' href={watchHref(item)}>
          <Play className='size-5 fill-current' />
          Play
        </Link>
        <button className='ghost-button' onClick={onInfo} type='button'>
          <Info className='size-5' /> Info
        </button>
      </div>
    </>
  );
}

export function DiscoverApp({ data }: { data: DiscoverPageData }) {
  const [tab, setTab] = useState<DiscoverTab>("movies");
  const [genreMediaType, setGenreMediaType] = useState<MediaType>("movie");
  const [bannerIndex, setBannerIndex] = useState(0);
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null);
  const [genreResults, setGenreResults] = useState<MediaSummary[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);
  const continueWatching = useMemo(() => getContinueWatching(), []);
  const [becauseYouWatched, setBecauseYouWatched] = useState<MediaSummary[]>(
    [],
  );
  const [becauseTitle, setBecauseTitle] = useState("");
  const [selected, setSelected] = useState<MediaSummary | null>(null);
  const [detail, setDetail] = useState<MediaDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const bannerItems = data.bannerItems.length
    ? data.bannerItems
    : data.trendingWeek;
  const activeBanner = bannerItems[bannerIndex % bannerItems.length];

  const topRatedRow = useMemo(() => {
    const items =
      tab === "shows"
        ? data.topRatedTv
        : tab === "movies"
          ? data.topRatedMovies
          : [...data.topRatedMovies, ...data.topRatedTv];

    const seen = new Set<string>();
    return items.filter((item) => {
      const key = `${item.mediaType}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [data.topRatedMovies, data.topRatedTv, tab]);

  useEffect(() => {
    if (bannerItems.length <= 1) return;
    const timer = window.setInterval(() => {
      setBannerIndex((current) => (current + 1) % bannerItems.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, [bannerItems.length]);

  useEffect(() => {
    const lastWatched = getLastWatched();
    if (!lastWatched) return;

    const updateRecommendations = async () => {
      setBecauseTitle(lastWatched.title);

      try {
        const response = await fetch(
          `/api/recommendations?type=${lastWatched.mediaType}&id=${lastWatched.id}`,
        );
        const payload = await response.json();
        setBecauseYouWatched(payload.results ?? []);
      } catch {
        setBecauseYouWatched([]);
      }
    };

    updateRecommendations();
  }, []);

  useEffect(() => {
    if (tab !== "genre" || !selectedGenre) return;

    const loadGenreResults = async () => {
      setGenreLoading(true);

      try {
        const response = await fetch(
          `/api/discover/genre?type=${genreMediaType}&genre=${selectedGenre}`,
        );
        const payload = await response.json();
        setGenreResults(payload.results ?? []);
      } catch {
        setGenreResults([]);
      } finally {
        setGenreLoading(false);
      }
    };

    loadGenreResults();
  }, [genreMediaType, selectedGenre, tab]);

  const mediaFilter = useMemo(() => {
    if (tab === "shows") return (item: MediaSummary) => item.mediaType === "tv";
    if (tab === "movies")
      return (item: MediaSummary) => item.mediaType === "movie";
    return () => true;
  }, [tab]);

  const trendingRow = useMemo(() => {
    const source =
      tab === "shows"
        ? data.trendingTv
        : tab === "movies"
          ? data.trendingMovies
          : data.trendingWeek;
    return source.filter(mediaFilter);
  }, [
    data.trendingMovies,
    data.trendingTv,
    data.trendingWeek,
    mediaFilter,
    tab,
  ]);

  const newAndHotRow = useMemo(() => {
    const latest = tab === "shows" ? data.latestTv : data.latestMovies;
    const trending = tab === "shows" ? data.trendingTv : data.trendingMovies;
    const merged = [...latest, ...trending];
    const seen = new Set<string>();
    return merged.filter((item) => {
      const key = `${item.mediaType}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return mediaFilter(item);
    });
  }, [
    data.latestMovies,
    data.latestTv,
    data.trendingMovies,
    data.trendingTv,
    mediaFilter,
    tab,
  ]);

  const providerRows = useMemo(() => data.providers, [data.providers]);

  async function openDetail(item: MediaSummary) {
    setSelected(item);
    setDetail(null);
    setDetailLoading(true);

    try {
      const response = await fetch(
        `/api/details?type=${item.mediaType}&id=${item.id}`,
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Could not load detail.");
      setDetail(payload);
    } catch {
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  }

  const genres = genreMediaType === "tv" ? data.tvGenres : data.movieGenres;
  let rowIndex = 0;

  return (
    <main className='discover-shell pb-24 md:pb-20'>
      <div className='morph-bg' />
      <div className='grain' />
      <StreamnNav />

      <section className='discover-banner relative z-10'>
        {bannerItems.length ? (
          <>
            {bannerItems.slice(0, 5).map((item, index) => (
              <div
                className={`discover-banner-slide ${index === bannerIndex % bannerItems.length ? "discover-banner-slide-active" : ""}`}
                key={`${item.mediaType}-${item.id}`}
              >
                <Image
                  src={tmdbImage(
                    item.backdropPath || item.posterPath,
                    "original",
                  )}
                  alt=''
                  fill
                  priority={index === 0}
                  sizes='100vw'
                  className='object-cover'
                />
              </div>
            ))}
            <div className='discover-banner-overlay' />
            {activeBanner ? (
              <button
                className='discover-banner-click-area'
                onClick={() => openDetail(activeBanner)}
                type='button'
                aria-label='Open banner details'
              />
            ) : null}
            <div className='discover-banner-inner'>
              <div className='discover-banner-copy-stack'>
                {bannerItems.slice(0, 5).map((item, index) => (
                  <div
                    className={`discover-banner-copy ${index === bannerIndex % bannerItems.length ? "discover-banner-copy-active" : ""}`}
                    key={`content-${item.mediaType}-${item.id}`}
                  >
                    <BannerSlideContent
                      item={item}
                      onInfo={() => openDetail(item)}
                    />
                  </div>
                ))}
              </div>
            </div>
            {bannerItems.length > 1 ? (
              <div className='discover-dots'>
                {bannerItems.slice(0, 5).map((item, index) => (
                  <button
                    aria-label={`Show banner ${index + 1}`}
                    className={`discover-dot ${index === bannerIndex % bannerItems.length ? "discover-dot-active" : ""}`}
                    key={`dot-${item.mediaType}-${item.id}`}
                    onClick={() => setBannerIndex(index)}
                    type='button'
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </section>
      <section className='discover-tab-strip'>
        <div className='discover-tabs discover-tabs-sticky'>
          {(
            [
              ["movies", "Movies"],
              ["shows", "Shows"],
              ["genre", "Genre"],
              ["new-hot", "New & Hot"],
            ] as const
          ).map(([value, label]) => (
            <button
              className={`discover-tab ${tab === value ? "discover-tab-active" : ""}`}
              key={`mobile-${value}`}
              onClick={() => {
                setTab(value);
                if (value !== "genre") setSelectedGenre(null);
              }}
              type='button'
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className='relative z-10 mx-auto w-full max-w-[1500px] px-5 py-8 md:px-10'>
        {tab === "genre" ? (
          <>
            <div className='genre-chip-row'>
              {(["movie", "tv"] as const).map((value) => (
                <button
                  className={`prompt-chip ${genreMediaType === value ? "prompt-chip-active" : ""}`}
                  key={value}
                  onClick={() => {
                    setGenreMediaType(value);
                    setSelectedGenre(null);
                  }}
                  type='button'
                >
                  {value === "movie" ? "Movies" : "Shows"}
                </button>
              ))}
            </div>
            <div className='genre-chip-row'>
              {genres.slice(0, 18).map((genre) => (
                <button
                  className={`prompt-chip ${selectedGenre === genre.id ? "prompt-chip-active" : ""}`}
                  key={genre.id}
                  onClick={() => setSelectedGenre(genre.id)}
                  type='button'
                >
                  {genre.name}
                </button>
              ))}
            </div>
            {genreLoading ? (
              <div className='empty-state min-h-40'>Loading genre picks...</div>
            ) : (
              <LazyRevealRow animationIndex={rowIndex++}>
                <MediaRow
                  items={genreResults}
                  onSelect={openDetail}
                  title={
                    selectedGenre ? "Genre picks" : "Choose a genre to explore"
                  }
                  wide
                />
              </LazyRevealRow>
            )}
          </>
        ) : null}

        {tab !== "genre" ? (
          <>
            {continueWatching.filter(mediaFilter).length ? (
              <LazyRevealRow animationIndex={rowIndex++}>
                <MediaRow
                  items={continueWatching.filter(mediaFilter)}
                  onSelect={openDetail}
                  title='Continue Watching'
                />
              </LazyRevealRow>
            ) : null}

            {becauseYouWatched.length ? (
              <LazyRevealRow animationIndex={rowIndex++}>
                <MediaRow
                  items={becauseYouWatched.filter(mediaFilter)}
                  onSelect={openDetail}
                  title={`Because you watched ${becauseTitle}`}
                  wide
                />
              </LazyRevealRow>
            ) : null}

            {tab === "new-hot" ? (
              <LazyRevealRow animationIndex={rowIndex++}>
                <MediaRow
                  items={newAndHotRow}
                  onSelect={openDetail}
                  title='New & Hot'
                  wide
                />
              </LazyRevealRow>
            ) : (
              <LazyRevealRow animationIndex={rowIndex++}>
                <MediaRow
                  items={trendingRow}
                  onSelect={openDetail}
                  title='Trending This Week'
                  wide
                />
              </LazyRevealRow>
            )}

            {topRatedRow.length ? (
              <LazyRevealRow animationIndex={rowIndex++}>
                <MediaRow
                  items={topRatedRow}
                  onSelect={openDetail}
                  title={
                    tab === "shows"
                      ? "Top Rated Series"
                      : tab === "movies"
                        ? "Top Rated Movies"
                        : "Top Rated"
                  }
                  wide
                />
              </LazyRevealRow>
            ) : null}

            {providerRows.map((row) => (
              <LazyProviderRow
                animationIndex={rowIndex++}
                key={row.slug}
                mediaLabel={tab === "shows" ? "Shows" : "Movies"}
                onSelect={openDetail}
                slug={row.slug}
                tab={tab}
              />
            ))}
          </>
        ) : null}
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
          <MediaDetailContent detail={detail} onSelect={openDetail} />
        )}
      </ResponsiveMediaModal>
    </main>
  );
}
