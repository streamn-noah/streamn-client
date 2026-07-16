"use client";

import { createPortal } from "react-dom";

import Image from "next/image";
import Link from "next/link";
import { Search, ArrowDownUp, AlertCircle,
  ChevronDown,
  Download,
  Film,
  Loader2,
  PartyPopper,
  Pause,
  Play,
  Share2,
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
import { IframePlayer } from "@/components/streamn/iframe-player";
import { WatchlistPicker } from "@/components/streamn/watchlist-picker";
import { WatchPartyInviteModal } from "@/components/streamn/watch-party-invite-modal";
import type { Episode, MediaDetail, MediaSummary } from "@/lib/media";
import { cinesrcUrl, tmdbImage } from "@/lib/media";
import { fetchStreamSources, fetchSeasonDownloadSources, type SeasonDownloadResponse, type SourceItem } from "@/lib/stream-source";
import { getWatchProgress, watchHref } from "@/lib/streamn-storage";
import { getLikedIds, likeMedia, unlikeMedia } from "@/lib/user-actions";
import { useLowDataMode } from "@/components/providers/low-data-provider";

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
  modalContainer,
}: {
  initialEpisodes: Episode[];
  mediaId: number;
  seasons: MediaDetail["seasons"];
  modalContainer: HTMLElement | null;
}) {
  const { isLowDataMode } = useLowDataMode();
  const filterAired = (eps: Episode[]) => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return eps.filter((ep) => {
      if (!ep.airDate) return false;
      const parts = ep.airDate.split("-");
      if (parts.length !== 3) return false;
      const airDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      return airDate.getTime() <= now.getTime();
    });
  };

  const [episodes, setEpisodes] = useState(() => filterAired(initialEpisodes));
  const [visibleCount, setVisibleCount] = useState(8);
  const [expandedEpisode, setExpandedEpisode] = useState<number | null>(null);
  const [searchEpisode, setSearchEpisode] = useState('');
  const [selectedSeason, setSelectedSeason] = useState(
    initialEpisodes[0]?.seasonNumber ?? seasons[0]?.seasonNumber ?? 1,
  );
  const [loadingSeason, setLoadingSeason] = useState(false);

  // Season Download states
  const [seasonDownloadModalOpen, setSeasonDownloadModalOpen] = useState(false);
  const [seasonDownloadData, setSeasonDownloadData] = useState<SeasonDownloadResponse | null>(null);
  const [loadingSeasonDownload, setLoadingSeasonDownload] = useState(false);
  const [selectedQuality, setSelectedQuality] = useState<string>("1080p");

  const availableQualities = useMemo(() => {
    if (!seasonDownloadData?.episodes) return [];
    const qualities = new Set<string>();
    for (const ep of seasonDownloadData.episodes) {
      for (const src of ep.sources) {
        if (src.quality) qualities.add(src.quality);
      }
    }
    return Array.from(qualities).sort((a, b) => parseInt(b) - parseInt(a));
  }, [seasonDownloadData]);

  useEffect(() => {
    if (availableQualities.length > 0 && !availableQualities.includes(selectedQuality)) {
      setSelectedQuality(availableQualities[0]);
    }
  }, [availableQualities, selectedQuality]);

  const filteredEpisodes = useMemo(() => {
    if (!seasonDownloadData?.episodes) return [];
    return seasonDownloadData.episodes.map(ep => {
      let source = ep.sources.find(s => s.quality === selectedQuality);
      if (!source && ep.sources.length > 0) source = ep.sources[0];
      return {
        ...ep,
        selectedSource: source
      };
    });
  }, [seasonDownloadData, selectedQuality]);

  const totalSizeMB = useMemo(() => {
    let total = 0;
    for (const ep of filteredEpisodes) {
      const sizeStr = ep.selectedSource?.size;
      if (sizeStr) {
        const num = parseFloat(sizeStr);
        if (!isNaN(num)) {
          if (sizeStr.toUpperCase().includes("GB")) {
            total += num * 1024;
          } else {
            total += num;
          }
        }
      }
    }
    return total;
  }, [filteredEpisodes]);

  const totalSizeLabel = totalSizeMB > 0
    ? (totalSizeMB > 1024 ? `${(totalSizeMB / 1024).toFixed(2)} GB` : `${totalSizeMB.toFixed(0)} MB`)
    : "Unknown Size";

  // Episode Download states
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [downloadEpisode, setDownloadEpisode] = useState<Episode | null>(null);
  const [downloadSources, setDownloadSources] = useState<any[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);

  const handleDownloadClick = async (ep: Episode) => {
    setDownloadEpisode(ep);
    setDownloadModalOpen(true);
    setLoadingSources(true);
    setDownloadSources([]);
    try {
      const res = await fetchStreamSources(
        "tv",
        mediaId,
        ep.seasonNumber,
        ep.episodeNumber,
        false,
        "download",
      );
      if (res.sources) {
        setDownloadSources(res.sources);
      }
    } catch (err) {
      console.error("Failed to fetch download links:", err);
    } finally {
      setLoadingSources(false);
    }
  };

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
      setEpisodes(filterAired(data.episodes ?? []));
    } finally {
      setLoadingSeason(false);
    }
  }

  const handleSeasonDownloadClick = async () => {
    setSeasonDownloadModalOpen(true);
    setLoadingSeasonDownload(true);
    setSeasonDownloadData(null);
    try {
      const res = await fetchSeasonDownloadSources("tv", mediaId, selectedSeason);
      setSeasonDownloadData(res);
    } catch (err) {
      console.error("Failed to fetch season downloads:", err);
    } finally {
      setLoadingSeasonDownload(false);
    }
  };

  const handleCopyLinks = () => {
    if (!filteredEpisodes.length) return;
    const links = filteredEpisodes
      .map((ep) => ep.selectedSource?.url)
      .filter(Boolean)
      .join("\n");
    navigator.clipboard.writeText(links).then(() => {
      alert("Links copied to clipboard!");
    });
  };

  const handleDownloadAll = async () => {
    if (!filteredEpisodes.length) return;
    const links = filteredEpisodes
      .map((ep) => ep.selectedSource?.url)
      .filter(Boolean);

    if (links.length === 0) return;

    // Staggered trigger to avoid extreme browser blocking (though still may prompt)
    for (let i = 0; i < links.length; i++) {
      const url = links[i];
      if (url) {
        setTimeout(() => {
          const a = document.createElement('a');
          a.href = url;
          a.download = '';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }, i * 500); // 500ms delay between each download
      }
    }
  };

  const handleDownloadTxt = () => {
    if (!filteredEpisodes.length) return;
    const links = filteredEpisodes
      .map((ep) => ep.selectedSource?.url)
      .filter(Boolean)
      .join("\n");

    if (!links) return;

    const blob = new Blob([links], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `season_${selectedSeason}_links.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const searchFilteredEpisodes = searchEpisode.trim() 
    ? episodes.filter(ep => ep.name.toLowerCase().includes(searchEpisode.toLowerCase()) || (ep.overview && ep.overview.toLowerCase().includes(searchEpisode.toLowerCase())))
    : episodes;
  const visibleEpisodes = searchFilteredEpisodes.slice(0, visibleCount);
  const hasMore = searchFilteredEpisodes.length > visibleCount;

  return (
    <div>
      <div className='mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4'>
        <h3 className='section-title mb-0'>Episodes</h3>
        <div className="flex items-center gap-3">
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

          <button
            onClick={handleSeasonDownloadClick}
            className="flex items-center gap-2 rounded-full bg-white text-black px-4 py-2 text-sm font-bold shadow-xl transition hover:bg-white/90 cursor-pointer whitespace-nowrap"
            title="Download Entire Season"
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">Download Season</span>
            <span className="sm:hidden">Season</span>
          </button>
        </div>
      </div>
      <div className={`episode-list flex flex-col gap-3 ${loadingSeason ? "opacity-55" : ""}`}>
        {visibleEpisodes.map((episode) => {
          const isExpanded = expandedEpisode === episode.id;
          return (
            <div className='group block rounded-xl border border-white/10 bg-[#0d0d0f] transition-colors hover:bg-white/[0.05] overflow-hidden' key={episode.id}>
              
              {/* WEB LAYOUT (hidden on mobile) */}
              <div className='hidden md:flex items-start gap-4 p-4'>
                <Link 
                  href={`/watch/tv/${mediaId}?s=${episode.seasonNumber}&e=${episode.episodeNumber}`}
                  className='relative aspect-video w-56 shrink-0 overflow-hidden rounded-lg bg-white/8 block'
                >
                  {episode.stillPath ? (
                    <Image src={tmdbImage(episode.stillPath, isLowDataMode ? "w200" : "w300")} alt='' fill sizes='224px' loading={isLowDataMode ? "lazy" : undefined} quality={isLowDataMode ? 60 : 75} className='object-cover transition-transform duration-300 group-hover:scale-[1.03]' />
                  ) : (
                    <span className='flex h-full w-full items-center justify-center bg-white/[0.02] text-white/25'><Film className='size-5' /></span>
                  )}
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Play className="size-6 text-white fill-current drop-shadow-md" />
                  </div>
                  <div className="absolute bottom-2 left-2 bg-black/80 px-2 py-0.5 rounded-md text-sm font-bold text-white backdrop-blur-md">
                    {episode.episodeNumber}
                  </div>
                </Link>

                <div className='flex-1 min-w-0 flex flex-col justify-center py-1 pr-4'>
                  <Link href={`/watch/tv/${mediaId}?s=${episode.seasonNumber}&e=${episode.episodeNumber}`} className='truncate text-lg font-bold text-white hover:underline'>
                    {episode.name}
                  </Link>
                  <p className='mt-2 text-sm leading-relaxed text-white/60 line-clamp-2'>
                    {episode.overview || "No episode description available."}
                  </p>
                </div>

                <div className='shrink-0 flex items-center justify-center pl-4 py-2'>
                  <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDownloadClick(episode); }} className="p-2 text-white/50 hover:text-white transition-colors cursor-pointer" title="Download Episode">
                    <Download className="size-5" />
                  </button>
                </div>
              </div>

              {/* MOBILE LAYOUT (hidden on web) */}
              <div className='md:hidden block'>
                <div className='flex items-center gap-4 p-3 cursor-pointer' onClick={() => setExpandedEpisode(isExpanded ? null : episode.id)}>
                  <div className='relative aspect-video w-32 shrink-0 overflow-hidden rounded-lg bg-white/8'>
                    {episode.stillPath ? (
                      <Image src={tmdbImage(episode.stillPath, "w200")} alt='' fill sizes='128px' loading="lazy" quality={60} className='object-cover' />
                    ) : (
                      <span className='flex h-full w-full items-center justify-center bg-white/[0.02] text-white/25'><Film className='size-5' /></span>
                    )}
                    <div className="absolute bottom-1 left-1 bg-black/80 px-1.5 py-0.5 rounded text-[10px] font-bold text-white backdrop-blur-md">
                      {episode.episodeNumber}
                    </div>
                  </div>
                  
                  <div className='flex-1 min-w-0'>
                    <h4 className='font-bold text-sm text-white line-clamp-2'>
                      {episode.name}
                    </h4>
                  </div>

                  <div className='shrink-0 pr-1'>
                    <ChevronDown className={`size-5 text-white/50 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </div>

                {isExpanded && (
                  <div className='p-4 pt-2 border-t border-white/5 animate-in slide-in-from-top-2 fade-in duration-200'>
                    <h4 className='font-bold text-white mb-2 text-sm'>
                      {episode.episodeNumber}. {episode.name}
                    </h4>
                    <p className='text-xs text-white/60 leading-relaxed mb-4'>
                      {episode.overview || "No episode description available."}
                    </p>
                    
                    <div className='flex items-center gap-3'>
                      <Link href={`/watch/tv/${mediaId}?s=${episode.seasonNumber}&e=${episode.episodeNumber}`} className='flex-1 flex justify-center items-center gap-2 rounded-full bg-white text-black py-2 text-sm font-bold shadow-xl transition active:scale-95'>
                        <Play className="size-4 fill-current ml-0.5" />
                        Play
                      </Link>
                      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDownloadClick(episode); }} className='flex items-center justify-center size-10 rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition active:scale-95 shrink-0'>
                        <Download className="size-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
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

      {/* Episode Download Modal */}
      {downloadModalOpen && downloadEpisode && modalContainer && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          onClick={() => setDownloadModalOpen(false)}
        >
          <div
            className="relative max-w-md w-full bg-neutral-900 border border-white/10 rounded-2xl p-6 shadow-2xl text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setDownloadModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition cursor-pointer"
              title="Close"
            >
              <X className="size-5" />
            </button>
            <h3 className="text-xl font-bold text-white mb-1">Download Options</h3>
            <p className="text-sm text-white/60 mb-6 font-medium">
              Season {downloadEpisode.seasonNumber}, Episode {downloadEpisode.episodeNumber} · {downloadEpisode.name}
            </p>

            <div className="space-y-3">
              {loadingSources ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2">
                  <Loader2 className="size-8 animate-spin text-white/60" />
                  <p className="text-xs text-white/50">Fetching download links...</p>
                </div>
              ) : downloadSources.length > 0 ? (
                downloadSources.map((s, index) => (
                  <a
                    key={index}
                    href={s.url}
                    download
                    className="flex items-center justify-between bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-3.5 transition cursor-pointer group/dl-item"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-white uppercase">
                        {s.quality || "Default Quality"}
                      </span>
                      {s.size && (
                        <span className="text-xs text-white/40 font-medium mt-0.5">
                          {s.size}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 bg-white text-black text-xs font-bold px-4 py-2 rounded-lg group-hover/dl-item:bg-white/95 transition">
                      <Download className="size-4" />
                      <span>Download</span>
                    </div>
                  </a>
                ))
              ) : (
                <div className="text-center py-8 text-white/40 text-sm flex flex-col items-center gap-2">
                  <AlertCircle className="size-8 text-white/20" />
                  <span>No download links available.</span>
                </div>
              )}
            </div>
          </div>
        </div>,
        modalContainer
      )}

      {/* Season Batch Download Modal */}
      {seasonDownloadModalOpen && modalContainer && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          onClick={() => setSeasonDownloadModalOpen(false)}
        >
          <div
            className="relative max-w-lg w-full bg-neutral-900 border border-white/10 rounded-2xl p-6 shadow-2xl text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSeasonDownloadModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition cursor-pointer"
              title="Close"
            >
              <X className="size-5" />
            </button>
            <div className="flex items-center justify-between mb-1 pr-12">
              <h3 className="text-xl font-bold text-white">Download Season {selectedSeason}</h3>
            </div>
            <p className="text-sm text-white/60 mb-6 font-medium">
              Get all episodes for this season in one go. Approx size: <span className="text-white font-bold">{totalSizeLabel}</span>
            </p>

            <div className="space-y-4">
              {loadingSeasonDownload ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="size-8 animate-spin text-white/60" />
                  <p className="text-sm text-white/50">Fetching season links...</p>
                </div>
              ) : filteredEpisodes.length > 0 ? (
                <>
                  <div className="flex flex-col sm:flex-row gap-3">
                    {/* <button
                      onClick={handleDownloadAll}
                      className="flex-1 flex items-center justify-center gap-2 bg-white text-black font-bold py-3 rounded-xl hover:bg-white/90 transition shadow-lg"
                    >
                      <span>Download Now</span>
                    </button> */}
                    <button
                      onClick={handleCopyLinks}
                      className="flex-1 flex items-center justify-center gap-2 bg-white text-black font-bold py-3 rounded-xl hover:bg-white/90 transition shadow-lg"
                    >
                      <span className="truncate">Copy Links (IDM)</span>
                    </button>
                    <button
                      onClick={handleDownloadTxt}
                      className="flex-1 flex items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/10 text-white font-bold py-3 rounded-xl transition"
                    >
                      <span className="truncate">Save as .txt</span>
                    </button>
                  </div>

                  <div className="mt-4 bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-white/70 leading-relaxed">
                    <span className="text-white font-bold block mb-1">How to download sequentially:</span>
                    Omo i still dey work on the auto qeue download feature. For now just use a download manager. Copy the links above and paste them into <span className="text-white/90 font-semibold">Internet Download Manager (IDM)</span>, or save the <span className="text-white/90 font-semibold">.txt</span> file and import it into <span className="text-white/90 font-semibold">JDownloader</span>.
                  </div>

                  <div className="mt-6">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-0">
                        Included Episodes ({filteredEpisodes.length})
                      </h4>
                      {availableQualities.length > 0 && (
                        <select
                          value={selectedQuality}
                          onChange={(e) => setSelectedQuality(e.target.value)}
                          className="bg-white/10 border border-white/20 text-white rounded-lg px-2 py-1 text-xs outline-none cursor-pointer relative z-10"
                        >
                          {availableQualities.map(q => (
                            <option key={q} value={q} className="bg-neutral-900 text-white">{q}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-2 pr-2 no-scrollbar">
                      {filteredEpisodes.map((ep) => (
                        <div key={ep.episode} className="flex items-center justify-between bg-white/[0.03] border border-white/5 rounded-lg p-3">
                          <div className="font-semibold text-sm">Episode {ep.episode}</div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-white/40 font-medium">{ep.selectedSource?.size || "Unknown"}</span>
                            <div className="text-xs text-white/80 bg-white/10 px-2 py-1 rounded font-bold">
                              {ep.selectedSource?.quality || "Default"}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-white/40 text-sm flex flex-col items-center gap-2">
                  <AlertCircle className="size-8 text-white/20" />
                  <span>No batch download links available for this season.</span>
                </div>
              )}
            </div>
          </div>
        </div>,
        modalContainer
      )}
    </div>
  );
}

export function MediaDetailContent({
  detail,
}: {
  detail: MediaDetail;
}) {
  const { isLowDataMode } = useLowDataMode();
  const router = useRouter();
  const { user, setAuthModalOpen } = useAuth();
  const [liked, setLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  const [isDescriptionVisible, setIsDescriptionVisible] = useState(true);
  const [isWatchPartyModalOpen, setIsWatchPartyModalOpen] = useState(false);
  const [modalContainer, setModalContainer] = useState<HTMLElement | null>(null);
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

  const handleSelect = (item: MediaSummary) => {
    const slug = (item.title || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    router.push(`/title/${item.mediaType}/${item.id}-${slug}`);
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
      setAuthModalOpen(true);
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

    fetchStreamSources(detail.mediaType, detail.id, season, episode, false, "download")
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

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: detail.title,
          text: `Check out ${detail.title} on Streamn`,
          url: window.location.href,
        });
      } catch (err) {
        // ignored
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      alert("Link copied to clipboard!");
    }
  };

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
      <div className='w-full bg-black text-white rounded-t-2xl md:rounded-none pb-12'>
        <section
          className='relative w-full h-[50vh] min-h-[400px] md:h-[65vh] overflow-hidden bg-black flex items-end select-none group'
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="absolute inset-0">
            <Image
              src={tmdbImage(detail.backdropPath || detail.posterPath, "original")}
              alt={detail.title}
              fill
              priority
              className="object-cover object-top"
            />
          </div>
          <div className='absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent z-10' />
          <div className='hidden md:block absolute inset-0 bg-gradient-to-r from-black via-black/40 to-transparent z-10' />

          <div className="relative z-20 w-full px-6 md:px-10 md:pl-[112px] pb-2 md:pb-8 flex flex-col items-center text-center md:items-start md:text-left">
            {detail.logoPath ? (
              <Image
                src={tmdbImage(detail.logoPath, "w500")}
                alt={detail.title}
                width={420}
                height={170}
                className='mb-3 h-auto max-h-24 md:max-h-36 w-auto max-w-[85%] object-contain object-center md:object-left drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)]'
              />
            ) : (
              <h2 className='mb-3 max-w-2xl text-4xl md:text-5xl font-black tracking-tight drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)]'>
                {detail.title}
              </h2>
            )}
          </div>
        </section>

        {/* Info & Actions Section Below Banner */}
        <section className='flex flex-col md:flex-row gap-6 px-6 md:px-10 md:pl-[112px] pt-4 md:pt-6 pb-6'>
          <div className='flex flex-col gap-4 w-full md:w-[70%]'>
            {/* Mobile Prominent Buttons (Watch / Watch Party) */}
            <div className="flex md:hidden flex-col gap-3 w-full mb-2">
              {sourceStatus === "loading" ? (
                <button
                  disabled
                  className='flex items-center justify-center gap-3 bg-white/70 text-black/70 px-5 py-3 rounded-xl font-bold cursor-not-allowed shadow-xl backdrop-blur-sm'
                  type='button'
                >
                  <Loader2 className='size-5 animate-spin' />
                  <span>Checking source...</span>
                </button>
              ) : sourceStatus === "unavailable" ? (
                <button
                  disabled
                  className='flex items-center justify-center gap-3 bg-white/20 text-white/50 px-5 py-3 rounded-xl font-bold cursor-not-allowed shadow-xl border border-white/10'
                  type='button'
                >
                  <AlertCircle className='size-5' />
                  <span>Source Unavailable</span>
                </button>
              ) : (
                <Link
                  className='flex items-center justify-center gap-3 bg-white text-black px-5 py-3 rounded-xl font-bold shadow-xl'
                  href={playUrl}
                >
                  <Play className='size-5 fill-current' />
                  <span>{watchProgress ? "Continue Watching" : "Watch Now"}</span>
                </Link>
              )}

              <button
                onClick={() => setIsWatchPartyModalOpen(true)}
                className='flex items-center justify-center gap-3 bg-white/10 text-white px-5 py-3 rounded-xl font-bold shadow-xl border border-white/10'
                type='button'
              >
                <PartyPopper className='size-5' />
                <span>Watch Together</span>
              </button>
            </div>

            {/* Meta Stats */}
            <div className='flex flex-wrap items-center gap-2 text-white/90 text-xs md:text-sm font-semibold drop-shadow-md'>
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
                  <span className="px-1.5 py-0.5 rounded bg-white/15 text-[11px] font-bold text-white/90 border border-white/20">
                    {fileSizeRange}
                  </span>
                </>
              ) : null}
            </div>

            {/* Description */}
            <p className='text-white/80 text-sm md:text-base leading-relaxed drop-shadow-md font-normal max-w-3xl'>
              {detail.overview}
            </p>

            {/* Genres */}
            {detail.genres.length > 0 ? (
              <div className='text-xs md:text-sm font-semibold text-white/50 tracking-wide'>
                {detail.genres.join(" | ")}
              </div>
            ) : null}

            {/* Desktop Action Buttons */}
            <div className='hidden md:flex flex-wrap items-center gap-3 z-20 mt-2'>
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

              <button
                onClick={() => setIsWatchPartyModalOpen(true)}
                className='group relative flex items-center gap-3 bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-full font-bold transition-all duration-300 hover:scale-105 shadow-xl border border-white/10'
                type='button'
              >
                <div className='w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-white shrink-0 group-hover:scale-110 transition-transform'>
                  <PartyPopper className='size-3.5' />
                </div>
                <div className='flex flex-col text-left'>
                  <span className='text-sm font-black leading-none'>Watch 2gether</span>
                  <span className='text-[10px] font-bold text-white/55 uppercase tracking-wider mt-0.5'>
                    Invite Friends
                  </span>
                </div>
              </button>

              <WatchlistPicker iconOnly item={detail} menuPosition='up' customButtonClass="w-[42px] h-[42px] rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white flex items-center justify-center transition-colors" />

              <button
                aria-label={liked ? "Unlike" : "Like"}
                className={`w-[42px] h-[42px] rounded-full border flex items-center justify-center transition-colors ${liked ? "bg-white text-black border-white" : "bg-white/10 hover:bg-white/20 text-white border-white/10"}`}
                disabled={likeBusy}
                onClick={toggleLike}
                type='button'
              >
                <ThumbsUp className={`size-5 ${liked ? "fill-current" : ""}`} />
              </button>

              {sources.length > 0 && (
                <button
                  onClick={() => setDownloadModalOpen(true)}
                  className='w-[42px] h-[42px] rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white flex items-center justify-center transition-colors'
                  type='button'
                  title="Download"
                >
                  <Download className='size-5' />
                </button>
              )}
              
              <button
                onClick={handleShare}
                className='w-[42px] h-[42px] rounded-full bg-white/10 hover:bg-white/20 border border-white/10 text-white flex items-center justify-center transition-colors'
                title="Share"
              >
                <Share2 className='size-5' />
              </button>
            </div>

            {/* Mobile Action Buttons (Add, Like, Download, Share) below description */}
            <div className="flex md:hidden flex-wrap items-center mt-6 justify-between w-full px-4">
              <div className="flex flex-col items-center gap-1.5">
                <WatchlistPicker iconOnly item={detail} menuPosition='up' customButtonClass="p-2 text-white/70 hover:text-white transition-colors" />
                <span className="text-[10px] font-semibold text-white/50">My List</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <button
                  aria-label={liked ? "Unlike" : "Like"}
                  className={`p-2 transition-colors ${liked ? "text-white" : "text-white/70 hover:text-white"}`}
                  disabled={likeBusy}
                  onClick={toggleLike}
                  type='button'
                >
                  <ThumbsUp className={`size-5 ${liked ? "fill-current" : ""}`} />
                </button>
                <span className="text-[10px] font-semibold text-white/50">Like</span>
              </div>
              {sources.length > 0 && (
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    onClick={() => setDownloadModalOpen(true)}
                    className='p-2 text-white/70 hover:text-white transition-colors'
                    type='button'
                  >
                    <Download className='size-5' />
                  </button>
                  <span className="text-[10px] font-semibold text-white/50">Download</span>
                </div>
              )}
              <div className="flex flex-col items-center gap-1.5">
                <button
                  onClick={handleShare}
                  className='p-2 text-white/70 hover:text-white transition-colors'
                  type='button'
                >
                  <Share2 className='size-5' />
                </button>
                <span className="text-[10px] font-semibold text-white/50">Share</span>
              </div>
            </div>
          </div>
        </section>

        <section className='modal-body-entrance space-y-9 px-6 pb-10 pt-6 md:px-10 md:pl-[112px]'>

          {detail.episodes.length ? (
            <Episodes
              initialEpisodes={detail.episodes}
              mediaId={detail.id}
              seasons={detail.seasons}
              modalContainer={modalContainer}
            />
          ) : null}

          {detail.recommendations.length ? (
            <div>
              <h3 className='section-title'>More Like This</h3>
              <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
                {detail.recommendations.slice(0, 8).map((item) => {
                  const releaseDate = item.releaseDate || item.firstAirDate;
                  const year = releaseDate ? new Date(releaseDate).getFullYear() : "";
                  const typeLabel = item.mediaType === "movie" ? "MOVIE" : "SERIES";
                  
                  return (
                    <button
                      className='group flex flex-col text-left'
                      key={`${item.mediaType}-${item.id}`}
                      onClick={() => handleSelect(item)}
                      type='button'
                    >
                      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-white/10 bg-white/5 transition-transform duration-300 group-hover:border-white/20">
                        <Image
                          src={tmdbImage(item.backdropPath || item.posterPath, "w780")}
                          alt=''
                          fill
                          sizes='(max-width: 768px) 50vw, 280px'
                          className='object-cover transition duration-500 group-hover:scale-105'
                        />
                        {item.voteAverage ? (
                          <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-xs font-bold text-white backdrop-blur-md">
                            <Star className="size-3 fill-current" />
                            {item.voteAverage.toFixed(1)}
                          </div>
                        ) : null}
                      </div>
                      <div className="mt-2 w-full pr-2">
                        <h4 className='truncate text-sm font-bold text-white transition-colors group-hover:text-white/80'>
                          {item.title}
                        </h4>
                        <div className="mt-0.5 flex items-center text-[11px] font-semibold text-white/50">
                          {year ? <span>{year} <span className="mx-1 text-white/30">•</span> </span> : null}
                          <span className="uppercase tracking-wider">{typeLabel}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <div ref={setModalContainer} className="relative z-[200]" />

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
