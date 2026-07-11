"use client";

import { useEffect, useRef, useState, useCallback, useMemo, forwardRef, useImperativeHandle } from "react";
import Hls from "hls.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Captions,
  Check,
  ChevronRight,
  Download,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  Volume2,
  VolumeX,
  X,
  AlertCircle,
  RefreshCw,
  Info,
  Users,
  ListVideo,
  Film,
} from "lucide-react";
import { tmdbImage, type MediaSummary, type MediaType, type Episode } from "@/lib/media";
import {
  fetchStreamSources,
  getCachedStreamSources,
  type SourceItem,
  type StreamBackendResponse,
  type SubtitleItem,
} from "@/lib/stream-source";
import { commitWatchSession, getWatchProgress, watchHref } from "@/lib/streamn-storage";
import { syncWatchSession } from "@/lib/user-actions";

export type CustomPlayerHandle = {
  postCommand: (func: string, args?: any[]) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getIsPlaying: () => boolean;
};

type CustomPlayerProps = {
  mediaType: MediaType;
  mediaId: number;
  season: number;
  episode: number;
  item: MediaSummary;
  nextHref?: string | null;
  recommendations?: MediaSummary[];
  runtimeMinutes?: number | null;
  fileSizeRange?: string | null;
  isWatchParty?: boolean;
  onWatchPartyToggle?: () => void;
  showWatchPartyActive?: boolean;
  onVideoEvent?: (type: string, currentTime: number, duration: number) => void;
};

// VTT Parser & Subtitle Cue Utility
type VTTCue = { start: number; end: number; text: string };
type IntroDbSegment = {
  startMs: number;
  endMs: number | null;
  durationMs: number | null;
  startsAtBeginning: boolean;
  endsAtMediaEnd: boolean;
};

type IntroDbMediaRecord = {
  intro: IntroDbSegment[];
  recap: IntroDbSegment[];
  credits: IntroDbSegment[];
  preview: IntroDbSegment[];
};

function parseVTTTime(timeStr: string): number {
  const parts = timeStr.replace(",", ".").split(":");
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  if (parts.length === 3) {
    hours = parseFloat(parts[0]);
    minutes = parseFloat(parts[1]);
    seconds = parseFloat(parts[2]);
  } else {
    minutes = parseFloat(parts[0]);
    seconds = parseFloat(parts[1]);
  }

  return hours * 3600 + minutes * 60 + seconds;
}

function parseVTT(text: string): VTTCue[] {
  const lines = text.split(/\r?\n/);
  const cues: VTTCue[] = [];
  let currentCue: VTTCue | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes("-->")) {
      const parts = line.split("-->");
      const startStr = parts[0].trim();
      const endStr = parts[1].trim().split(" ")[0];
      const start = parseVTTTime(startStr);
      const end = parseVTTTime(endStr);
      currentCue = { start, end, text: "" };
    } else if (line === "") {
      if (currentCue) {
        cues.push(currentCue);
        currentCue = null;
      }
    } else if (currentCue) {
      currentCue.text += (currentCue.text ? "\n" : "") + line;
    }
  }
  if (currentCue) cues.push(currentCue);
  return cues;
}

function CustomSubtitlesOverlay({
  url,
  currentTime,
}: {
  url: string | null;
  currentTime: number;
}) {
  const [cues, setCues] = useState<VTTCue[]>([]);

  useEffect(() => {
    if (!url) {
      setCues([]);
      return;
    }

    let active = true;
    fetch(url)
      .then((res) => res.text())
      .then((text) => {
        if (active) setCues(parseVTT(text));
      })
      .catch((err) => {
        console.error("Failed to load VTT subtitle:", err);
        if (active) setCues([]);
      });

    return () => {
      active = false;
    };
  }, [url]);

  const activeCue = useMemo(() => {
    return cues.find(
      (cue) => currentTime >= cue.start && currentTime <= cue.end,
    );
  }, [cues, currentTime]);

  if (!activeCue || !activeCue.text) return null;

  return (
    <div className='pointer-events-none absolute bottom-[15%] left-0 right-0 z-30 flex justify-center px-6'>
      <div className='max-w-2xl rounded-lg bg-black/60 px-4 py-1.5 text-center text-lg md:text-2xl font-medium text-white shadow-2xl backdrop-blur-md whitespace-pre-wrap leading-snug border border-white/10'>
        {activeCue.text}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (num: number) => String(num).padStart(2, "0");
  if (h > 0) {
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  return `${pad(m)}:${pad(s)}`;
}

function isEpisodeAired(airDate: string): boolean {
  if (!airDate) return false;

  const parts = airDate.split("-");
  if (parts.length !== 3) return false;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const releaseDate = new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2]),
  );

  return releaseDate.getTime() <= now.getTime();
}

function filterAiredEpisodes(episodes: Episode[]): Episode[] {
  return episodes.filter((episode) => isEpisodeAired(episode.airDate));
}

function getDownloadFileName(
  item: MediaSummary,
  mediaType: MediaType,
  season: number,
  episode: number,
  sourceUrl: string,
): string {
  const safeTitle = item.title.replace(/[<>:"/\\|?*]+/g, "").trim().replace(/\s+/g, ".");
  const extensionMatch = sourceUrl.match(/\.([a-z0-9]{2,4})(?:[?#]|$)/i);
  const extension = extensionMatch?.[1]?.toLowerCase() ?? "mp4";

  if (mediaType === "movie") {
    return `${safeTitle || "streamn-download"}.${extension}`;
  }

  return `${safeTitle || "streamn-download"}.S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}.${extension}`;
}

function findActiveSegment(
  segments: IntroDbSegment[],
  currentTimeSeconds: number,
  durationSeconds: number,
): IntroDbSegment | null {
  const currentTimeMs = currentTimeSeconds * 1000;
  const fallbackEndMs =
    durationSeconds > 0 ? Math.max(durationSeconds * 1000, currentTimeMs) : Number.POSITIVE_INFINITY;

  return (
    segments.find((segment) => {
      const endMs = segment.endMs ?? fallbackEndMs;
      return currentTimeMs >= segment.startMs && currentTimeMs < endMs;
    }) ?? null
  );
}

function getProxiedStreamUrl(rawUrl: string, type?: string): string {
  if (!rawUrl) return "";
  const cleanedUrl = rawUrl.replace(/(https?:\/\/[^/]+)\/\/+/g, "$1/");
  
  if (cleanedUrl.includes("/api/proxy") || cleanedUrl.startsWith("/")) {
    return cleanedUrl;
  }

  if (typeof window !== "undefined" && !cleanedUrl.startsWith(window.location.origin)) {
    const isHls = cleanedUrl.includes(".m3u8") || type === "hls" || type === "m3u8";
    if (!isHls) {
      return `/api/proxy/video?url=${encodeURIComponent(cleanedUrl)}`;
    }
  }

  return cleanedUrl;
}

function getProxiedSubtitleUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  if (rawUrl.includes("/proxy")) {
    return rawUrl.replace(/(https?:\/\/[^\/]+)\/\/+/g, "$1/");
  }
  if (typeof window !== "undefined" && !rawUrl.startsWith(window.location.origin) && !rawUrl.startsWith("/")) {
    return `/api/proxy?url=${encodeURIComponent(rawUrl)}`;
  }
  return rawUrl.replace(/(https?:\/\/[^\/]+)\/\/+/g, "$1/");
}

export const CustomPlayer = forwardRef<CustomPlayerHandle, CustomPlayerProps>(
  function CustomPlayer(
    {
      mediaType,
      mediaId,
      season,
      episode,
      item,
      nextHref,
      recommendations = [],
      runtimeMinutes = null,
      fileSizeRange = null,
      isWatchParty = false,
      onWatchPartyToggle,
      showWatchPartyActive = false,
      onVideoEvent,
    },
    ref
  ) {
  const router = useRouter();

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideControlsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const progressRef = useRef(0);
  const engagedRef = useRef(0);
  const lastTickRef = useRef(Date.now());

  // Data State
  const [streamData, setStreamData] = useState<StreamBackendResponse | null>(null);
  const [sourceIndex, setSourceIndex] = useState(0);
  const [loadingSources, setLoadingSources] = useState(true);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [introDbSegments, setIntroDbSegments] = useState<IntroDbMediaRecord | null>(null);

  // Player UI State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showMovieRecommendations, setShowMovieRecommendations] = useState(false);
  const [hasSkippedMovieCredits, setHasSkippedMovieCredits] = useState(false);

  // Menus
  const [activeMenu, setActiveMenu] = useState<
    "settings" | "subtitles" | "audio" | "quality" | "speed" | "servers" | null
  >(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedSubtitle, setSelectedSubtitle] = useState<number>(-1); // -1 = off
  const [selectedQuality, setSelectedQuality] = useState<number>(-1); // -1 = Auto
  const [hlsLevels, setHlsLevels] = useState<{ id: number; name: string }[]>([]);

  // Subtitle track state
  const [vttTracks, setVttTracks] = useState<SubtitleItem[]>([]);

  useImperativeHandle(ref, () => ({
    postCommand: (func: string, args: any[] = []) => {
      const video = videoRef.current;
      if (!video) return;
      if (func === "play") {
        video.play().catch(() => setIsPlaying(false));
      } else if (func === "pause") {
        video.pause();
      } else if (func === "seek") {
        const time = typeof args[0] === "number" ? args[0] : 0;
        video.currentTime = time;
        setCurrentTime(time);
      }
    },
    getCurrentTime: () => progressRef.current,
    getDuration: () => videoRef.current?.duration || 0,
    getIsPlaying: () => isPlaying,
  }), [isPlaying]);

  // TV episodes list popover state
  const [seasons, setSeasons] = useState<{ id: number; name: string; seasonNumber: number; episodeCount: number }[]>([]);
  const [selectedSeasonForEpisodes, setSelectedSeasonForEpisodes] = useState<number>(season);
  const [episodesMap, setEpisodesMap] = useState<Record<number, Episode[]>>({});
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [showEpisodesPopover, setShowEpisodesPopover] = useState(false);

  useEffect(() => {
    let active = true;
    setIntroDbSegments(null);
    setShowMovieRecommendations(false);
    setHasSkippedMovieCredits(false);

    const params = new URLSearchParams({
      tmdbId: String(mediaId),
    });

    if (mediaType === "tv") {
      params.set("season", String(season));
      params.set("episode", String(episode));
    } else if (runtimeMinutes && runtimeMinutes > 0) {
      params.set("durationMs", String(runtimeMinutes * 60 * 1000));
    }

    fetch(`/api/introdb?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          if (res.status !== 404) {
            const payload = await res.json().catch(() => null);
            console.warn("Failed to load IntroDB segments:", payload?.error || res.statusText);
          }
          return null;
        }

        return res.json() as Promise<IntroDbMediaRecord>;
      })
      .then((data) => {
        if (active) {
          setIntroDbSegments(data);
        }
      })
      .catch((error) => {
        console.warn("Failed to fetch IntroDB segments:", error);
      });

    return () => {
      active = false;
    };
  }, [episode, mediaId, mediaType, runtimeMinutes, season]);

  const fetchEpisodesForSeason = useCallback(async (sNum: number) => {
    if (episodesMap[sNum]) return; // already cached
    setLoadingEpisodes(true);
    try {
      const res = await fetch(`/api/season?tvId=${mediaId}&season=${sNum}`);
      const data = await res.json();
      if (data.episodes) {
        setEpisodesMap((prev) => ({
          ...prev,
          [sNum]: filterAiredEpisodes(data.episodes),
        }));
      }
    } catch (err) {
      console.error("Failed to fetch episodes:", err);
    } finally {
      setLoadingEpisodes(false);
    }
  }, [mediaId, episodesMap]);

  useEffect(() => {
    if (mediaType !== "tv") return;

    const fetchTvDetails = async () => {
      try {
        const res = await fetch(`/api/details?type=tv&id=${mediaId}`);
        const data = await res.json();
        if (data.seasons) {
          setSeasons(data.seasons);
        }
      } catch (err) {
        console.error("Failed to fetch tv details:", err);
      }
    };

    fetchTvDetails();
  }, [mediaId, mediaType]);

  useEffect(() => {
    if (mediaType === "tv") {
      fetchEpisodesForSeason(selectedSeasonForEpisodes);
    }
  }, [selectedSeasonForEpisodes, mediaType, fetchEpisodesForSeason]);

  // Suppress unhandled rejections from chrome extension adblockers / stream fetch failures
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const msg = String(event.reason?.message || event.reason || "");
      if (
        event.reason?.name === "AbortError" ||
        msg.includes("aborted") ||
        msg.includes("Failed to fetch")
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    return () => {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  // 1. Fetch sources on mount or props change
  useEffect(() => {
    let active = true;
    setLoadingSources(true);
    setSourceError(null);

    const cached = getCachedStreamSources(mediaType, mediaId, season, episode);
    if (cached && cached.sources && cached.sources.length > 0) {
      setStreamData(cached);
      const tracks = cached.subtitles || [];
      setVttTracks(tracks);
      if (tracks.length > 0) setSelectedSubtitle(0);
      setLoadingSources(false);
      return;
    }

    fetchStreamSources(mediaType, mediaId, season, episode)
      .then((data) => {
        if (!active) return;
        setStreamData(data);
        const tracks = data.subtitles || [];
        setVttTracks(tracks);
        if (tracks.length > 0) setSelectedSubtitle(0);
        if (!data.sources || data.sources.length === 0) {
          setSourceError("No available stream sources for this title.");
        }
      })
      .catch((err) => {
        if (!active) return;
        setSourceError(err?.message || "Failed to load stream sources.");
      })
      .finally(() => {
        if (active) setLoadingSources(false);
      });

    return () => {
      active = false;
    };
  }, [mediaType, mediaId, season, episode]);

  // Initial resume timestamp
  const initialResumeRef = useRef<number | null>(null);
  useEffect(() => {
    const saved = getWatchProgress(mediaType, mediaId);
    if (
      saved &&
      saved.mediaType === mediaType &&
      saved.id === mediaId &&
      (mediaType === "movie" || (saved.seasonNumber === season && saved.episodeNumber === episode))
    ) {
      initialResumeRef.current = saved.progressSeconds > 10 ? saved.progressSeconds : null;
    }
  }, [mediaType, mediaId, season, episode]);

  // Session stats logger
  const persistSession = useCallback(() => {
    if (isPlaying) {
      engagedRef.current += (Date.now() - lastTickRef.current) / 1000;
      lastTickRef.current = Date.now();
    }
    commitWatchSession({
      item,
      progressSeconds: progressRef.current,
      engagedSeconds: engagedRef.current,
      seasonNumber: season,
      episodeNumber: episode,
    });
    void syncWatchSession({
      item,
      progressSeconds: progressRef.current,
      seasonNumber: season,
      episodeNumber: episode,
    });
  }, [item, season, episode, isPlaying]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isPlaying) persistSession();
    }, 5000);
    return () => clearInterval(interval);
  }, [isPlaying, persistSession]);

  // Helper to safely failover to the NEXT DIFFERENT PROVIDER when a provider fails
  const tryNextSource = useCallback(() => {
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }

    if (!streamData?.sources || streamData.sources.length === 0) {
      setIsBuffering(false);
      setSourceError("No available stream servers for this title.");
      return;
    }

    const currentProvider =
      streamData.sources[sourceIndex]?.provider?.name ||
      streamData.sources[sourceIndex]?.provider?.id;

    // Find next index with a different provider
    let nextIndex = sourceIndex + 1;
    while (
      nextIndex < streamData.sources.length &&
      (streamData.sources[nextIndex]?.provider?.name === currentProvider ||
        streamData.sources[nextIndex]?.provider?.id === currentProvider)
    ) {
      nextIndex++;
    }

    // Fallback to simple next index if no different provider exists
    if (nextIndex >= streamData.sources.length && sourceIndex < streamData.sources.length - 1) {
      nextIndex = sourceIndex + 1;
    }

    if (nextIndex < streamData.sources.length) {
      console.warn(`Failing over from '${currentProvider}' (source ${sourceIndex}) to source ${nextIndex}...`);
      setSourceIndex(nextIndex);
    } else {
      setIsBuffering(false);
      setSourceError("All available stream servers failed to load. Try picking a server from Settings.");
    }
  }, [sourceIndex, streamData?.sources]);

  // 2. Initialize HLS & Video playback
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamData || !streamData.sources || !streamData.sources[sourceIndex]) return;

    const currentSource = streamData.sources[sourceIndex];
    const streamUrl = getProxiedStreamUrl(currentSource.url, currentSource.type);

    setIsBuffering(true);

    // Clean up previous instance
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy();
      } catch {}
      hlsRef.current = null;
    }

    const onLoadedMetadata = () => {
      setIsBuffering(false);
      if (video) setDuration(video.duration);
      if (initialResumeRef.current && initialResumeRef.current > 0) {
        video.currentTime = initialResumeRef.current;
        initialResumeRef.current = null;
      }
      video.play().catch(() => setIsPlaying(false));
      onVideoEvent?.("ready", video.currentTime, video.duration);
    };

    const onError = () => {
      // Delay failover slightly to avoid hammering the CDN with rapid retries
      setTimeout(() => tryNextSource(), 1500);
    };

    const isHls = currentSource.url.includes(".m3u8") || currentSource.type === "hls" || currentSource.type === "m3u8";

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });

      hlsRef.current = hls;

      try {
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
      } catch (err) {
        console.warn("HLS loadSource error, trying next source:", err);
        tryNextSource();
        return;
      }

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setIsBuffering(false);
        const levels = hls.levels.map((lvl, index) => ({
          id: index,
          name: lvl.height ? `${lvl.height}p` : `Level ${index + 1}`,
        }));
        setHlsLevels(levels);

        if (initialResumeRef.current && initialResumeRef.current > 0) {
          video.currentTime = initialResumeRef.current;
          initialResumeRef.current = null;
        }

        video.play().catch(() => {
          setIsPlaying(false);
        });
        onVideoEvent?.("ready", video.currentTime, video.duration);
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          console.warn(`HLS Fatal Error: ${data.type}`);
          tryNextSource();
        }
      });
    } else if (isHls && video.canPlayType("application/vnd.apple.mpegurl")) {
      // Safari native HLS
      video.src = streamUrl;
      video.addEventListener("loadedmetadata", onLoadedMetadata);
      video.addEventListener("error", onError);
    } else {
      // Direct MP4 or other native formats (e.g. MovieBox MP4)
      video.src = streamUrl;
      video.addEventListener("loadedmetadata", onLoadedMetadata);
      video.addEventListener("error", onError);
    }

    return () => {
      video.removeEventListener("loadedmetadata", onLoadedMetadata);
      video.removeEventListener("error", onError);
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy();
        } catch {}
        hlsRef.current = null;
      }
    };
  }, [streamData, sourceIndex, tryNextSource]);

  // Video Event Handlers
  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrentTime(video.currentTime);
    progressRef.current = video.currentTime;
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;
    setDuration(video.duration);
    setIsBuffering(false);
    onVideoEvent?.("ready", video.currentTime, video.duration);
  };

  const handlePlay = () => {
    setIsPlaying(true);
    setIsBuffering(false);
    lastTickRef.current = Date.now();
    onVideoEvent?.("play", videoRef.current?.currentTime || 0, videoRef.current?.duration || 0);
  };

  const handlePause = () => {
    setIsPlaying(false);
    persistSession();
    onVideoEvent?.("pause", videoRef.current?.currentTime || 0, videoRef.current?.duration || 0);
  };

  const handleSeeked = () => {
    onVideoEvent?.("seeked", videoRef.current?.currentTime || 0, videoRef.current?.duration || 0);
  };

  const handleWaiting = () => setIsBuffering(true);
  const handlePlaying = () => setIsBuffering(false);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
    } else {
      video.play().catch(() => setIsPlaying(false));
    }
  };

  // Controls Visibility Timer
  const triggerControls = () => {
    setShowControls(true);
    if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    hideControlsTimerRef.current = setTimeout(() => {
      if (isPlaying && !activeMenu) {
        setShowControls(false);
      }
    }, 3500);
  };

  useEffect(() => {
    triggerControls();
    return () => {
      if (hideControlsTimerRef.current) clearTimeout(hideControlsTimerRef.current);
    };
  }, [isPlaying, activeMenu]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const video = videoRef.current;
      if (!video) return;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        video.currentTime = Math.max(0, video.currentTime - 10);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        video.currentTime = Math.min(video.duration, video.currentTime + 10);
      } else if (e.code === "KeyF") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === "KeyM") {
        e.preventDefault();
        toggleMute();
      }
      triggerControls();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying]);

  // Volume Changes
  const handleVolumeChange = (newVol: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = newVol;
    setVolume(newVol);
    setIsMuted(newVol === 0);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isMuted) {
      video.muted = false;
      setIsMuted(false);
      if (volume === 0) {
        setVolume(1);
        video.volume = 1;
      }
    } else {
      video.muted = true;
      setIsMuted(true);
    }
  };

  // Seek
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const video = videoRef.current;
    if (!video) return;
    const targetTime = Number(e.target.value);
    video.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const skipSeconds = (sec: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.min(Math.max(0, video.currentTime + sec), video.duration || 0);
  };

  // Fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    const video = videoRef.current;
    
    // Check if we are currently in any fullscreen mode
    const isCurrentlyFullscreen = 
      document.fullscreenElement || 
      (document as any).webkitFullscreenElement;

    if (!isCurrentlyFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
      } else if ((containerRef.current as any).webkitRequestFullscreen) {
        (containerRef.current as any).webkitRequestFullscreen();
        setIsFullscreen(true);
      } else if (video && (video as any).webkitEnterFullscreen) {
        (video as any).webkitEnterFullscreen();
        setIsFullscreen(true);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  // Picture in Picture
  const togglePiP = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Speed
  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setActiveMenu(null);
  };

  // Quality level selection
  const handleQualityChange = (levelIndex: number) => {
    setSelectedQuality(levelIndex);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelIndex;
    }
    setActiveMenu(null);
  };

  // Server/Provider Selection
  const handleSourceChange = (idx: number) => {
    setSourceIndex(idx);
    setActiveMenu(null);
  };

  // Subtitle Selection
  const handleSubtitleChange = (index: number) => {
    setSelectedSubtitle(index);
    setActiveMenu(null);
  };

  const currentSourceInfo = streamData?.sources[sourceIndex];
  const downloadSource = useMemo(() => {
    const sources = streamData?.sources ?? [];
    if (!sources.length) return null;

    const directSource = sources.find((source) => {
      const type = source.type?.toLowerCase() ?? "";
      const url = source.url.toLowerCase();
      return type !== "hls" && type !== "m3u8" && !url.includes(".m3u8");
    });

    return directSource ?? currentSourceInfo ?? sources[0];
  }, [currentSourceInfo, streamData?.sources]);
  const activeIntroSegment = useMemo(
    () => findActiveSegment(introDbSegments?.intro ?? [], currentTime, duration),
    [currentTime, duration, introDbSegments?.intro],
  );
  const activeCreditsSegment = useMemo(
    () => findActiveSegment(introDbSegments?.credits ?? [], currentTime, duration),
    [currentTime, duration, introDbSegments?.credits],
  );
  const movieRecommendations = useMemo(
    () => recommendations.filter((recommendation) => recommendation.mediaType === "movie").slice(0, 8),
    [recommendations],
  );
  const rawSubUrl = selectedSubtitle >= 0 ? vttTracks[selectedSubtitle]?.url : null;
  const activeSubtitleUrl = rawSubUrl ? getProxiedSubtitleUrl(rawSubUrl) : null;

  const handleDownload = useCallback(() => {
    if (!downloadSource || typeof document === "undefined") return;

    const link = document.createElement("a");
    link.href = downloadSource.url;
    link.download = getDownloadFileName(
      item,
      mediaType,
      season,
      episode,
      downloadSource.url,
    );
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [downloadSource, episode, item, mediaType, season]);

  const handleSkipIntro = useCallback(() => {
    if (!activeIntroSegment?.endMs || !videoRef.current) return;

    const nextTime = activeIntroSegment.endMs / 1000;
    videoRef.current.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, [activeIntroSegment]);

  const handleCreditsAction = useCallback(() => {
    if (mediaType === "tv" && nextHref) {
      router.push(nextHref);
      return;
    }

    if (mediaType !== "movie" || !videoRef.current || !activeCreditsSegment) return;

    const resolvedEndTime =
      activeCreditsSegment.endMs != null
        ? activeCreditsSegment.endMs / 1000
        : Math.max(duration - 0.5, currentTime);

    videoRef.current.currentTime = resolvedEndTime;
    videoRef.current.pause();
    setCurrentTime(resolvedEndTime);
    setHasSkippedMovieCredits(true);
    setShowMovieRecommendations(true);
  }, [activeCreditsSegment, currentTime, duration, mediaType, nextHref, router]);

  const showSkipIntroCta = Boolean(activeIntroSegment?.endMs) && !showMovieRecommendations;
  const showCreditsCta =
    Boolean(activeCreditsSegment) &&
    !showMovieRecommendations &&
    (mediaType === "movie" ? !hasSkippedMovieCredits : Boolean(nextHref));

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden select-none font-sans group"
      onMouseMove={triggerControls}
      onClick={() => {
        setActiveMenu(null);
        setShowEpisodesPopover(false);
      }}
    >
      {/* Video Element — loaded in no-cors mode (no crossOrigin attr) so CDN
          hotlink protection doesn't block playback. */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain cursor-pointer"
        onClick={(e) => {
          e.stopPropagation();
          togglePlay();
          triggerControls();
        }}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={handlePlay}
        onPause={handlePause}
        onWaiting={handleWaiting}
        onPlaying={handlePlaying}
        onEnded={persistSession}
        onSeeked={handleSeeked}
        playsInline
      />

      {/* Render Custom VTT Subtitles Overlay */}
      <CustomSubtitlesOverlay url={activeSubtitleUrl} currentTime={currentTime} />

      {/* Loading / Error Overlay */}
      {(loadingSources || sourceError || isBuffering) && (
        <div className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-xs pointer-events-none z-20">
          {loadingSources ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="size-12 animate-spin text-white/80" />
              <p className="text-sm font-medium text-white/70">Resolving sources...</p>
            </div>
          ) : sourceError ? (
            <div className="flex flex-col items-center gap-4 max-w-md text-center p-6 bg-black/80 rounded-2xl border border-white/10 pointer-events-auto">
              <AlertCircle className="size-12 text-red-500" />
              <div>
                <h3 className="text-lg font-bold text-white mb-1">Stream Unavailable</h3>
                <p className="text-sm text-white/60">{sourceError}</p>
              </div>
              <button
                onClick={() => {
                  setSourceIndex(0);
                  setLoadingSources(true);
                  setSourceError(null);
                  fetchStreamSources(mediaType, mediaId, season, episode, true)
                    .then((data) => {
                      setStreamData(data);
                      if (!data.sources.length) setSourceError("No valid stream source found.");
                    })
                    .finally(() => setLoadingSources(false));
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-white text-black font-bold rounded-full hover:bg-white/90 transition text-sm cursor-pointer"
              >
                <RefreshCw className="size-4" /> Try Again
              </button>
            </div>
          ) : isBuffering ? (
            <div className="w-16 h-16 rounded-full border-4 border-white/20 border-t-white animate-spin" />
          ) : null}
        </div>
      )}

      {(showSkipIntroCta || showCreditsCta) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-40 flex justify-end px-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (showSkipIntroCta) {
                handleSkipIntro();
              } else {
                handleCreditsAction();
              }
            }}
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/80 px-5 py-3 text-sm font-semibold text-white shadow-2xl backdrop-blur-md transition hover:bg-black/90 cursor-pointer"
          >
            <span>
              {showSkipIntroCta
                ? "Skip Intro"
                : mediaType === "tv"
                  ? "Next Episode"
                  : "Skip Credits"}
            </span>
            {showCreditsCta && mediaType === "tv" ? (
              <ChevronRight className="size-4" />
            ) : null}
          </button>
        </div>
      )}

      {showMovieRecommendations && mediaType === "movie" && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setShowMovieRecommendations(false)}
        >
          <div
            className="relative w-full max-w-5xl rounded-3xl border border-white/10 bg-neutral-950/95 p-6 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowMovieRecommendations(false)}
              className="absolute right-4 top-4 rounded-full p-2 text-white/60 transition hover:bg-white/10 hover:text-white cursor-pointer"
              title="Close"
            >
              <X className="size-5" />
            </button>

            <div className="mb-6 pr-10">
              <h2 className="text-2xl font-black tracking-tight">Similar movies to watch</h2>
              <p className="mt-1 text-sm text-white/55">
                Pick something with a similar vibe and keep the night going.
              </p>
            </div>

            {movieRecommendations.length > 0 ? (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {movieRecommendations.map((recommendation) => (
                  <Link
                    key={`${recommendation.mediaType}-${recommendation.id}`}
                    href={watchHref(recommendation)}
                    className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition hover:border-white/25 hover:bg-white/[0.05]"
                  >
                    <div className="relative aspect-[16/9] w-full overflow-hidden bg-neutral-900">
                      {recommendation.backdropPath || recommendation.posterPath ? (
                        <img
                          src={tmdbImage(recommendation.backdropPath || recommendation.posterPath, "w780")}
                          alt={recommendation.title}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center bg-neutral-950">
                          <Film className="size-6 text-white/20" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-1 p-3">
                      <div className="line-clamp-1 text-sm font-bold text-white">
                        {recommendation.title}
                      </div>
                      <div className="text-xs font-medium text-white/45">
                        {recommendation.year || "Movie"}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] px-6 py-12 text-center text-sm text-white/50">
                No similar movies are available right now.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Top Header Overlay */}
      <div
        className={`absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-6 bg-gradient-to-b from-black/90 via-black/40 to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: Back Arrow & Title */}
        <div className="flex items-center gap-4 text-white">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-full hover:bg-white/10 text-white/90 hover:text-white transition cursor-pointer"
            aria-label="Back"
          >
            <ArrowLeft className="size-8" />
          </button>
          <div className="flex flex-col">
            <h1 className="text-lg md:text-xl font-bold tracking-wide drop-shadow-md">
              {item.title}
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-xs md:text-sm text-white/60 font-semibold tracking-wider drop-shadow">
                {mediaType === "movie"
                  ? "Movie"
                  : `Season ${season}, Ep. ${episode}`}
              </p>
              {(currentSourceInfo?.size || fileSizeRange) ? (
                <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-[10px] font-bold text-blue-400 border border-blue-500/30">
                  {currentSourceInfo?.size || fileSizeRange}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center">
          <button
            onClick={handleDownload}
            disabled={!downloadSource}
            className={`flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition ${
              downloadSource
                ? "border-white/15 bg-white/10 text-white/90 hover:bg-white/15 hover:text-white cursor-pointer"
                : "border-white/10 bg-white/5 text-white/35 cursor-not-allowed"
            }`}
            title={downloadSource ? "Download" : "No download source available"}
          >
            <Download className="size-4" />
            <span className="hidden sm:inline">Download</span>
          </button>
        </div>
      </div>

      {/* Popover Menus (Subtitles / Settings / Quality / Speed / Servers) */}
      {activeMenu && (
        <div
          className="absolute bottom-24 right-8 z-40 w-64 bg-black/95 border border-white/10 rounded-2xl p-4 backdrop-blur-xl shadow-2xl text-white text-sm animate-in fade-in slide-in-from-bottom-4 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {activeMenu === "settings" && (
            <div className="space-y-1">
              <div className="text-xs font-bold text-white/40 uppercase px-2 mb-2">Settings</div>
              
              <button
                onClick={() => setActiveMenu("quality")}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/10 transition text-left cursor-pointer"
              >
                <span>Quality</span>
                <span className="text-xs text-white/50 flex items-center gap-1">
                  {hlsLevels.length > 0 
                    ? (selectedQuality === -1 ? "Auto" : hlsLevels[selectedQuality]?.name || "Auto") 
                    : (currentSourceInfo?.quality || currentSourceInfo?.provider?.name || `Server ${sourceIndex + 1}`)}
                  <ChevronRight className="size-4" />
                </span>
              </button>

              <button
                onClick={() => setActiveMenu("speed")}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/10 transition text-left cursor-pointer"
              >
                <span>Playback Speed</span>
                <span className="text-xs text-white/50 flex items-center gap-1">
                  {playbackSpeed}x
                  <ChevronRight className="size-4" />
                </span>
              </button>

              <button
                onClick={() => setActiveMenu("subtitles")}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/10 transition text-left cursor-pointer"
              >
                <span>Subtitles</span>
                <span className="text-xs text-white/50 flex items-center gap-1">
                  {selectedSubtitle === -1 ? "Off" : vttTracks[selectedSubtitle]?.label || "On"}
                  <ChevronRight className="size-4" />
                </span>
              </button>
            </div>
          )}



          {activeMenu === "subtitles" && (
            <div>
              <div className="flex items-center justify-between mb-2 px-2">
                <span className="text-xs font-bold text-white/40 uppercase">Subtitles</span>
                <button
                  onClick={() => setActiveMenu("settings")}
                  className="text-xs text-white/60 hover:text-white cursor-pointer"
                >
                  Back
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                <button
                  onClick={() => handleSubtitleChange(-1)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/10 text-left transition cursor-pointer"
                >
                  <span>Off</span>
                  {selectedSubtitle === -1 && <Check className="size-4 text-white" />}
                </button>
                {vttTracks.map((sub, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSubtitleChange(idx)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/10 text-left transition cursor-pointer"
                  >
                    <span>{sub.label}</span>
                    {selectedSubtitle === idx && <Check className="size-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeMenu === "quality" && (
            <div>
              <div className="flex items-center justify-between mb-2 px-2">
                <span className="text-xs font-bold text-white/40 uppercase">Quality</span>
                <button
                  onClick={() => setActiveMenu("settings")}
                  className="text-xs text-white/60 hover:text-white cursor-pointer"
                >
                  Back
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {hlsLevels.length > 0 ? (
                  <>
                    <button
                      onClick={() => handleQualityChange(-1)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/10 text-left transition cursor-pointer"
                    >
                      <span>Auto</span>
                      {selectedQuality === -1 && <Check className="size-4 text-white" />}
                    </button>
                    {hlsLevels.map((lvl) => (
                      <button
                        key={lvl.id}
                        onClick={() => handleQualityChange(lvl.id)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/10 text-left transition cursor-pointer"
                      >
                        <span>{lvl.name}</span>
                        {selectedQuality === lvl.id && <Check className="size-4 text-white" />}
                      </button>
                    ))}
                  </>
                ) : (
                  streamData?.sources.map((src, idx) => {
                    const isMovieBox = src.provider?.id === "moviebox";
                    const label = isMovieBox ? (src.quality || "Default") : `${src.provider?.name || `Server ${idx + 1}`} (${src.quality || "HLS"})`;
                    return (
                      <button
                        key={`src-${idx}`}
                        onClick={() => handleSourceChange(idx)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/10 text-left transition cursor-pointer"
                      >
                        <span className="truncate">{label}</span>
                        {sourceIndex === idx && <Check className="size-4 text-white shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {activeMenu === "speed" && (
            <div>
              <div className="flex items-center justify-between mb-2 px-2">
                <span className="text-xs font-bold text-white/40 uppercase">Speed</span>
                <button
                  onClick={() => setActiveMenu("settings")}
                  className="text-xs text-white/60 hover:text-white cursor-pointer"
                >
                  Back
                </button>
              </div>
              <div className="space-y-1">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSpeedChange(s)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/10 text-left transition cursor-pointer"
                  >
                    <span>{s === 1 ? "Normal (1x)" : `${s}x`}</span>
                    {playbackSpeed === s && <Check className="size-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom Bar Overlay (Netflix Style) */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-30 p-6 bg-gradient-to-t from-black/95 via-black/45 to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress Track Bar Row */}
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1 group/track flex items-center h-4 cursor-pointer">
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.1"
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1 group-hover/track:h-2 bg-white/20 appearance-none rounded-lg cursor-pointer accent-white transition-all z-10"
              style={{
                background: `linear-gradient(to right, #ffffff ${(currentTime / (duration || 1)) * 100}%, rgba(255,255,255,0.2) ${(currentTime / (duration || 1)) * 100}%)`,
              }}
            />
          </div>
          <span className="text-sm font-semibold tracking-wider text-white/90 tabular-nums shrink-0">
            {formatTime(duration - currentTime)}
          </span>
        </div>

        {/* Controls Button Row */}
        <div className="flex items-center justify-between">
          {/* Left Buttons Group */}
          <div className="flex items-center gap-2 sm:gap-4 md:gap-6">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="text-white/90 hover:text-white transition hover:scale-110 active:scale-95 cursor-pointer"
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="size-6 fill-current" />
              ) : (
                <Play className="size-6 fill-current" />
              )}
            </button>

            {/* Rewind 10s */}
            <button
              onClick={() => skipSeconds(-10)}
              className="text-white/90 hover:text-white transition hover:scale-110 active:scale-95 cursor-pointer"
              title="Rewind 10s"
            >
              <div className="relative flex items-center justify-center">
                <RotateCcw className="size-6" />
                <span className="absolute text-[8px] font-black top-[55%] -translate-y-1/2">10</span>
              </div>
            </button>

            {/* Forward 10s */}
            <button
              onClick={() => skipSeconds(10)}
              className="text-white/90 hover:text-white transition hover:scale-110 active:scale-95 cursor-pointer"
              title="Forward 10s"
            >
              <div className="relative flex items-center justify-center">
                <RotateCw className="size-6" />
                <span className="absolute text-[8px] font-black top-[55%] -translate-y-1/2">10</span>
              </div>
            </button>

            {/* Volume Control - Vertical Expand */}
            <div className="relative group/vol flex flex-col items-center">
              <div className="absolute bottom-full mb-2 hidden group-hover/vol:flex flex-col items-center bg-black/95 border border-white/10 rounded-xl p-3 h-28 justify-center shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-200 z-50">
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(Number(e.target.value))}
                  className="h-20 w-1 bg-white/20 appearance-none rounded-lg cursor-pointer accent-white"
                  style={{
                    writingMode: "vertical-lr",
                    direction: "rtl",
                  }}
                />
              </div>
              <button
                onClick={toggleMute}
                className="text-white/90 hover:text-white transition hover:scale-110 active:scale-95 cursor-pointer"
                title="Volume"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="size-6" />
                ) : (
                  <Volume2 className="size-6" />
                )}
              </button>
            </div>
          </div>

          {/* Right Buttons Group */}
          <div className="flex items-center gap-2 sm:gap-4 md:gap-6">
            {/* Details Modal Trigger */}
            <button
              onClick={() => setShowDetailsModal(true)}
              className="text-white/90 hover:text-white transition hover:scale-110 cursor-pointer"
              title="Info"
            >
              <Info className="size-6" />
            </button>

            {/* TV Show Seasons & Episodes Popover */}
            {mediaType === "tv" && (
              <div className="relative group/episodes flex items-center h-full">
                {/* Popover */}
                <div
                  className={`absolute bottom-full right-0 mb-0.5 ${showEpisodesPopover ? "flex" : "hidden"} md:group-hover/episodes:flex flex-col bg-neutral-950/95 border border-white/10 rounded-2xl w-80 max-h-96 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200 backdrop-blur-md p-4 gap-3 text-white`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-xs font-bold text-white/50 uppercase tracking-wider">Episodes</span>
                    {seasons.length > 0 && (
                      <select
                        value={selectedSeasonForEpisodes}
                        onChange={(e) => {
                          const sNum = Number(e.target.value);
                          setSelectedSeasonForEpisodes(sNum);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="bg-neutral-900 border border-white/10 rounded-lg px-2 py-1 text-xs font-bold text-white focus:outline-none cursor-pointer"
                      >
                        {seasons.map((s) => (
                          <option key={s.id} value={s.seasonNumber}>
                            Season {s.seasonNumber}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto pr-1 space-y-1.5 scrollbar-thin scrollbar-thumb-white/10 max-h-72 min-h-0">
                    {loadingEpisodes ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="size-5 animate-spin text-white/60" />
                      </div>
                    ) : (episodesMap[selectedSeasonForEpisodes] || []).length > 0 ? (
                      (episodesMap[selectedSeasonForEpisodes] || []).map((ep) => {
                        const isCurrent = ep.seasonNumber === season && ep.episodeNumber === episode;
                        return (
                          <button
                            key={ep.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowEpisodesPopover(false);
                              const nextUrl = `/watch/tv/${mediaId}?s=${ep.seasonNumber}&e=${ep.episodeNumber}`;
                              router.push(nextUrl);
                            }}
                            className={`w-full flex items-start gap-3 text-left p-2 rounded-xl transition cursor-pointer border ${
                              isCurrent
                                ? "bg-white text-black border-white"
                                : "bg-white/5 text-white border-transparent hover:bg-white/10"
                            }`}
                          >
                            {/* Episode Thumbnail */}
                            <div className="relative w-20 aspect-video rounded-lg overflow-hidden bg-neutral-900 shrink-0 border border-white/5">
                              {ep.stillPath ? (
                                <img
                                  src={tmdbImage(ep.stillPath, "w300")}
                                  className="object-cover w-full h-full"
                                  alt=""
                                />
                              ) : (
                                <div className="w-full h-full bg-neutral-950 flex items-center justify-center">
                                  <Film className="size-4 text-white/20" />
                                </div>
                              )}
                            </div>

                            {/* Episode Info */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 font-bold text-xs">
                                <span>E{ep.episodeNumber}</span>
                                <span className="truncate max-w-[130px] opacity-80">{ep.name}</span>
                              </div>
                              {ep.overview && (
                                <p className={`text-[9px] line-clamp-2 mt-0.5 ${isCurrent ? "text-black/60" : "text-white/40"}`}>
                                  {ep.overview}
                                </p>
                              )}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="text-center text-xs text-white/40 py-8">No episodes found.</div>
                    )}
                  </div>
                </div>

                {/* Episode Button with ListVideo Icon */}
                <button
                  className={`transition hover:scale-110 cursor-pointer p-1 rounded-md ${
                    showEpisodesPopover ? "text-white bg-white/20" : "text-white/90 hover:text-white"
                  }`}
                  title="Episodes"
                  aria-expanded={showEpisodesPopover}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowEpisodesPopover((prev) => !prev);
                  }}
                >
                  <ListVideo className="size-6" />
                </button>
              </div>
            )}

            {/* Subtitles Menu Trigger */}
            <button
              onClick={() => setActiveMenu(activeMenu === "subtitles" ? null : "subtitles")}
              className={`p-1 rounded-md transition hover:scale-110 cursor-pointer ${
                activeMenu === "subtitles" || selectedSubtitle !== -1 ? "text-white bg-white/20" : "text-white/80 hover:text-white"
              }`}
              title="Subtitles"
            >
              <Captions className="size-6" />
            </button>

            {/* Settings Menu Trigger */}
            <button
              onClick={() => setActiveMenu(activeMenu === "settings" ? null : "settings")}
              className={`p-1 rounded-md transition hover:scale-110 cursor-pointer ${
                activeMenu === "settings" ? "text-white bg-white/20" : "text-white/80 hover:text-white"
              }`}
              title="Settings"
            >
              <Settings className="size-6" />
            </button>

            {/* PiP */}
            <button
              onClick={togglePiP}
              className="text-white/90 hover:text-white transition hover:scale-110 cursor-pointer"
              title="Picture in Picture"
            >
              <PictureInPicture2 className="size-6" />
            </button>

            {/* Watch Party Toggle (visible only in Watch Party mode) */}
            {isWatchParty && (
              <button
                onClick={onWatchPartyToggle}
                className={`p-1 rounded-md transition hover:scale-110 cursor-pointer ${
                  showWatchPartyActive ? "text-white bg-white/20" : "text-white/80 hover:text-white"
                }`}
                title="Watch Party Details"
              >
                <Users className="size-6" />
              </button>
            )}

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="text-white/90 hover:text-white transition hover:scale-110 cursor-pointer"
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize className="size-6" /> : <Maximize className="size-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Media Details Info Modal */}
      {showDetailsModal && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setShowDetailsModal(false)}
        >
          <div
            className="relative max-w-lg w-full bg-neutral-900 border border-white/10 rounded-2xl p-6 shadow-2xl text-white animate-in fade-in zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={() => setShowDetailsModal(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition cursor-pointer"
              title="Close"
            >
              <X className="size-5" />
            </button>
            {item.backdropPath && (
              <div className="relative w-full h-44 rounded-xl overflow-hidden mb-4 bg-neutral-950">
                <img
                  src={`https://image.tmdb.org/t/p/w500${item.backdropPath}`}
                  className="object-cover w-full h-full opacity-60"
                  alt=""
                />
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-900 via-transparent to-transparent" />
              </div>
            )}
            <h2 className="text-2xl font-black mb-1 leading-snug">{item.title}</h2>
            <div className="flex items-center gap-3 text-xs text-white/50 font-bold mb-4 uppercase tracking-wider">
              <span>{mediaType === "movie" ? "Movie" : `Season ${season}, Ep. ${episode}`}</span>
              {item.year && <span>• {item.year}</span>}
              {item.voteAverage && (
                <span className="flex items-center gap-1">
                  • ⭐ {item.voteAverage.toFixed(1)}
                </span>
              )}
            </div>
            <p className="text-sm text-white/80 leading-relaxed max-h-48 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/20">
              {item.overview || "No details available for this title."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
});
