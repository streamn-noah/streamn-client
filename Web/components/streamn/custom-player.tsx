"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import Hls from "hls.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Captions,
  Check,
  ChevronRight,
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
} from "lucide-react";
import type { MediaSummary, MediaType } from "@/lib/media";
import {
  fetchStreamSources,
  getCachedStreamSources,
  type SourceItem,
  type StreamBackendResponse,
  type SubtitleItem,
} from "@/lib/stream-source";
import { commitWatchSession, getWatchProgress } from "@/lib/streamn-storage";
import { syncWatchSession } from "@/lib/user-actions";

type CustomPlayerProps = {
  mediaType: MediaType;
  mediaId: number;
  season: number;
  episode: number;
  item: MediaSummary;
  nextHref?: string | null;
};

// VTT Parser & Subtitle Cue Utility
type VTTCue = { start: number; end: number; text: string };

function parseVTTTime(timeStr: string): number {
  const parts = timeStr.split(":");
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

function getProxiedStreamUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  return rawUrl.replace(/(https?:\/\/[^\/]+)\/\/+/g, "$1/");
}

export function CustomPlayer({
  mediaType,
  mediaId,
  season,
  episode,
  item,
  nextHref,
}: CustomPlayerProps) {
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

  // Menus
  const [activeMenu, setActiveMenu] = useState<
    "settings" | "subtitles" | "audio" | "quality" | "speed" | "servers" | null
  >(null);
  const [selectedSubtitle, setSelectedSubtitle] = useState<number>(-1); // -1 = off
  const [selectedQuality, setSelectedQuality] = useState<number>(-1); // -1 = Auto
  const [hlsLevels, setHlsLevels] = useState<{ id: number; name: string }[]>([]);

  // Subtitle track state
  const [vttTracks, setVttTracks] = useState<SubtitleItem[]>([]);

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
      setVttTracks(cached.subtitles || []);
      setLoadingSources(false);
      return;
    }

    fetchStreamSources(mediaType, mediaId, season, episode)
      .then((data) => {
        if (!active) return;
        setStreamData(data);
        setVttTracks(data.subtitles || []);
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
    const streamUrl = getProxiedStreamUrl(currentSource.url);

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
    };

    const onError = () => {
      tryNextSource();
    };

    const isHls = streamUrl.includes(".m3u8") || currentSource.type === "hls" || currentSource.type === "m3u8";

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
  };

  const handlePlay = () => {
    setIsPlaying(true);
    setIsBuffering(false);
    lastTickRef.current = Date.now();
  };

  const handlePause = () => {
    setIsPlaying(false);
    persistSession();
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
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
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
  const rawSubUrl = selectedSubtitle >= 0 ? vttTracks[selectedSubtitle]?.url : null;
  const activeSubtitleUrl = rawSubUrl ? getProxiedStreamUrl(rawSubUrl) : null;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-screen bg-black overflow-hidden select-none font-sans group"
      onMouseMove={triggerControls}
      onClick={() => setActiveMenu(null)}
    >
      {/* Video Element */}
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
        crossOrigin="anonymous"
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

      {/* Top Header Overlay */}
      <div
        className={`absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-6 bg-gradient-to-b from-black/90 via-black/40 to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: Back Arrow */}
        <button
          onClick={() => router.back()}
          className="p-2 rounded-full hover:bg-white/10 text-white/90 hover:text-white transition"
          aria-label="Back"
        >
          <ArrowLeft className="size-6" />
        </button>

        {/* Center: Title & Subtitle */}
        <div className="flex flex-col items-center text-center px-4 max-w-xl truncate">
          <h1 className="text-base md:text-lg font-bold text-white truncate drop-shadow-md">
            {item.title}
          </h1>
          <p className="text-xs md:text-sm text-white/70 font-medium truncate drop-shadow">
            {mediaType === "movie"
              ? "Movie"
              : `Season ${season}, Ep. ${episode}`}
          </p>
        </div>

        {/* Right Action Icons (Matching Screenshot) */}
        <div className="flex items-center gap-2 md:gap-4 text-white/90">
          {/* PiP */}
          <button
            onClick={togglePiP}
            className="p-2 rounded-full hover:bg-white/10 hover:text-white transition"
            title="Picture in Picture"
          >
            <PictureInPicture2 className="size-5" />
          </button>

          {/* Subtitles Menu Trigger */}
          <button
            onClick={() => setActiveMenu(activeMenu === "subtitles" ? null : "subtitles")}
            className={`p-2 rounded-full hover:bg-white/10 transition ${
              activeMenu === "subtitles" || selectedSubtitle !== -1 ? "text-white bg-white/20" : "text-white/80"
            }`}
            title="Subtitles"
          >
            <Captions className="size-5" />
          </button>

          {/* Settings Menu Trigger */}
          <button
            onClick={() => setActiveMenu(activeMenu === "settings" ? null : "settings")}
            className={`p-2 rounded-full hover:bg-white/10 transition ${
              activeMenu === "settings" ? "text-white bg-white/20" : "text-white/80"
            }`}
            title="Settings"
          >
            <Settings className="size-5" />
          </button>

          {/* Volume Control */}
          <div className="relative group/vol flex items-center">
            <button
              onClick={toggleMute}
              className="p-2 rounded-full hover:bg-white/10 hover:text-white transition"
              title="Volume"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="size-5" />
              ) : (
                <Volume2 className="size-5" />
              )}
            </button>
            <div className="w-0 overflow-hidden group-hover/vol:w-20 transition-all duration-300 flex items-center">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="w-16 h-1 bg-white/30 appearance-none rounded-lg cursor-pointer accent-white"
              />
            </div>
          </div>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-full hover:bg-white/10 hover:text-white transition"
            title="Fullscreen"
          >
            {isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </button>

          {/* Close (X) Button */}
          <button
            onClick={() => router.back()}
            className="p-2 rounded-full hover:bg-white/10 hover:text-white transition border-l border-white/20 ml-1 pl-3"
            title="Close"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* Middle Center Playback Controls (Matching Screenshot) */}
      <div
        className={`absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-300 pointer-events-none ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex items-center gap-10 md:gap-16 pointer-events-auto">
          {/* Rewind 10s */}
          <button
            onClick={() => skipSeconds(-10)}
            className="p-3 text-white/90 hover:text-white hover:scale-110 transition active:scale-95"
            title="Rewind 10s"
          >
            <div className="relative flex items-center justify-center">
              <RotateCcw className="size-10 md:size-12" />
              <span className="absolute text-[11px] font-black top-[55%] -translate-y-1/2">10</span>
            </div>
          </button>

          {/* Main Play / Pause Button */}
          <button
            onClick={togglePlay}
            className="p-5 md:p-6 bg-white/15 hover:bg-white/25 text-white rounded-full backdrop-blur-md transition hover:scale-110 active:scale-95 shadow-2xl border border-white/20 cursor-pointer"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="size-8 md:size-10 fill-current" />
            ) : (
              <Play className="size-8 md:size-10 fill-current ml-1" />
            )}
          </button>

          {/* Forward 10s */}
          <button
            onClick={() => skipSeconds(10)}
            className="p-3 text-white/90 hover:text-white hover:scale-110 transition active:scale-95"
            title="Forward 10s"
          >
            <div className="relative flex items-center justify-center">
              <RotateCw className="size-10 md:size-12" />
              <span className="absolute text-[11px] font-black top-[55%] -translate-y-1/2">10</span>
            </div>
          </button>
        </div>
      </div>

      {/* Popover Menus (Subtitles / Settings / Quality / Speed / Servers) */}
      {activeMenu && (
        <div
          className="absolute top-20 right-6 z-40 w-64 bg-black/90 border border-white/15 rounded-2xl p-4 backdrop-blur-xl shadow-2xl text-white text-sm animate-in fade-in zoom-in-95"
          onClick={(e) => e.stopPropagation()}
        >
          {activeMenu === "settings" && (
            <div className="space-y-1">
              <div className="text-xs font-bold text-white/40 uppercase px-2 mb-2">Settings</div>
              
              <button
                onClick={() => setActiveMenu("servers")}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/10 transition text-left"
              >
                <span>Server Source</span>
                <span className="text-xs text-white/50 flex items-center gap-1">
                  {currentSourceInfo?.provider?.name || `Server ${sourceIndex + 1}`}
                  <ChevronRight className="size-4" />
                </span>
              </button>

              <button
                onClick={() => setActiveMenu("quality")}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/10 transition text-left"
              >
                <span>Quality</span>
                <span className="text-xs text-white/50 flex items-center gap-1">
                  {selectedQuality === -1 ? "Auto" : hlsLevels[selectedQuality]?.name || "Auto"}
                  <ChevronRight className="size-4" />
                </span>
              </button>

              <button
                onClick={() => setActiveMenu("speed")}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/10 transition text-left"
              >
                <span>Playback Speed</span>
                <span className="text-xs text-white/50 flex items-center gap-1">
                  {playbackSpeed}x
                  <ChevronRight className="size-4" />
                </span>
              </button>

              <button
                onClick={() => setActiveMenu("subtitles")}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/10 transition text-left"
              >
                <span>Subtitles</span>
                <span className="text-xs text-white/50 flex items-center gap-1">
                  {selectedSubtitle === -1 ? "Off" : vttTracks[selectedSubtitle]?.label || "On"}
                  <ChevronRight className="size-4" />
                </span>
              </button>
            </div>
          )}

          {activeMenu === "servers" && (
            <div>
              <div className="flex items-center justify-between mb-2 px-2">
                <span className="text-xs font-bold text-white/40 uppercase">Select Server</span>
                <button
                  onClick={() => setActiveMenu("settings")}
                  className="text-xs text-white/60 hover:text-white"
                >
                  Back
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {streamData?.sources.map((src, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSourceChange(idx)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/10 text-left transition"
                  >
                    <span className="truncate">{src.provider?.name || `Server ${idx + 1}`} ({src.quality || "HLS"})</span>
                    {sourceIndex === idx && <Check className="size-4 text-white shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeMenu === "subtitles" && (
            <div>
              <div className="flex items-center justify-between mb-2 px-2">
                <span className="text-xs font-bold text-white/40 uppercase">Subtitles</span>
                <button
                  onClick={() => setActiveMenu("settings")}
                  className="text-xs text-white/60 hover:text-white"
                >
                  Back
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
                <button
                  onClick={() => handleSubtitleChange(-1)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/10 text-left transition"
                >
                  <span>Off</span>
                  {selectedSubtitle === -1 && <Check className="size-4 text-white" />}
                </button>
                {vttTracks.map((sub, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSubtitleChange(idx)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/10 text-left transition"
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
                  className="text-xs text-white/60 hover:text-white"
                >
                  Back
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                <button
                  onClick={() => handleQualityChange(-1)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/10 text-left transition"
                >
                  <span>Auto</span>
                  {selectedQuality === -1 && <Check className="size-4 text-white" />}
                </button>
                {hlsLevels.map((lvl) => (
                  <button
                    key={lvl.id}
                    onClick={() => handleQualityChange(lvl.id)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/10 text-left transition"
                  >
                    <span>{lvl.name}</span>
                    {selectedQuality === lvl.id && <Check className="size-4 text-white" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeMenu === "speed" && (
            <div>
              <div className="flex items-center justify-between mb-2 px-2">
                <span className="text-xs font-bold text-white/40 uppercase">Speed</span>
                <button
                  onClick={() => setActiveMenu("settings")}
                  className="text-xs text-white/60 hover:text-white"
                >
                  Back
                </button>
              </div>
              <div className="space-y-1">
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSpeedChange(s)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/10 text-left transition"
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

      {/* Bottom Bar Overlay (Matching Screenshot) */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-30 p-6 bg-gradient-to-t from-black/90 via-black/40 to-transparent transition-opacity duration-300 ${
          showControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress Track Bar */}
        <div className="relative group/track flex items-center h-4 cursor-pointer mb-2">
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

        {/* Bottom Row Details & Next Episode */}
        <div className="flex items-center justify-between text-xs md:text-sm font-semibold text-white/90">
          {/* Time text e.g. 03:22 / 12:37 */}
          <div className="tracking-wider">
            <span>{formatTime(currentTime)}</span>
            <span className="mx-1 text-white/50">/</span>
            <span className="text-white/60">{formatTime(duration)}</span>
          </div>

          {/* Next Episode Button */}
          {nextHref && mediaType === "tv" && (
            <Link
              href={nextHref}
              className="flex items-center gap-1 text-white/80 hover:text-white transition hover:translate-x-1"
            >
              <span>Next Episode</span>
              <ChevronRight className="size-4" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
