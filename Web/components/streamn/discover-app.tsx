"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Info,
  Play,
  Pause,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  Star,
  Loader2,
  X,
  Download,
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { StreamnNav } from "@/components/streamn/streamn-nav";
import type { MediaDetail, MediaSummary, MediaType } from "@/lib/media";
import { tmdbImage } from "@/lib/media";
import { fetchStreamSources } from "@/lib/stream-source";
import {
  getContinueWatching,
  watchHref,
  removeFromStorage,
  getWatchProgress,
  getLastWatched,
  type WatchProgress,
} from "@/lib/streamn-storage";
import { useLowDataMode } from "@/components/providers/low-data-provider";

import disneyLogo from "@/assets/images/Disney_Plus_logo.svg";
import netflixLogo from "@/assets/images/Netflix_2014_logo.svg";
import peacockLogo from "@/assets/images/Peacock_logo.svg";
import maxLogo from "@/assets/images/Max_logo.svg";
import amazonLogo from "@/assets/images/Amazon_Prime_logo_(2024).svg";
import huluLogo from "@/assets/images/Hulu_logo_(2014).svg";

const STUDIO_NETWORKS = [
  { name: "Disney+", slug: "disney", logo: disneyLogo.src },
  { name: "Netflix", slug: "netflix", logo: netflixLogo.src },
  { name: "Peacock", slug: "peacock", logo: peacockLogo.src },
  { name: "HBO Max", slug: "max", logo: maxLogo.src },
  { name: "Prime Video", slug: "prime", logo: amazonLogo.src },
  { name: "Hulu", slug: "hulu", logo: huluLogo.src },
];

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
  providers: { name: string; slug: string; logoPath?: string }[];
  movieGenres: { id: number; name: string }[];
  tvGenres: { id: number; name: string }[];
  animeTv: MediaSummary[];
  trendingAnime: MediaSummary[];
  topRatedAnime: MediaSummary[];
  topRatedAnimeMovies: MediaSummary[];
  actionMovies: MediaSummary[];
  comedyMovies: MediaSummary[];
  scifiMovies: MediaSummary[];
  horrorMovies: MediaSummary[];
  romanceMovies: MediaSummary[];
  crimeMovies: MediaSummary[];
};

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        config: Record<string, unknown>
      ) => unknown;
      PlayerState?: {
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

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
      { rootMargin: "140px 0px", threshold: 0.08 }
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
  const { isLowDataMode } = useLowDataMode();

  return (
    <div ref={ref}>
      {visible ? (
        <div
          className={isLowDataMode ? "" : "discover-row-enter"}
          style={isLowDataMode ? undefined : { animationDelay: `${80 + animationIndex * 90}ms` }}
        >
          {children}
        </div>
      ) : (
        <div aria-hidden className={placeholderClassName} />
      )}
    </div>
  );
}

function MediaCard({
  item,
  onSelect,
  onRemove,
}: {
  item: MediaSummary;
  onSelect: (item: MediaSummary) => void;
  onRemove?: (item: MediaSummary) => void;
}) {
  const { isLowDataMode } = useLowDataMode();
  return (
    <div
      className="flex flex-col gap-1.5 shrink-0 w-32 sm:w-40 md:w-44 group cursor-pointer"
      onClick={() => onSelect(item)}
    >
      <div className="relative aspect-[1/1.4] w-full rounded-xl overflow-hidden bg-zinc-900 border border-white/5 shadow-md group-hover:-translate-y-1.5 group-hover:ring-2 group-hover:ring-white/40 group-hover:border-white/50 transition-all duration-300">
        <Image
          src={tmdbImage(item.posterPath || item.backdropPath, isLowDataMode ? "w200" : "w500")}
          alt={item.title}
          fill
          sizes="(max-width: 768px) 160px, 200px"
          loading={isLowDataMode ? "lazy" : undefined}
          quality={isLowDataMode ? 60 : 75}
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {onRemove && (
          <button
            className="absolute top-2 right-2 bg-black/70 rounded-full p-1.5 hover:bg-red-600 transition-colors z-20"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(item);
            }}
            type="button"
            aria-label="Remove item"
          >
            <X className="w-3.5 h-3.5 text-white" />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-0.5">
        <h3 className="text-white font-semibold text-xs sm:text-sm line-clamp-1 group-hover:text-white/90 transition-colors">
          {item.title}
        </h3>
        <div className="flex items-center gap-1 text-[11px] sm:text-xs text-white/50 font-medium">
          <Star className="w-3 h-3 fill-white text-white shrink-0" />
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

function formatProgress(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m watched`;
  return `${mins}m watched`;
}

function ContinueWatchingCard({
  item,
  onSelect,
  onRemove,
}: {
  item: WatchProgress;
  onSelect: (item: WatchProgress) => void;
  onRemove?: (item: WatchProgress) => void;
}) {
  const { isLowDataMode } = useLowDataMode();
  const isTv = item.mediaType === "tv";
  const title = isTv ? `S${item.seasonNumber} E${item.episodeNumber}` : item.title;
  const subtitle = isTv ? `${item.title}  ${formatProgress(item.progressSeconds)}` : formatProgress(item.progressSeconds);

  return (
    <div
      className="flex flex-col gap-1.5 shrink-0 w-64 sm:w-72 md:w-80 group cursor-pointer"
      onClick={() => onSelect(item)}
    >
      <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-zinc-900 border border-white/5 shadow-md group-hover:-translate-y-1.5 group-hover:ring-2 group-hover:ring-white/40 group-hover:border-white/50 transition-all duration-300">
        <Image
          src={tmdbImage(item.backdropPath || item.posterPath, isLowDataMode ? "w500" : "w780")}
          alt={item.title}
          fill
          sizes="(max-width: 768px) 260px, 320px"
          loading={isLowDataMode ? "lazy" : undefined}
          quality={isLowDataMode ? 60 : 75}
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {onRemove && (
          <button
            className="absolute top-2 right-2 bg-black/70 rounded-full p-1.5 hover:bg-red-600 transition-colors z-20"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(item);
            }}
            type="button"
            aria-label="Remove item"
          >
            <X className="w-3.5 h-3.5 text-white" />
          </button>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 transition-opacity group-hover:opacity-60 pointer-events-none" />
        <div className="absolute bottom-3 left-3 pointer-events-none">
          <Play className="w-6 h-6 fill-white text-white drop-shadow-lg" />
        </div>
      </div>
      <div className="flex flex-col gap-0.5 px-0.5">
        <h3 className="text-white font-bold text-sm sm:text-base line-clamp-1 group-hover:text-white/90 transition-colors">
          {title}
        </h3>
        <div className="flex items-center gap-1.5 text-[11px] sm:text-xs text-white/50 font-medium">
          <span>{subtitle}</span>
        </div>
      </div>
    </div>
  );
}

function Top10Card({
  item,
  rank,
  onSelect,
}: {
  item: MediaSummary;
  rank: number;
  onSelect: (item: MediaSummary) => void;
}) {
  const { isLowDataMode } = useLowDataMode();
  return (
    <div
      className="relative flex items-center shrink-0 cursor-pointer group select-none pr-3"
      onClick={() => onSelect(item)}
    >
      <span className="text-6xl sm:text-7xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-white/80 to-white/20 drop-shadow-[0_10px_20px_rgba(0,0,0,0.9)] tracking-tighter shrink-0 -mr-5 z-0 pointer-events-none">
        {rank}
      </span>
      <div className="relative aspect-[1/1.4] w-32 sm:w-40 md:w-44 rounded-xl overflow-hidden bg-zinc-900 border border-white/10 shadow-2xl z-10 group-hover:-translate-y-1.5 group-hover:ring-2 group-hover:ring-white/40 group-hover:border-white/50 transition-all duration-300">
        <Image
          src={tmdbImage(item.posterPath || item.backdropPath, isLowDataMode ? "w200" : "w500")}
          alt={item.title}
          fill
          sizes="180px"
          loading={isLowDataMode ? "lazy" : undefined}
          quality={isLowDataMode ? 60 : 75}
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
    </div>
  );
}

function MediaRow({
  title,
  items,
  onSelect,
  isTop10 = false,
  isContinueWatching = false,
  onRemove,
  onViewAll,
}: {
  title: ReactNode;
  items: any[];
  onSelect: (item: any) => void;
  isTop10?: boolean;
  isContinueWatching?: boolean;
  onRemove?: (item: any) => void;
  onViewAll?: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  if (!items.length) return null;

  const scrollLeft = () => {
    trackRef.current?.scrollBy({
      left: -(window.innerWidth * 0.6),
      behavior: "smooth",
    });
  };
  const scrollRight = () => {
    trackRef.current?.scrollBy({
      left: window.innerWidth * 0.6,
      behavior: "smooth",
    });
  };

  return (
    <section className="discover-row relative my-6">
      <div className="flex items-center justify-between mb-3 px-1">
        <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
          {title}
        </h2>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="flex items-center gap-1 text-xs font-semibold text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1 rounded-full transition-all"
            type="button"
          >
            <span>View All</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="relative group/track">
        <button
          className="absolute left-0 top-0 bottom-0 z-30 w-10 bg-gradient-to-r from-black/90 via-black/50 to-transparent opacity-0 group-hover/track:opacity-100 transition-opacity flex items-center justify-center text-white"
          onClick={scrollLeft}
          aria-label="Scroll left"
          type="button"
        >
          <ChevronLeft className="w-6 h-6 text-white drop-shadow-md" />
        </button>

        <div
          className="flex items-center gap-3.5 sm:gap-5 overflow-x-auto no-scrollbar scroll-smooth py-1 px-1"
          ref={trackRef}
        >
          {items.map((item, index) => {
            if (isTop10) {
              return (
                <Top10Card
                  key={`top10-${item.mediaType}-${item.id}`}
                  item={item}
                  rank={index + 1}
                  onSelect={onSelect}
                />
              );
            }
            if (isContinueWatching) {
              return (
                <ContinueWatchingCard
                  key={`continue-${item.mediaType}-${item.id}`}
                  item={item as WatchProgress}
                  onSelect={onSelect}
                  onRemove={onRemove}
                />
              );
            }
            return (
              <MediaCard
                key={`${item.mediaType}-${item.id}`}
                item={item}
                onSelect={onSelect}
                onRemove={onRemove}
              />
            );
          })}
        </div>

        <button
          className="absolute right-0 top-0 bottom-0 z-30 w-10 bg-gradient-to-l from-black/90 via-black/50 to-transparent opacity-0 group-hover/track:opacity-100 transition-opacity flex items-center justify-center text-white"
          onClick={scrollRight}
          aria-label="Scroll right"
          type="button"
        >
          <ChevronRight className="w-6 h-6 text-white drop-shadow-md" />
        </button>
      </div>
    </section>
  );
}

function StudiosSection({
  onSelectProvider,
}: {
  onSelectProvider: (slug: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const scrollLeft = () => {
    trackRef.current?.scrollBy({ left: -380, behavior: "smooth" });
  };
  const scrollRight = () => {
    trackRef.current?.scrollBy({ left: 380, behavior: "smooth" });
  };

  return (
    <section className="my-8 px-1">
      <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight mb-3">
        Studios
      </h2>
      <div className="relative group/studios">
        <button
          className="absolute left-0 top-0 bottom-0 z-30 w-10 bg-gradient-to-r from-black/90 to-transparent opacity-0 group-hover/studios:opacity-100 transition-opacity flex items-center justify-center text-white"
          onClick={scrollLeft}
          aria-label="Scroll left"
          type="button"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div
          ref={trackRef}
          className="flex items-center gap-4.5 overflow-x-auto no-scrollbar scroll-smooth py-1 px-1"
        >
          {STUDIO_NETWORKS.map((p) => (
            <div
              key={p.slug}
              onClick={() => onSelectProvider(p.slug)}
              className="relative flex items-center justify-center shrink-0 w-52 sm:w-60 md:w-64 h-24 sm:h-28 md:h-30 rounded-lg bg-[#1e232d] hover:bg-[#282f3d] border border-white/5 shadow-xl transition-all duration-300 cursor-pointer p-6 group/card hover:scale-[1.02]"
            >
              <img
                src={p.logo}
                alt={p.name}
                className="max-h-7 sm:max-h-9 w-auto max-w-[60%] object-contain brightness-0 invert group-hover/card:brightness-100 group-hover/card:invert-0 transition-all duration-300"
              />
            </div>
          ))}
        </div>

        <button
          className="absolute right-0 top-0 bottom-0 z-30 w-10 bg-gradient-to-l from-black/90 to-transparent opacity-0 group-hover/studios:opacity-100 transition-opacity flex items-center justify-center text-white"
          onClick={scrollRight}
          aria-label="Scroll right"
          type="button"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </section>
  );
}

export function DiscoverApp({ data }: { data: DiscoverPageData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams?.get("tab") || "home";
  const genreId = Number(searchParams?.get("genre"));
  const genreType = searchParams?.get("type") as "movie" | "tv";
  const { isLowDataMode } = useLowDataMode();

  const [bannerIndex, setBannerIndex] = useState(0);
  const [isPlayingVideo, setIsPlayingVideo] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const thumbTrackRef = useRef<HTMLDivElement>(null);

  const [continueWatching, setContinueWatching] = useState<WatchProgress[]>([]);
  const [becauseYouWatched, setBecauseYouWatched] = useState<MediaSummary[]>([]);
  const [lastWatchedTitle, setLastWatchedTitle] = useState("");

  const [genreResults, setGenreResults] = useState<MediaSummary[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);

  // Provider: "cinesrc" (default) loads via iframe; "backend"/"moviebox" checks HLS API/direct MP4
  const isBackend =
    ["backend", "moviebox"].includes(process.env.NEXT_PUBLIC_STREAM_PROVIDER || "cinesrc");

  const [bannerSources, setBannerSources] = useState<any[]>([]);
  const [bannerDownloadModalOpen, setBannerDownloadModalOpen] = useState(false);
  const [isDescriptionVisible, setIsDescriptionVisible] = useState(true);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    setIsDescriptionVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  };
  const handleMouseLeave = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setIsDescriptionVisible(false);
    }, 4500);
  };

  useEffect(() => {
    setContinueWatching(getContinueWatching());
    const lastWatched = getLastWatched();
    if (lastWatched) {
      setLastWatchedTitle(lastWatched.title);
      fetch(`/api/discover/recommendations?type=${lastWatched.mediaType}&id=${lastWatched.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.results) {
            setBecauseYouWatched(data.results);
          }
        })
        .catch(console.error);
    }
  }, []);

  const handleRemoveContinue = (item: MediaSummary) => {
    removeFromStorage("continueWatching", item);
    setContinueWatching(getContinueWatching());
  };

  const filteredBannerItems = useMemo(() => {
    const rawBanner = data.bannerItems.length
      ? data.bannerItems
      : data.trendingWeek;

    if (tab === "movies") {
      const movies = rawBanner.filter((i) => i.mediaType === "movie");
      return movies.length ? movies : data.trendingMovies.slice(0, 8);
    }
    if (tab === "shows") {
      const tv = rawBanner.filter((i) => i.mediaType === "tv");
      return tv.length ? tv : data.trendingTv.slice(0, 8);
    }
    if (tab === "anime") {
      return data.trendingAnime.slice(0, 8);
    }
    return rawBanner;
  }, [tab, data.bannerItems, data.trendingWeek, data.trendingMovies, data.trendingTv, data.trendingAnime]);

  const bannerCount = filteredBannerItems.length;
  const activeBanner = bannerCount > 0 ? filteredBannerItems[bannerIndex % bannerCount] : undefined;

  useEffect(() => {
    handleMouseLeave();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [activeBanner]);

  const [videoLoaded, setVideoLoaded] = useState(false);

  const [bannerProgress, setBannerProgress] = useState<WatchProgress | null>(null);

  // Reset banner player state whenever the active banner item changes
  useEffect(() => {
    setVideoLoaded(false);
    if (activeBanner) {
      setBannerProgress(getWatchProgress(activeBanner.mediaType, activeBanner.id));
    } else {
      setBannerProgress(null);
    }
    if (activeBanner?.trailerKey) {
      const timer = setTimeout(() => {
        setVideoLoaded(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [activeBanner, bannerIndex]);

  // Fetch streams for active banner to compute size range and download options
  useEffect(() => {
    if (!activeBanner) {
      setBannerSources([]);
      return;
    }

    let isMounted = true;
    setBannerSources([]);

    // Use season/episode from progress or default to 1
    const season = bannerProgress?.seasonNumber ?? 1;
    const episode = bannerProgress?.episodeNumber ?? 1;

    fetchStreamSources(activeBanner.mediaType, activeBanner.id, season, episode, false, "download")
      .then((res) => {
        if (!isMounted) return;
        if (res.sources && res.sources.length > 0) {
          setBannerSources(res.sources);
        }
      })
      .catch(() => {
        if (isMounted) setBannerSources([]);
      });

    return () => {
      isMounted = false;
    };
  }, [activeBanner, bannerProgress]);

  const bannerFileSizeRange = useMemo(() => {
    if (!bannerSources || bannerSources.length === 0) return null;
    const sizes = bannerSources.map((s) => s.size).filter(Boolean);
    if (sizes.length === 0) return null;
    if (sizes.length === 1) return sizes[0];

    const parseSize = (sizeStr: string) => {
      const num = parseFloat(sizeStr);
      if (isNaN(num)) return 0;
      if (sizeStr.toUpperCase().includes("GB")) return num * 1024;
      return num; // MB
    };

    const sorted = [...bannerSources].sort((a, b) => parseSize(a.size) - parseSize(b.size));
    const minSize = sorted[0].size;
    const maxSize = sorted[sorted.length - 1].size;

    if (minSize === maxSize) return minSize;
    return `${minSize} - ${maxSize}`;
  }, [bannerSources]);

  // YouTube IFrame Player API initialization (Without loop=1, state 0 ENDED fires reliably!)
  useEffect(() => {
    if (!activeBanner?.trailerKey || typeof window === "undefined") return;

    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube-nocookie.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }

    let playerInstance: unknown = null;
    const iframeId = `banner-yt-player-${activeBanner.id}`;

    const initPlayer = () => {
      if (!window.YT?.Player) return;
      try {
        playerInstance = new window.YT.Player(iframeId, {
          events: {
            onReady: () => {
              setVideoLoaded(true);
            },
            onStateChange: (event: { data: number }) => {
              if (event.data === 1) {
                setVideoLoaded(true);
              }
              if (event.data === 0) {
                setBannerIndex((current) =>
                  bannerCount > 0 ? (current + 1) % bannerCount : 0
                );
              }
            },
          },
        });
      } catch {
        // Player error
      }
    };

    if (window.YT?.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      if (playerInstance && typeof (playerInstance as { destroy?: () => void }).destroy === "function") {
        (playerInstance as { destroy: () => void }).destroy();
      }
    };
  }, [activeBanner, filteredBannerItems.length]);

  // Fallback timer (18 seconds) if item has no trailer key
  useEffect(() => {
    if (!activeBanner || activeBanner.trailerKey || bannerCount === 0) return;
    const timer = window.setTimeout(() => {
      setBannerIndex((current) => (current + 1) % bannerCount);
    }, 18000);
    return () => window.clearTimeout(timer);
  }, [activeBanner, bannerIndex, bannerCount]);





  const getBannerMetaString = (item: MediaSummary) => {
    const allGenres = [...data.movieGenres, ...data.tvGenres];
    const genreNames = item.genreIds
      ? item.genreIds
        .map((id) => allGenres.find((g) => g.id === id)?.name)
        .filter(Boolean)
        .slice(0, 2)
      : [];

    const rating = item.voteAverage ? item.voteAverage.toFixed(1) : "6.5";
    const year = item.year || "2026";
    const genres = genreNames.length
      ? genreNames.join(" · ")
      : item.mediaType === "movie"
        ? "Movie"
        : "Series";

    return `★ ${rating} · ${year} · ${genres}`;
  };

  const togglePlayVideo = () => {
    if (!iframeRef.current) return;
    const func = isPlayingVideo ? "pauseVideo" : "playVideo";
    iframeRef.current.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args: "" }),
      "*"
    );
    setIsPlayingVideo(!isPlayingVideo);
  };

  const toggleMuteVideo = () => {
    if (!iframeRef.current) return;
    const func = isMuted ? "unMute" : "mute";
    iframeRef.current.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args: "" }),
      "*"
    );
    setIsMuted(!isMuted);
  };

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
    const titleSlug = item.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || '';
    router.push(`/title/${item.mediaType}/${item.id}-${titleSlug}`);
  }

  let rowIndex = 0;

  const renderHomeRows = () => (
    <>
      {continueWatching.length > 0 && (
        <LazyRevealRow animationIndex={rowIndex++}>
          <MediaRow
            items={continueWatching}
            onSelect={openDetail}
            title="Continue Watching"
            isContinueWatching
            onRemove={handleRemoveContinue}
          />
        </LazyRevealRow>
      )}

      {becauseYouWatched.length > 0 && (
        <LazyRevealRow animationIndex={rowIndex++}>
          <MediaRow
            items={becauseYouWatched}
            onSelect={openDetail}
            title={`Because you watched ${lastWatchedTitle}`}
          />
        </LazyRevealRow>
      )}

      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.trendingMoviesToday.slice(0, 10)}
          onSelect={openDetail}
          title="Trending Right Now"
          isTop10
          onViewAll={() => router.push("/discover?tab=movies")}
        />
      </LazyRevealRow>

      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.latestMovies}
          onSelect={openDetail}
          title="New Movies"
          onViewAll={() => router.push("/discover?tab=movies")}
        />
      </LazyRevealRow>

      <StudiosSection
        onSelectProvider={(slug) =>
          router.push(`/discover?tab=provider&provider=${slug}`)
        }
      />

      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.topRatedTv}
          onSelect={openDetail}
          title="Top Rated Series"
          onViewAll={() => router.push("/discover?tab=shows")}
        />
      </LazyRevealRow>

      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.topRatedMovies}
          onSelect={openDetail}
          title="Top Rated Movies"
          onViewAll={() => router.push("/discover?tab=movies")}
        />
      </LazyRevealRow>

      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.actionMovies}
          onSelect={openDetail}
          title="Blockbuster Action"
        />
      </LazyRevealRow>

      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.comedyMovies}
          onSelect={openDetail}
          title="Laugh Out Loud"
        />
      </LazyRevealRow>

      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.scifiMovies}
          onSelect={openDetail}
          title="Sci-Fi & Fantasy"
        />
      </LazyRevealRow>

      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.animeTv}
          onSelect={openDetail}
          title="Anime Series"
        />
      </LazyRevealRow>

      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.horrorMovies}
          onSelect={openDetail}
          title="Spine-Chilling Horror"
        />
      </LazyRevealRow>

      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.romanceMovies}
          onSelect={openDetail}
          title="Heartwarming Romance"
        />
      </LazyRevealRow>

      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.crimeMovies}
          onSelect={openDetail}
          title="Crime Thrillers"
        />
      </LazyRevealRow>
    </>
  );

  const renderMoviesRows = () => (
    <>
      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.trendingMoviesToday}
          onSelect={openDetail}
          title="Trending Movies"
          isTop10
        />
      </LazyRevealRow>
      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.latestMovies}
          onSelect={openDetail}
          title="New Movies"
        />
      </LazyRevealRow>
      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.topRatedMovies}
          onSelect={openDetail}
          title="Top Rated Movies"
        />
      </LazyRevealRow>
    </>
  );

  const renderShowsRows = () => (
    <>
      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.trendingTvToday}
          onSelect={openDetail}
          title="Trending Series"
          isTop10
        />
      </LazyRevealRow>
      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.latestTv}
          onSelect={openDetail}
          title="New Series"
        />
      </LazyRevealRow>
      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow
          items={data.topRatedTv}
          onSelect={openDetail}
          title="Top Rated Series"
        />
      </LazyRevealRow>
    </>
  );

  const renderAnimeRows = () => (
    <>
      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow items={data.trendingAnime} onSelect={openDetail} title="Trending Anime" isTop10 />
      </LazyRevealRow>
      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow items={data.animeTv} onSelect={openDetail} title="Popular Anime" />
      </LazyRevealRow>
      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow items={data.topRatedAnime} onSelect={openDetail} title="Top Rated Anime" />
      </LazyRevealRow>
      <LazyRevealRow animationIndex={rowIndex++}>
        <MediaRow items={data.topRatedAnimeMovies} onSelect={openDetail} title="Top Rated Anime Movies" />
      </LazyRevealRow>
    </>
  );

  const renderGenreRows = () => {
    if (genreLoading)
      return (
        <div className="empty-state min-h-40 mt-12 text-white/60">
          Loading genre picks...
        </div>
      );
    return (
      <div className="mt-8">
        <LazyRevealRow animationIndex={rowIndex++}>
          <MediaRow
            items={genreResults}
            onSelect={openDetail}
            title="Genre Picks"
          />
        </LazyRevealRow>
      </div>
    );
  };

  return (
    <main className="discover-shell bg-black min-h-screen pl-0 md:pl-[72px] transition-all duration-300">
      <StreamnNav />
      {/* Mobile Tabs */}
      <div className="md:hidden absolute top-0 left-0 right-0 pt-[68px] flex items-center justify-center gap-2 overflow-x-auto no-scrollbar pb-2 px-4 z-40 pointer-events-none">
        <Link
          href="/discover?tab=home"
          className={`pointer-events-auto px-4 py-1.5 rounded-full text-sm font-semibold transition-colors whitespace-nowrap ${tab === "home" || !tab || tab === "all"
            ? "bg-white text-black shadow-md"
            : "text-white/90 hover:text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
            }`}
        >
          Home
        </Link>
        <Link
          href="/discover?tab=shows"
          className={`pointer-events-auto px-4 py-1.5 rounded-full text-sm font-semibold transition-colors whitespace-nowrap ${tab === "shows"
            ? "bg-white text-black shadow-md"
            : "text-white/90 hover:text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
            }`}
        >
          Series
        </Link>
        <Link
          href="/discover?tab=movies"
          className={`pointer-events-auto px-4 py-1.5 rounded-full text-sm font-semibold transition-colors whitespace-nowrap ${tab === "movies"
            ? "bg-white text-black shadow-md"
            : "text-white/90 hover:text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
            }`}
        >
          Movies
        </Link>
        <Link
          href="/discover?tab=anime"
          className={`pointer-events-auto px-4 py-1.5 rounded-full text-sm font-semibold transition-colors whitespace-nowrap ${tab === "anime"
            ? "bg-white text-black shadow-md"
            : "text-white/90 hover:text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]"
            }`}
        >
          Anime
        </Link>
      </div>


      {/* Hero Banner Section */}
      {tab !== "genre" && activeBanner && (
        <section className="relative w-full h-[80vh] min-h-[520px] overflow-hidden bg-black select-none">
          {/* Video Backdrop Container */}
          <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
            <div className="relative w-full h-full">
              <Image
                src={tmdbImage(
                  activeBanner.backdropPath || activeBanner.posterPath,
                  isLowDataMode ? "w780" : "original"
                )}
                alt={activeBanner.title}
                fill
                priority={!isLowDataMode}
                quality={isLowDataMode ? 60 : 85}
                className={`object-cover object-top transition-opacity duration-700 ${videoLoaded && !isLowDataMode ? "opacity-0" : "opacity-80"
                  }`}
              />
              {!isLowDataMode && activeBanner.trailerKey && (
                <iframe
                  id={`banner-yt-player-${activeBanner.id}`}
                  ref={iframeRef}
                  onLoad={() => setVideoLoaded(true)}
                  src={`https://www.youtube-nocookie.com/embed/${activeBanner.trailerKey}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1&enablejsapi=1&playsinline=1`}
                  className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350vw] sm:w-[200vw] md:w-[150vw] aspect-video pointer-events-none transition-opacity duration-700 ${videoLoaded ? "opacity-100" : "opacity-0"
                    }`}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  title="Backdrop Trailer"
                />
              )}
            </div>
          </div>

          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent z-10" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent z-10" />

          

          {/* Banner Copy Stack */}
          <div className="absolute inset-x-6 md:left-14 md:right-14 bottom-0 pb-6 md:pb-0 md:bottom-24 z-20 flex flex-col md:items-start gap-3.5">
            <div className="max-w-xl flex flex-col items-center text-center md:items-start md:text-left mx-auto md:mx-0 gap-3.5 w-full">
            {activeBanner.logoPath ? (
              <Image
                src={tmdbImage(activeBanner.logoPath, "w500")}
                alt={activeBanner.title}
                width={440}
                height={140}
                priority
                className="h-auto max-h-14 sm:max-h-20 md:max-h-32 w-auto max-w-[min(100%,26rem)] object-contain object-center md:object-left drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)]"
              />
            ) : (
              <h1 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tight drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)]">
                {activeBanner.title}
              </h1>
            )}

            <div className="flex items-center gap-2 text-white/90 text-xs md:text-sm font-semibold drop-shadow-md flex-wrap">
              <span>{getBannerMetaString(activeBanner)}</span>
              {bannerFileSizeRange && (
                <>
                  <span>·</span>
                  <span className="px-1.5 py-0.5 rounded bg-white/15 text-[11px] font-bold text-white/90 border border-white/20">
                    {bannerFileSizeRange}
                  </span>
                </>
              )}
            </div>

            <div className={`overflow-hidden transition-all duration-700 w-full ${
                isDescriptionVisible ? "max-h-32 opacity-100 mt-1" : "max-h-0 opacity-0 mt-0 -mb-2 md:-mb-1"
              }`}>
                <p className="text-white/80 text-xs md:text-sm line-clamp-3 leading-relaxed drop-shadow-md font-normal">
                  {activeBanner.overview}
                </p>
              </div>
            </div>

            {/* Action Buttons & Controls: Justified Between */}
            <div className="flex items-center justify-between w-full pt-1">
              
              {/* Primary Actions */}
              <div className="flex items-center gap-3 flex-none md:flex-none">
                <Link
                  href={watchHref(activeBanner)}
                  className="flex-none md:flex-none md:w-auto px-5 py-2.5 rounded-full bg-white hover:bg-white/90 text-black font-bold flex items-center justify-center gap-2 shadow-2xl transition-transform hover:scale-105 shrink-0"
                >
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                  <span className="md:hidden">Play</span>
                  <span className="hidden md:inline">{bannerProgress ? "Continue Watching" : "Watch Now"}</span>
                </Link>

                {bannerSources.length > 0 && (
                  <button
                    onClick={() => setBannerDownloadModalOpen(true)}
                    className="hidden md:flex px-5 py-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white border border-white/20 backdrop-blur-md font-semibold text-sm items-center justify-center gap-2 shadow-2xl transition-transform hover:scale-105 shrink-0"
                    type="button"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download</span>
                  </button>
                )}

                <button
                  onClick={() => openDetail(activeBanner)}
                  className="w-[44px] h-[44px] md:w-auto md:h-auto md:px-5 md:py-2.5 rounded-full bg-white/20 hover:bg-white/30 text-white border border-white/20 backdrop-blur-md font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-xl shrink-0 hover:scale-105"
                  type="button"
                  aria-label="More Info"
                >
                  <Info className="w-5 h-5 md:w-4 md:h-4" />
                  <span className="hidden md:inline">More Info</span>
                </button>
              </div>

              {/* Controls (Mute/Pause) - Pause hidden on mobile */}
              {!isLowDataMode && (
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlayVideo}
                    className="hidden md:flex w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 border border-white/20 backdrop-blur-md items-center justify-center text-white shadow-xl transition-all hover:scale-105 shrink-0"
                    type="button"
                    aria-label={isPlayingVideo ? "Pause video" : "Play video"}
                  >
                    {isPlayingVideo ? (
                      <Pause className="w-5 h-5 fill-current" />
                    ) : (
                      <Play className="w-5 h-5 fill-current ml-0.5" />
                    )}
                  </button>

                  <button
                    onClick={toggleMuteVideo}
                    className="flex w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 border border-white/20 backdrop-blur-md items-center justify-center text-white shadow-xl transition-all hover:scale-105 shrink-0"
                    type="button"
                    aria-label={isMuted ? "Unmute video" : "Mute video"}
                  >
                    {isMuted ? (
                      <VolumeX className="w-5 h-5" />
                    ) : (
                      <Volume2 className="w-5 h-5" />
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Banner Carousel Indicator: Centered on Mobile, Right-aligned on Desktop */}
          <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 md:left-auto md:right-16 md:translate-x-0 bottom-4 z-20 items-center gap-2 max-w-[92vw] md:max-w-[60vw]">
            <button
              className="w-7 h-7 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center shrink-0 border border-white/10"
              onClick={() =>
                setBannerIndex(
                  (current) =>
                    (current - 1 + filteredBannerItems.length) %
                    filteredBannerItems.length
                )
              }
              type="button"
              aria-label="Previous banner"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div
              ref={thumbTrackRef}
              className="flex items-center gap-2.5 overflow-x-auto no-scrollbar scroll-smooth py-1 px-1"
            >
              {filteredBannerItems.slice(0, 8).map((item, index) => {
                const isActive =
                  bannerCount > 0 && index === bannerIndex % bannerCount;
                return (
                  <div
                    key={`thumb-${item.mediaType}-${item.id}`}
                    onClick={() => setBannerIndex(index)}
                    className={`relative w-20 sm:w-24 aspect-[16/9] rounded-lg overflow-hidden cursor-pointer shrink-0 transition-all duration-300 ${isActive
                      ? "ring-2 ring-white border-2 border-white scale-105 shadow-2xl z-10"
                      : "opacity-60 hover:opacity-100 border border-white/10"
                      }`}
                  >
                    <Image
                      src={tmdbImage(
                        item.backdropPath || item.posterPath,
                        "w300"
                      )}
                      alt={item.title}
                      fill
                      sizes="100px"
                      className="object-cover"
                    />
                  </div>
                );
              })}
            </div>

            <button
              className="w-7 h-7 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center shrink-0 border border-white/10"
              onClick={() =>
                setBannerIndex(
                  (current) => (current + 1) % filteredBannerItems.length
                )
              }
              type="button"
              aria-label="Next banner"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* Rows Section Container */}
      <section className="relative z-10 px-4 sm:px-8 md:px-12 py-4 pb-24">
        {tab === "home" && renderHomeRows()}
        {tab === "movies" && renderMoviesRows()}
        {tab === "shows" && renderShowsRows()}
        {tab === "anime" && renderAnimeRows()}
        {tab === "genre" && renderGenreRows()}
      </section>

      

      {/* Banner Download Modal */}
      {bannerDownloadModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4" onClick={() => setBannerDownloadModalOpen(false)}>
          <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#121214] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setBannerDownloadModalOpen(false)}
              className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
            >
              <X className="size-5" />
            </button>
            <h3 className="text-xl font-bold text-white mb-2">Download Options</h3>
            <p className="text-sm text-white/60 mb-6 font-medium">Select a quality to download the media file directly.</p>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1 no-scrollbar">
              {bannerSources.map((source, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/20 transition-all"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-bold text-white text-base truncate">{source.quality || "Unknown Quality"}</div>
                    <div className="text-xs text-white/40 mt-1 uppercase tracking-wider font-semibold">{source.type || "mp4"} · {source.size || "Unknown Size"}</div>
                  </div>
                  <a
                    href={source.url}
                    download
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-black font-bold text-sm hover:bg-white/90 transition-all shrink-0 hover:scale-105"
                  >
                    <Download className="size-4" />
                    <span>Download</span>
                  </a>
                </div>
              ))}
              {bannerSources.length === 0 && (
                <div className="text-center py-6 text-white/40 text-sm">
                  No download links available.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
