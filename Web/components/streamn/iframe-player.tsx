"use client";

import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  Loader2,
  Maximize,
  Minimize,
  Server,
  X,
  Play,
  Pause,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { MediaSummary, MediaType } from "@/lib/media";
import { cinesrcUrl } from "@/lib/media";
import { commitWatchSession, getWatchProgress } from "@/lib/streamn-storage";
import { syncWatchSession } from "@/lib/user-actions";

export type StreamProviderType = "backend" | "cinesrc";

export type IframePlayerHandle = {
  postCommand: (func: string, args?: unknown[]) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getIsPlaying: () => boolean;
};

type IframePlayerProps = {
  mediaType: MediaType;
  mediaId: number;
  season: number;
  episode: number;
  item: MediaSummary;
  nextHref?: string | null;
  onSwitchToBackend?: () => void;
  initialProvider?: StreamProviderType;
  hideNativeControls?: boolean;
  onReady?: () => void;
  onClose?: () => void;
  onVideoEvent?: (type: string, current: number, duration: number) => void;
};

export const IframePlayer = forwardRef<IframePlayerHandle, IframePlayerProps>(
  function IframePlayer(props, ref) {
    const {
      mediaType,
      mediaId,
      season,
      episode,
      item,
      nextHref,
      onSwitchToBackend,
      initialProvider = "cinesrc",
      hideNativeControls = false,
      onReady,
      onClose,
      onVideoEvent,
    } = props;
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [provider, setProvider] = useState<StreamProviderType>(initialProvider);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [showAutoplay, setShowAutoplay] = useState(false);

  // Custom video control states for CineSrc
  const [isPlaying, setIsPlaying] = useState(true);
  const [isBuffering, setIsBuffering] = useState(true);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    setIsMuted(newVol === 0);
    postCineSrcCommand("volume", [newVol]);
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (nextMuted) {
      postCineSrcCommand("mute", []);
    } else {
      postCineSrcCommand("volume", [volume > 0 ? volume : 1]);
    }
  };

  // Watch session tracking
  const progressRef = useRef(0);
  const durationRef = useRef(0);
  const engagedRef = useRef(0);
  const lastTickRef = useRef(Date.now());

  // Get initial start time if saved
  const [startTime, setStartTime] = useState<number | undefined>(undefined);
  useEffect(() => {
    const saved = getWatchProgress(mediaType, mediaId);
    if (
      saved &&
      saved.mediaType === mediaType &&
      saved.id === mediaId &&
      (mediaType === "movie" ||
        (saved.seasonNumber === season && saved.episodeNumber === episode))
    ) {
      if (saved.progressSeconds > 10) {
        setStartTime(saved.progressSeconds);
      }
    }
  }, [mediaType, mediaId, season, episode]);

  const persistSession = useCallback(() => {
    if (progressRef.current <= 0) return;
    engagedRef.current += (Date.now() - lastTickRef.current) / 1000;
    lastTickRef.current = Date.now();

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
  }, [item, season, episode]);

  // Periodic watch session sync
  useEffect(() => {
    const interval = setInterval(() => {
      persistSession();
    }, 5000);
    return () => clearInterval(interval);
  }, [persistSession]);

  // CineSrc postMessage Event Tracking Listener
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin || "";

      // Check CineSrc origin
      const isCineSrc = origin.includes("cinesrc.st") || origin.includes("cinesrc.net");

      if (!isCineSrc) return;

      const payload = event.data;
      if (!payload || typeof payload !== "object") return;

      const type = payload.type;
      
      if (type === "cinesrc:timeupdate" || type === "cinesrc:seeking" || type === "cinesrc:seeked") {
        const current = payload.currentTime || 0;
        const dur = payload.duration || 0;

        if (current > 0) progressRef.current = current;
        if (dur > 0) durationRef.current = dur;

        setIsBuffering(false);
        persistSession();
        if (onReady) onReady();
        if (onVideoEvent) onVideoEvent(type.split(":")[1], current, dur);
      } else if (type === "cinesrc:play") {
        setIsPlaying(true);
        setIsBuffering(false);
        persistSession();
        if (onReady) onReady();
        if (onVideoEvent) onVideoEvent("play", progressRef.current, durationRef.current);
      } else if (type === "cinesrc:pause") {
        setIsPlaying(false);
        persistSession();
        if (onVideoEvent) onVideoEvent("pause", progressRef.current, durationRef.current);
      } else if (type === "cinesrc:ended") {
        persistSession();
        if (mediaType === "tv" && nextHref) {
          setShowAutoplay(true);
        }
      } else if (type === "cinesrc:close") {
        persistSession();
        if (onClose) onClose();
        else router.back();
      } else if (type === "cinesrc:ready" || type === "cinesrc:loadedmetadata") {
        setIsBuffering(false);
        if (onVideoEvent) onVideoEvent("ready", progressRef.current, durationRef.current);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [mediaType, nextHref, persistSession, router, onReady, onClose]);

  // Auto-pause and persist progress when user exits native fullscreen
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
        postCineSrcCommand("pause");
        setIsPlaying(false);
        persistSession();
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [persistSession]);

  // Post commands to CineSrc iframe using official API
  const postCineSrcCommand = (func: string, args: unknown[] = []) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;

    try {
      if (func === "seek") {
        win.postMessage({ type: "cinesrc:command", command: "seek", args }, "*");
        win.postMessage({ type: "cinesrc:command", command: "currentTime", args }, "*");
      } else if (func === "volume") {
        const volNum = typeof args[0] === "number" ? args[0] : 1;
        win.postMessage({ type: "cinesrc:command", command: "volume", args: [volNum] }, "*");
        win.postMessage({ type: "cinesrc:command", command: "setVolume", args: [volNum] }, "*");
        win.postMessage({ type: "cinesrc:command", command: "setVolume", args: [Math.round(volNum * 100)] }, "*");
        win.postMessage({ type: "cinesrc:command", command: "setMuted", args: [volNum === 0] }, "*");
      } else if (func === "mute") {
        win.postMessage({ type: "cinesrc:command", command: "mute", args: [] }, "*");
        win.postMessage({ type: "cinesrc:command", command: "setMuted", args: [true] }, "*");
      } else if (func === "unmute") {
        win.postMessage({ type: "cinesrc:command", command: "unmute", args: [] }, "*");
        win.postMessage({ type: "cinesrc:command", command: "setMuted", args: [false] }, "*");
      } else {
        win.postMessage({ type: "cinesrc:command", command: func, args }, "*");
      }
    } catch {}
  };

  useImperativeHandle(ref, () => ({
    postCommand: (func: string, args: unknown[] = []) => postCineSrcCommand(func, args),
    getCurrentTime: () => progressRef.current,
    getDuration: () => durationRef.current,
    getIsPlaying: () => isPlaying,
  }));

  const togglePlay = () => {
    if (isPlaying) {
      postCineSrcCommand("pause");
      setIsPlaying(false);
    } else {
      postCineSrcCommand("play");
      setIsPlaying(true);
    }
  };

  // Auto-hide controls header on mouse idle
  const triggerControls = () => {
    setShowControls(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!showServerMenu) {
        setShowControls(false);
      }
    }, 3500);
  };

  useEffect(() => {
    triggerControls();
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [showServerMenu]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => { });
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => { });
    }
  };

  // Get embed URL based on provider
  const getEmbedUrl = () => {
    return cinesrcUrl(mediaType, mediaId, season, episode, startTime, !hideNativeControls);
  };

  const handleClose = () => {
    postCineSrcCommand("pause");
    setIsPlaying(false);
    persistSession();
    if (onClose) onClose();
    else router.back();
  };

  const handleProviderSelect = (selected: StreamProviderType) => {
    if (selected === "backend") {
      if (onSwitchToBackend) onSwitchToBackend();
      return;
    }
    setProvider(selected);
    setShowServerMenu(false);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-screen bg-black overflow-hidden select-none font-sans group"
      onMouseMove={triggerControls}
    >
      {/* Top Controls Header Overlay */}
      <div
        className={`absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-3 sm:p-6 bg-gradient-to-b from-black/90 via-black/40 to-transparent transition-opacity duration-300 ${showControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
      >
        {/* Left: Back Button */}
        <button
          onClick={handleClose}
          className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 text-white/90 hover:text-white transition cursor-pointer"
          aria-label="Back"
        >
          <ArrowLeft className="size-5 sm:size-6" />
        </button>

        {/* Center: Title & Subtitle */}
        <div className="flex flex-col items-center text-center px-2 max-w-[40vw] sm:max-w-xl truncate">
          <h1 className="text-xs sm:text-base md:text-lg font-bold text-white truncate drop-shadow-md">
            {item.title}
          </h1>
          <p className="text-[10px] sm:text-xs md:text-sm text-white/70 font-medium truncate drop-shadow">
            {mediaType === "movie"
              ? "Movie"
              : `Season ${season}, Ep. ${episode}`}
          </p>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 sm:gap-3 text-white/90">
          {/* Server / Provider Selector */}
          <div className="relative">
            <button
              onClick={() => setShowServerMenu(!showServerMenu)}
              className="flex items-center gap-1 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-[10px] sm:text-xs font-semibold text-white backdrop-blur-md border border-white/15 transition cursor-pointer"
              title="Change Source Provider"
            >
              <Server className="size-3.5 sm:size-4" />
              <span className="capitalize">{provider}</span>
            </button>

            {showServerMenu && (
              <div className="absolute top-10 right-0 z-40 w-48 bg-black/90 border border-white/15 rounded-2xl p-2 backdrop-blur-xl shadow-2xl text-white text-xs space-y-1">
                <div className="px-3 py-1 text-[10px] font-bold uppercase text-white/40">
                  Streaming Server
                </div>

                <button
                  onClick={() => handleProviderSelect("cinesrc")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition ${provider === "cinesrc" ? "bg-white/20 font-bold" : "hover:bg-white/10 text-white/80"
                    }`}
                >
                  <span>CineSrc (Default)</span>
                </button>

                <button
                  onClick={() => handleProviderSelect("backend")}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-left hover:bg-white/10 text-white/80 transition"
                >
                  <span>Custom Player (Backend HLS)</span>
                </button>
              </div>
            )}
          </div>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 hover:text-white transition cursor-pointer"
            title="Fullscreen"
          >
            {isFullscreen ? <Minimize className="size-4 sm:size-5" /> : <Maximize className="size-4 sm:size-5" />}
          </button>

          {/* Close (X) */}
          <button
            onClick={handleClose}
            className="p-1.5 sm:p-2 rounded-full hover:bg-white/10 hover:text-white transition border-l border-white/20 ml-0.5 pl-2 sm:pl-3 cursor-pointer"
            title="Close"
          >
            <X className="size-4 sm:size-5" />
          </button>
        </div>
      </div>

      {/* Embed Iframe Container */}
      <div className="w-full h-full relative">
        <iframe
          ref={iframeRef}
          src={getEmbedUrl()}
          className="w-full h-full border-0 pointer-events-auto"
          sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          title="Video Player"
        />

        {/* Transparent Overlay to capture mouse events when native controls are hidden */}
        {hideNativeControls && (
          <div 
            className="absolute inset-0 z-10 cursor-pointer"
            onClick={togglePlay}
          />
        )}

        {/* Buffering Indicator */}
        {isBuffering && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 pointer-events-none">
            <Loader2 className="w-12 h-12 text-white animate-spin" />
          </div>
        )}
      </div>

      {/* Custom Bottom Controls (only when native are hidden) */}
      {hideNativeControls && (
        <div
          className={`absolute bottom-0 left-0 right-0 z-30 flex items-center justify-between px-3 py-2.5 sm:px-6 sm:py-4 bg-gradient-to-t from-black/90 via-black/40 to-transparent transition-opacity duration-300 ${showControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        >
          <div className="flex items-center gap-2 sm:gap-4 w-full max-w-5xl mx-auto">
            <button
              onClick={togglePlay}
              className="p-1 sm:p-2 text-white/90 hover:text-white transition cursor-pointer"
            >
              {isPlaying ? <Pause className="size-5 sm:size-6" /> : <Play className="size-5 sm:size-6" />}
            </button>

            {/* Volume Control */}
            <div 
              className="flex items-center gap-1 sm:gap-2 pr-1.5 sm:pr-2 border-r border-white/10"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                onClick={toggleMute}
                className="p-1 sm:p-1.5 text-white/90 hover:text-white transition cursor-pointer"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="size-4 sm:size-5 text-red-400" />
                ) : (
                  <Volume2 className="size-4 sm:size-5 text-white/90" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-12 sm:w-20 accent-white cursor-pointer opacity-80 hover:opacity-100 transition-opacity"
                title="Volume"
              />
            </div>

            <div className="flex-1 flex items-center gap-2 sm:gap-3">
              <span className="text-[10px] sm:text-xs font-medium text-white/70 w-8 sm:w-12 text-right">
                {Math.floor(progressRef.current / 60)}:
                {Math.floor(progressRef.current % 60)
                  .toString()
                  .padStart(2, "0")}
              </span>

              <div className="relative flex-1 h-1.5 bg-white/20 rounded-full cursor-pointer group" onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const pct = Math.max(0, Math.min(1, x / rect.width));
                const seekTime = durationRef.current * pct;
                postCineSrcCommand("seek", [seekTime]);
              }}>
                <div 
                  className="absolute top-0 left-0 h-full bg-white rounded-full transition-all duration-100 ease-linear"
                  style={{ width: `${durationRef.current > 0 ? (progressRef.current / durationRef.current) * 100 : 0}%` }}
                />
                <div 
                  className="absolute top-1/2 -mt-1.5 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `calc(${durationRef.current > 0 ? (progressRef.current / durationRef.current) * 100 : 0}% - 6px)` }}
                />
              </div>

              <span className="text-xs font-medium text-white/70 w-12">
                {Math.floor(durationRef.current / 60)}:
                {Math.floor(durationRef.current % 60)
                  .toString()
                  .padStart(2, "0")}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Next Episode Autoplay Overlay */}
      {showAutoplay && nextHref && (
        <div className="absolute inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-6 text-center text-white">
          <div className="max-w-md space-y-4">
            <h2 className="text-xl font-bold">Up Next</h2>
            <p className="text-sm text-white/70">
              Season {season}, Episode {episode + 1}
            </p>
            <div className="flex justify-center gap-4 pt-2">
              <button
                onClick={() => setShowAutoplay(false)}
                className="px-5 py-2.5 rounded-full bg-white/10 hover:bg-white/20 font-semibold text-sm transition"
              >
                Replay Episode
              </button>
              <Link
                href={nextHref}
                className="flex items-center gap-1 px-6 py-2.5 rounded-full bg-white text-black font-bold text-sm hover:bg-white/90 transition"
              >
                <span>Play Next Episode</span>
                <ChevronRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

IframePlayer.displayName = "IframePlayer";
