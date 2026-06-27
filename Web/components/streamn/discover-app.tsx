"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Clock, Info, Play, X } from "lucide-react";
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
  removeFromStorage,
} from "@/lib/streamn-storage";
import amazonLogo from "@/assets/images/Amazon_Prime_logo_(2024).svg";
import disneyLogo from "@/assets/images/Disney_Plus_logo.svg";
import huluLogo from "@/assets/images/Hulu_logo_(2014).svg";
import maxLogo from "@/assets/images/Max_logo.svg";
import netflixLogo from "@/assets/images/Netflix_2014_logo.svg";
import { useAuth } from "@/components/providers/auth-provider";

const providerLogoMap: Record<string, string> = {
  netflix: netflixLogo.src,
  prime: amazonLogo.src,
  disney: disneyLogo.src,
  max: maxLogo.src,
  hulu: huluLogo.src,
};

const PROVIDER_SLUGS = ["netflix", "prime", "disney", "max", "hulu"] as const;

export type DiscoverPageData = {
  bannerItems: MediaSummary[];
  trendingWeek: MediaSummary[];
  trendingMovies: MediaSummary[];
  trendingTv: MediaSummary[];
  trendingMoviesToday: MediaSummary[];
  trendingTvToday: MediaSummary[];
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
  isTrending = false,
  onRemove,
  showTitle = false,
}: {
  title: ReactNode;
  items: MediaSummary[];
  onSelect: (item: MediaSummary) => void;
  wide?: boolean;
  isTrending?: boolean;
  onRemove?: (item: MediaSummary) => void;
  showTitle?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  if (!items.length) return null;

  const scrollLeft = () => {
    trackRef.current?.scrollBy({
      left: -(window.innerWidth * 0.7),
      behavior: "smooth",
    });
  };
  const scrollRight = () => {
    trackRef.current?.scrollBy({
      left: window.innerWidth * 0.7,
      behavior: "smooth",
    });
  };

  return (
    <section className='discover-row relative'>
      <div className='discover-row-header'>
        <h2 className='discover-row-title'>{title}</h2>
      </div>

      <div className='relative group'>
        {/* Left arrow */}
        <button
          className='absolute left-0 top-0 bottom-0 z-20 w-14 bg-linear-to-r from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center'
          onClick={scrollLeft}
          aria-label='Scroll left'
        >
          <svg
            xmlns='http://www.w3.org/2000/svg'
            className='w-7 h-7 text-white drop-shadow'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
            strokeWidth={2.5}
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              d='M15 19l-7-7 7-7'
            />
          </svg>
        </button>

        <div className='discover-row-track no-scrollbar' ref={trackRef}>
          {/* leading padding */}
          <div className='shrink-0 w-5 md:w-8' />
          {items.map((item, index) => (
            <div
              key={`${item.mediaType}-${item.id}`}
              className={`relative flex items-end shrink-0 ${isTrending ? "trending-rank-wrapper" : ""}`}
            >
              {isTrending && (
                <div className='trending-rank-number' data-n={index + 1}>
                  {index + 1}
                </div>
              )}
              <button
                className={`discover-card relative ${wide ? "discover-card-wide" : ""} ${isTrending ? "relative z-[2]" : ""}`}
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
                {/* Title overlay for wide/landscape cards */}
                {(wide || showTitle) && (
                  <div className='absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/40 to-transparent px-3 pt-6 pb-2 pointer-events-none'>
                    <p className='text-white text-xs font-bold line-clamp-1 drop-shadow-md'>
                      {item.title}
                    </p>
                    {item.year && (
                      <p className='text-white/50 text-[10px]'>{item.year}</p>
                    )}
                  </div>
                )}
                {onRemove && (
                  <div
                    className='absolute top-2 right-2 bg-black/60 rounded-full p-1 hover:bg-red-600 transition-colors z-20'
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(item);
                    }}
                  >
                    <X className='w-4 h-4 text-white' />
                  </div>
                )}
              </button>
            </div>
          ))}
          {/* trailing padding */}
          <div className='shrink-0 w-5 md:w-8' />
        </div>

        {/* Right arrow */}
        <button
          className='absolute right-0 top-0 bottom-0 z-20 w-14 bg-linear-to-l from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center'
          onClick={scrollRight}
          aria-label='Scroll right'
        >
          <svg
            xmlns='http://www.w3.org/2000/svg'
            className='w-7 h-7 text-white drop-shadow'
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
            strokeWidth={2.5}
          >
            <path
              strokeLinecap='round'
              strokeLinejoin='round'
              d='M9 5l7 7-7 7'
            />
          </svg>
        </button>

        {/* Right-edge gradient fade */}
        <div className='pointer-events-none absolute top-0 right-0 h-full w-24 bg-linear-to-l from-black to-transparent z-10' />
      </div>
    </section>
  );
}

function LazyMyListRow({
  animationIndex,
  onSelect,
}: {
  animationIndex: number;
  onSelect: (item: MediaSummary) => void;
}) {
  const { user } = useAuth();
  const { ref, visible } = useRevealOnScroll();
  const [items, setItems] = useState<MediaSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user || !visible || loaded) return;
    fetch("/api/library")
      .then((r) => r.json())
      .then((data) => setItems(data.results ?? []))
      .catch(() => setItems([]))
      .finally(() => setLoaded(true));
  }, [user, visible, loaded]);

  if (!user) return null;

  return (
    <div ref={ref}>
      {!visible || !loaded ? (
        <div aria-hidden className='discover-row-placeholder' />
      ) : !items.length ? null : (
        <div
          className='discover-row-enter'
          style={{ animationDelay: `${80 + animationIndex * 90}ms` }}
        >
          <MediaRow items={items} onSelect={onSelect} title='My List' />
        </div>
      )}
    </div>
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
      <span>{mediaLabel} on</span>
      {logo ? (
        <img
          alt=''
          className='h-5 w-auto object-contain mix-blend-screen brightness-200'
          src={logo}
        />
      ) : null}
    </span>
  );
}

function LazyProviderRow({
  animationIndex,
  mediaLabel,
  onSelect,
  slug,
  mediaType,
}: {
  animationIndex: number;
  mediaLabel: string;
  onSelect: (item: MediaSummary) => void;
  slug: string;
  mediaType: "movie" | "tv";
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

  const filtered = useMemo(
    () => items.filter((item) => item.mediaType === mediaType),
    [items, mediaType],
  );

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
          className='mb-4 h-auto max-h-24 md:max-h-40 w-auto max-w-[min(100%,32rem)] object-contain object-left drop-shadow-[0_0_30px_rgba(255,255,255,0.18)]'
        />
      ) : (
        <h1 className='text-4xl font-black uppercase tracking-tight drop-shadow-[0_0_30px_rgba(255,255,255,0.18)] md:text-6xl mb-4'>
          {item.title}
        </h1>
      )}
      <p className='mt-2 line-clamp-3 max-w-2xl text-sm leading-6 text-white md:text-lg text-shadow-md font-medium'>
        {item.overview}
      </p>
      <div className='mt-6 flex flex-wrap gap-3'>
        <Link
          className='primary-button bg-white text-black hover:bg-white/80 font-bold px-6 py-2 rounded-md flex items-center gap-2'
          href={watchHref(item)}
        >
          <Play className='size-6 fill-current' />
          Play
        </Link>
        <button
          className='ghost-button bg-zinc-500/70 hover:bg-zinc-500/50 text-white font-bold px-6 py-2 rounded-md flex items-center gap-2'
          onClick={onInfo}
          type='button'
        >
          <Info className='size-6' /> More Info
        </button>
      </div>
    </>
  );
}

export function DiscoverApp({ data }: { data: DiscoverPageData }) {
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") || "home";
  const genreId = Number(searchParams.get("genre"));
  const genreType = searchParams.get("type") as "movie" | "tv";

  const [bannerIndex, setBannerIndex] = useState(0);
  const [continueWatching, setContinueWatching] = useState<MediaSummary[]>([]);
  const [selected, setSelected] = useState<MediaSummary | null>(null);
  const [detail, setDetail] = useState<MediaDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [genreResults, setGenreResults] = useState<MediaSummary[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);

  useEffect(() => {
    setContinueWatching(getContinueWatching());
  }, []);

  const handleRemoveContinue = (item: MediaSummary) => {
    removeFromStorage("continueWatching", item);
    setContinueWatching(getContinueWatching());
  };

  const bannerItems = data.bannerItems.length
    ? data.bannerItems
    : data.trendingWeek;
  const activeBanner = bannerItems[bannerIndex % bannerItems.length];

  useEffect(() => {
    if (bannerItems.length <= 1) return;
    const timer = window.setInterval(() => {
      setBannerIndex((current) => (current + 1) % bannerItems.length);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [bannerItems.length]);

  useEffect(() => {
    if (tab !== "genre" || !genreId || !genreType) return;
    let mounted = true;
    setGenreLoading(true);
    fetch(`/api/discover/genre?type=${genreType}&genre=${genreId}`)
      .then((res) => res.json())
      .then((payload) => {
        if (mounted) setGenreResults(payload.results ?? []);
      })
      .catch(() => {
        if (mounted) setGenreResults([]);
      })
      .finally(() => {
        if (mounted) setGenreLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [tab, genreId, genreType]);

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

  let rowIndex = 0;

  const renderHomeRows = () => (
    <>
      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={continueWatching}
          onSelect={openDetail}
          title='Continue Watching'
          onRemove={handleRemoveContinue}
          wide
        />
      </LazyRevealRow>

      <LazyMyListRow animationIndex={rowIndex++} onSelect={openDetail} />

      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.trendingMoviesToday.slice(0, 10)}
          onSelect={openDetail}
          title='Top 10 Movies Today'
          wide
          isTrending
        />
      </LazyRevealRow>

      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.topRatedMovies}
          onSelect={openDetail}
          title='Top Rated Movies'
        />
      </LazyRevealRow>

      {PROVIDER_SLUGS.map((slug) => (
        <LazyProviderRow
          key={`movie-${slug}`}
          animationIndex={rowIndex++}
          mediaLabel='Movies'
          slug={slug}
          mediaType='movie'
          onSelect={openDetail}
        />
      ))}

      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.trendingTvToday.slice(0, 10)}
          onSelect={openDetail}
          title='Top 10 Series Today'
          wide
          isTrending
        />
      </LazyRevealRow>

      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.topRatedTv}
          onSelect={openDetail}
          title='Top Rated Series'
        />
      </LazyRevealRow>

      {PROVIDER_SLUGS.map((slug) => (
        <LazyProviderRow
          key={`tv-${slug}`}
          animationIndex={rowIndex++}
          mediaLabel='Series'
          slug={slug}
          mediaType='tv'
          onSelect={openDetail}
        />
      ))}
    </>
  );

  const renderMoviesRows = () => (
    <>
      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.trendingMoviesToday.slice(0, 10)}
          onSelect={openDetail}
          title='Top 10 Movies Today'
          wide
          isTrending
        />
      </LazyRevealRow>
      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.topRatedMovies}
          onSelect={openDetail}
          title='Top Rated Movies'
        />
      </LazyRevealRow>
      {PROVIDER_SLUGS.map((slug) => (
        <LazyProviderRow
          key={`movie-${slug}`}
          animationIndex={rowIndex++}
          mediaLabel='Movies'
          slug={slug}
          mediaType='movie'
          onSelect={openDetail}
        />
      ))}
    </>
  );

  const renderShowsRows = () => (
    <>
      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.trendingTvToday.slice(0, 10)}
          onSelect={openDetail}
          title='Top 10 Series Today'
          wide
          isTrending
        />
      </LazyRevealRow>
      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.topRatedTv}
          onSelect={openDetail}
          title='Top Rated Series'
        />
      </LazyRevealRow>
      {PROVIDER_SLUGS.map((slug) => (
        <LazyProviderRow
          key={`tv-${slug}`}
          animationIndex={rowIndex++}
          mediaLabel='Series'
          slug={slug}
          mediaType='tv'
          onSelect={openDetail}
        />
      ))}
    </>
  );

  const renderGenreRows = () => {
    if (genreLoading)
      return (
        <div className='empty-state min-h-40 mt-12'>Loading genre picks...</div>
      );
    return (
      <div className='mt-8'>
        <LazyRevealRow animationIndex={rowIndex++}>
          <MediaRow
            items={genreResults}
            onSelect={openDetail}
            title='Genre Picks'
            wide
          />
        </LazyRevealRow>
      </div>
    );
  };

  return (
    <main className='discover-shell pb-24 md:pb-20 bg-black min-h-screen'>
      <StreamnNav />

      {tab !== "genre" && (
        <section className='discover-banner relative z-10 mt-[-80px]'>
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
              <div className='absolute inset-0 bg-linear-to-t from-black via-black/40 to-transparent z-2' />
              <div className='absolute inset-0 bg-linear-to-r from-black/80 via-black/20 to-transparent z-2' />
              {activeBanner ? (
                <button
                  className='discover-banner-click-area z-3'
                  onClick={() => openDetail(activeBanner)}
                  type='button'
                  aria-label='Open banner details'
                />
              ) : null}
              <div className='discover-banner-inner z-4 pt-[120px]'>
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
            </>
          ) : null}
        </section>
      )}

      <section
        className={`relative z-10 mx-auto w-full max-w-[100vw] overflow-hidden px-4 md:px-6 py-8 ${tab === "genre" ? "pt-24" : "-mt-16"}`}
      >
        {tab === "home" && renderHomeRows()}
        {tab === "movies" && renderMoviesRows()}
        {tab === "shows" && renderShowsRows()}
        {tab === "genre" && renderGenreRows()}
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
