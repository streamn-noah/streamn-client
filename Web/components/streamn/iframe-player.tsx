"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
} from "lucide-react";
import type { MediaSummary, MediaType } from "@/lib/media";
import { cinesrcUrl } from "@/lib/media";
import { commitWatchSession, getWatchProgress } from "@/lib/streamn-storage";
import { syncWatchSession } from "@/lib/user-actions";

export type StreamProviderType = "backend" | "cinesrc";

type IframePlayerProps = {
  mediaType: MediaType;
  mediaId: number;
  season: number;
  episode: number;
  item: MediaSummary;
  nextHref?: string | null;
  onSwitchToBackend?: () => void;
  initialProvider?: StreamProviderType;
  onReady?: () => void;
  onClose?: () => void;
};

export function IframePlayer({
  mediaType,
  mediaId,
  season,
  episode,
  item,
  nextHref,
  onSwitchToBackend,
  initialProvider = "cinesrc",
  onReady,
  onClose,
}: IframePlayerProps) {
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

      let payload = event.data;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch {
          payload = { event: payload };
        }
      }

      if (!payload || typeof payload !== "object") return;

      // Normalize event payload
      const eventType = String(payload.type || payload.event || payload.action || payload.name || "");
      const current = Number(payload.currentTime ?? payload.current_time ?? payload.progress ?? payload.time ?? 0);
      const dur = Number(payload.duration ?? payload.totalTime ?? 0);

      if (current > 0) {
        progressRef.current = current;
      }
      if (dur > 0) {
        durationRef.current = dur;
      }

      if (eventType.includes("ended")) {
        persistSession();
        if (mediaType === "tv" && nextHref) {
          setShowAutoplay(true);
        }
      } else if (eventType.includes("close")) {
        persistSession();
        if (onClose) onClose();
        else router.back();
      } else if (eventType.includes("play")) {
        setIsPlaying(true);
        setIsBuffering(false);
        persistSession();
        if (onReady) onReady();
      } else if (eventType.includes("pause")) {
        setIsPlaying(false);
        persistSession();
      } else if (eventType.includes("timeupdate")) {
        setIsBuffering(false);
        persistSession();
        if (onReady) onReady();
      } else if (
        eventType.includes("MEDIA_DATA") ||
        eventType.includes("ready") ||
        eventType.includes("loadedmetadata")
      ) {
        setIsBuffering(false);
        persistSession();
        if (onReady) onReady();
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

  // Post commands to CineSrc iframe using robust multi-format dispatching
  const postCineSrcCommand = (func: string, args: unknown[] = []) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;

    const val = args[0];
    const obj = {
      type: func,
      event: func,
      action: func,
      method: func,
      command: func,
      api: func,
      value: val,
      arg: val,
      args,
    };

    try {
      win.postMessage(obj, "*");
      win.postMessage(JSON.stringify(obj), "*");
      win.postMessage(JSON.stringify({ event: "command", func, args }), "*");
      win.postMessage(JSON.stringify({ method: func, value: val, arg: val }), "*");
      win.postMessage(func, "*");
    } catch {}
  };

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
    return cinesrcUrl(mediaType, mediaId, season, episode, startTime);
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
        className={`absolute top-0 left-0 right-0 z-30 flex items-center justify-between p-6 bg-gradient-to-b from-black/90 via-black/40 to-transparent transition-opacity duration-300 ${showControls ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
      >
        {/* Left: Back Button */}
        <button
          onClick={handleClose}
          className="p-2 rounded-full hover:bg-white/10 text-white/90 hover:text-white transition cursor-pointer"
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

        {/* Right Controls */}
        <div className="flex items-center gap-3 text-white/90">
          {/* Server / Provider Selector */}
          <div className="relative">
            <button
              onClick={() => setShowServerMenu(!showServerMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold text-white backdrop-blur-md border border-white/15 transition cursor-pointer"
              title="Change Source Provider"
            >
              <Server className="size-4" />
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
            className="p-2 rounded-full hover:bg-white/10 hover:text-white transition cursor-pointer"
            title="Fullscreen"
          >
            {isFullscreen ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </button>

          {/* Close (X) */}
          <button
            onClick={handleClose}
            className="p-2 rounded-full hover:bg-white/10 hover:text-white transition border-l border-white/20 ml-1 pl-3 cursor-pointer"
            title="Close"
          >
            <X className="size-5" />
          </button>
        </div>
      </div>

      {/* Embed Iframe Container */}
      <div className="w-full h-full relative">
        <iframe
          ref={iframeRef}
          src={getEmbedUrl()}
          className="w-full h-full border-0 relative z-10"
          // Sandbox attribute prevents popup windows, ad redirects, and unrequested page navigation!
          sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
        />

        {/* Buffering Indicator */}
        {isBuffering && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 pointer-events-none">
            <Loader2 className="w-12 h-12 text-white animate-spin" />
          </div>
        )}
      </div>

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
}
