"use client";

import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  ChevronDown,
  Download,
  Film,
  Loader2,
  Pause,
  Play,
  Star,
  ThumbsUp,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useMemo } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import {
  DetailBackdropPlayer,
  type DetailBackdropPlayerHandle,
} from "@/components/streamn/detail-backdrop-player";
import { IframePlayer } from "@/components/streamn/iframe-player";
import { WatchlistPicker } from "@/components/streamn/watchlist-picker";
import { WatchPartyInviteModal } from "@/components/streamn/watch-party-invite-modal";
import type { Episode, MediaDetail, MediaSummary } from "@/lib/media";
import { cinesrcUrl, tmdbImage } from "@/lib/media";
import { fetchStreamSources } from "@/lib/stream-source";
import { getWatchProgress, watchHref } from "@/lib/streamn-storage";
import { getLikedIds, likeMedia, unlikeMedia } from "@/lib/user-actions";

function runtimeLabel(minutes: number | null) {
  if (!minutes) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

function detailMetaLine(detail: MediaDetail) {
  const parts: string[] = [];
  if (detail.voteAverage) {
    parts.push(`${detail.voteAverage.toFixed(1)}/10`);
  }
  if (detail.year) parts.push(detail.year);
  const runtime = runtimeLabel(detail.runtime);
  if (runtime) parts.push(runtime);
  if (detail.certification && detail.certification !== "NR") {
    parts.push(detail.certification);
  }
  if (detail.genres.length) parts.push(detail.genres.join(", "));
  return parts.join(" · ");
}

export function DetailSkeleton() {
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
  const [visibleCount, setVisibleCount] = useState(8);
  const [selectedSeason, setSelectedSeason] = useState(
    initialEpisodes[0]?.seasonNumber ?? seasons[0]?.seasonNumber ?? 1,
  );
  const [loadingSeason, setLoadingSeason] = useState(false);

  async function changeSeason(seasonNumber: number) {
    setSelectedSeason(seasonNumber);
    setVisibleCount(8);
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

  const visibleEpisodes = episodes.slice(0, visibleCount);
  const hasMore = episodes.length > visibleCount;

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
        {visibleEpisodes.map((episode) => (
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
      {hasMore ? (
        <button
          className='ghost-button mt-4 w-full'
          onClick={() => setVisibleCount((count) => count + 8)}
          type='button'
        >
          Load 8 more
        </button>
      ) : null}
    </div>
  );
}

export function MediaDetailContent({
  detail,
  onSelect,
}: {
  detail: MediaDetail;
  onSelect: (item: MediaSummary) => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const playerRef = useRef<DetailBackdropPlayerHandle>(null);
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [muted, setMuted] = useState(true);
  const [isPlayingTrailer, setIsPlayingTrailer] = useState(true);
  const [isDescriptionVisible, setIsDescriptionVisible] = useState(true);
  const [isWatchPartyModalOpen, setIsWatchPartyModalOpen] = useState(false);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startHideTimer = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setIsDescriptionVisible(false);
    }, 4500);
  };

  useEffect(() => {
    setIsDescriptionVisible(true);
    startHideTimer();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [detail.id]);

  const handleMouseEnter = () => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setIsDescriptionVisible(true);
  };

  const handleMouseLeave = () => {
    startHideTimer();
  };

  useEffect(() => {
    if (!user) {
      setLiked(false);
      return;
    }
    getLikedIds().then((rows) => {
      setLiked(
        rows.some(
          (row) =>
            row.media_id === detail.id && row.media_type === detail.mediaType,
        ),
      );
    });
  }, [detail.id, detail.mediaType, user]);

  async function toggleLike() {
    if (!user) {
      router.push("/auth");
      return;
    }
    setLikeBusy(true);
    if (liked) {
      const ok = await unlikeMedia(detail.id, detail.mediaType);
      if (ok) setLiked(false);
    } else {
      const ok = await likeMedia(detail, detail.genres);
      if (ok) setLiked(true);
    }
    setLikeBusy(false);
  }

  const [sourceStatus, setSourceStatus] = useState<"loading" | "available" | "unavailable">("loading");
  const [sources, setSources] = useState<any[]>([]);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);

  const firstEpisode = detail.episodes[0];
  const [watchProgress, setWatchProgress] = useState(() =>
    getWatchProgress(detail.mediaType, detail.id),
  );
  const season = watchProgress?.seasonNumber ?? firstEpisode?.seasonNumber ?? 1;
  const episode = watchProgress?.episodeNumber ?? firstEpisode?.episodeNumber ?? 1;

  // Probe source availability and fetch download info via the stream-source API
  useEffect(() => {
    let isMounted = true;
    setSourceStatus("loading");
    setSources([]);

    fetchStreamSources(detail.mediaType, detail.id, season, episode)
      .then((res) => {
        if (!isMounted) return;
        if (res.sources && res.sources.length > 0) {
          setSources(res.sources);
          setSourceStatus("available");
        } else {
          setSourceStatus("unavailable");
        }
      })
      .catch(() => {
        if (isMounted) {
          setSourceStatus("unavailable");
          setSources([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [detail.id, detail.mediaType, season, episode]);

  const metaLine = detailMetaLine(detail);
  const playUrl = watchHref(detail, { season, episode });

  const fileSizeRange = useMemo(() => {
    if (!sources || sources.length === 0) return null;
    const sizes = sources.map((s) => s.size).filter(Boolean);
    if (sizes.length === 0) return null;
    if (sizes.length === 1) return sizes[0];

    const parseSize = (sizeStr: string) => {
      const num = parseFloat(sizeStr);
      if (isNaN(num)) return 0;
      if (sizeStr.toUpperCase().includes("GB")) return num * 1024;
      return num; // MB
    };

    const sorted = [...sources].sort((a, b) => parseSize(a.size) - parseSize(b.size));
    const minSize = sorted[0].size;
    const maxSize = sorted[sorted.length - 1].size;

    if (minSize === maxSize) return minSize;
    return `${minSize} - ${maxSize}`;
  }, [sources]);

  return (
    <>
    <div className='modal-entrance max-h-[90vh] overflow-y-auto bg-black text-white'>
      <section
        className='relative min-h-[70vh] md:min-h-[75vh] select-none group'
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <DetailBackdropPlayer
          backdropPath={detail.backdropPath}
          muted={muted}
          onMutedChange={setMuted}
          posterPath={detail.posterPath}
          ref={playerRef}
          trailerKey={detail.trailerKey}
        />
        <div className='detail-hero-content relative z-20 flex min-h-[70vh] md:min-h-[75vh] max-w-2xl flex-col justify-end p-6 pt-20 md:p-10'>
          {detail.logoPath ? (
            <Image
              src={tmdbImage(detail.logoPath, "w500")}
              alt={detail.title}
              width={420}
              height={170}
              className='mb-3 h-auto max-h-24 md:max-h-36 w-auto max-w-[85%] object-contain object-left drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)]'
            />
          ) : (
            <h2 className='mb-3 max-w-2xl text-4xl md:text-5xl font-black tracking-tight drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)]'>
              {detail.title}
            </h2>
          )}

          {/* Description area fading out after 4.5s and reappearing on hover */}
          <div
            className={`transition-all duration-700 ease-in-out ${isDescriptionVisible
                ? "opacity-100 max-h-96 translate-y-0 pointer-events-auto my-2"
                : "opacity-0 max-h-0 -translate-y-2 pointer-events-none overflow-hidden my-0"
              }`}
          >
            <div className='flex flex-wrap items-center gap-2 text-white/90 text-xs md:text-sm font-semibold drop-shadow-md mb-2'>
              {detail.voteAverage ? (
                <>
                  <span className='text-white font-bold flex items-center gap-1'>
                    <Star className='size-3.5 fill-current' />
                    {detail.voteAverage.toFixed(1)}
                  </span>
                  <span>·</span>
                </>
              ) : null}
              {detail.year ? (
                <>
                  <span>{detail.year}</span>
                  <span>·</span>
                </>
              ) : null}
              {detail.certification && detail.certification !== "NR" ? (
                <>
                  <span className='px-1.5 py-0.5 rounded bg-white/15 text-[11px] font-bold text-white/90 border border-white/20'>
                    {detail.certification}
                  </span>
                  <span>·</span>
                </>
              ) : null}
              {detail.runtime ? (
                <span>{runtimeLabel(detail.runtime)}</span>
              ) : null}
              {fileSizeRange ? (
                <>
                  <span>·</span>
                  <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-[11px] font-bold text-blue-400 border border-blue-500/30">
                    {fileSizeRange}
                  </span>
                </>
              ) : null}
            </div>

            <p className='text-white/80 text-xs md:text-sm line-clamp-3 leading-relaxed drop-shadow-md font-normal max-w-xl mb-3'>
              {detail.overview}
            </p>

            {detail.genres.length > 0 ? (
              <div className='text-xs md:text-sm font-semibold text-white/70 tracking-wide mb-2'>
                {detail.genres.join(" | ")}
              </div>
            ) : null}
          </div>

          {/* Action buttons */}
          <div className='detail-action-row mt-3 flex flex-wrap items-center gap-3 z-20'>
            {sourceStatus === "loading" ? (
              <button
                disabled
                className='flex items-center gap-3 bg-white/70 text-black/70 px-5 py-2.5 rounded-full font-bold cursor-not-allowed shadow-xl backdrop-blur-sm'
                type='button'
              >
                <div className='w-7 h-7 rounded-full bg-black/80 flex items-center justify-center text-white shrink-0 animate-spin'>
                  <Loader2 className='size-3.5' />
                </div>
                <div className='flex flex-col text-left'>
                  <span className='text-sm font-black leading-none'>Checking source...</span>
                  <span className='text-[10px] font-bold text-black/60 uppercase tracking-wider mt-0.5'>
                    {detail.mediaType === "movie" ? "MOVIE" : `S${season} E${episode}`}
                  </span>
                </div>
              </button>
            ) : sourceStatus === "unavailable" ? (
              <button
                disabled
                className='flex items-center gap-3 bg-white/20 text-white/50 px-5 py-2.5 rounded-full font-bold cursor-not-allowed shadow-xl border border-white/10'
                type='button'
              >
                <div className='w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white/40 shrink-0'>
                  <AlertCircle className='size-3.5' />
                </div>
                <div className='flex flex-col text-left'>
                  <span className='text-sm font-black leading-none'>Source Unavailable</span>
                  <span className='text-[10px] font-bold text-white/40 uppercase tracking-wider mt-0.5'>
                    {detail.mediaType === "movie" ? "MOVIE" : `S${season} E${episode}`}
                  </span>
                </div>
              </button>
            ) : (
              <Link
                className='group relative flex items-center gap-3 bg-white hover:bg-white/90 text-black px-5 py-2.5 rounded-full font-bold transition-all duration-300 hover:scale-105 shadow-xl'
                href={playUrl}
              >
                <div className='w-7 h-7 rounded-full bg-black flex items-center justify-center text-white shrink-0 group-hover:scale-110 transition-transform'>
                  <Play className='size-3.5 fill-current ml-0.5' />
                </div>
                <div className='flex flex-col text-left'>
                  <span className='text-sm font-black leading-none'>
                    {watchProgress ? "Continue Watching" : "Watch Now"}
                  </span>
                  <span className='text-[10px] font-bold text-black/60 uppercase tracking-wider mt-0.5'>
                    {detail.mediaType === "movie" ? "MOVIE" : `S${season} E${episode}`}
                  </span>
                </div>
              </Link>
            )}

            {sources.length > 0 && (
              <button
                onClick={() => setDownloadModalOpen(true)}
                className='group relative flex items-center gap-3 bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-full font-bold transition-all duration-300 hover:scale-105 shadow-xl border border-white/10'
                type='button'
              >
                <div className='w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0 group-hover:scale-110 transition-transform'>
                  <Download className='size-3.5' />
                </div>
                <div className='flex flex-col text-left'>
                  <span className='text-sm font-black leading-none'>Download</span>
                  <span className='text-[10px] font-bold text-white/55 uppercase tracking-wider mt-0.5'>
                    {sources.length} links
                  </span>
                </div>
              </button>
            )}

            <WatchlistPicker iconOnly item={detail} menuPosition='up' />

            <button
              aria-label="Create Watch Party"
              className="w-11 h-11 rounded-full border bg-white/10 hover:bg-white/20 text-white border-white/20 flex items-center justify-center transition-all"
              onClick={() => setIsWatchPartyModalOpen(true)}
              type='button'
              title="Create Watch Party"
            >
              <Users className="size-5" />
            </button>

            <button
              aria-label={liked ? "Unlike" : "Like"}
              className={`w-11 h-11 rounded-full border flex items-center justify-center transition-all ${liked
                  ? "bg-white text-black border-white"
                  : "bg-white/10 hover:bg-white/20 text-white border-white/20"
                }`}
              disabled={likeBusy}
              onClick={toggleLike}
              type='button'
            >
              <ThumbsUp className={`size-5 ${liked ? "fill-current" : ""}`} />
            </button>
          </div>
        </div>

        {/* Controls fixed at far right edge of container */}
        <div className='absolute right-6 md:right-10 bottom-6 z-30 flex items-center gap-3'>
          {detail.trailerKey ? (
            <button
              aria-label={isPlayingTrailer ? "Pause trailer" : "Play trailer"}
              className='flex w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 border border-white/20 backdrop-blur-md items-center justify-center text-white shadow-xl transition-all hover:scale-105'
              onClick={() => {
                playerRef.current?.togglePlay();
                setIsPlayingTrailer((prev) => !prev);
              }}
              type='button'
            >
              {isPlayingTrailer ? (
                <Pause className='size-5 fill-current' />
              ) : (
                <Play className='size-5 fill-current ml-0.5' />
              )}
            </button>
          ) : null}

          <button
            aria-label={muted ? "Unmute preview" : "Mute preview"}
            className='w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 border border-white/20 backdrop-blur-md flex items-center justify-center text-white shadow-xl transition-all hover:scale-105'
            onClick={() => {
              playerRef.current?.setMuted(!muted);
              setMuted(!muted);
            }}
            type='button'
          >
            {muted ? (
              <VolumeX className='size-5' />
            ) : (
              <Volume2 className='size-5' />
            )}
          </button>
        </div>
      </section>

      <section className='modal-body-entrance space-y-9 px-6 pb-10 pt-6 md:px-10'>

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

    {downloadModalOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4" onClick={() => setDownloadModalOpen(false)}>
        <div className="relative w-full max-w-md rounded-2xl border border-white/10 bg-[#121214] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setDownloadModalOpen(false)}
            className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
          >
            <X className="size-5" />
          </button>
          <h3 className="text-xl font-bold text-white mb-2">Download Options</h3>
          <p className="text-sm text-white/60 mb-6 font-medium">Select a quality to download the media file directly.</p>
          
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1 no-scrollbar">
            {sources.map((source, index) => (
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
            {sources.length === 0 && (
              <div className="text-center py-6 text-white/40 text-sm">
                No download links available.
              </div>
            )}
          </div>
        </div>
      </div>
    )}

    <WatchPartyInviteModal
      isOpen={isWatchPartyModalOpen}
      onClose={() => setIsWatchPartyModalOpen(false)}
      mediaType={detail.mediaType}
      mediaId={detail.id}
      season={season}
      episode={episode}
    />
    </>
  );
}
