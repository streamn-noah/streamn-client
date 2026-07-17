"use client";

import Image from "next/image";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { tmdbImage } from "@/lib/media";
import { useLowDataMode } from "@/components/providers/low-data-provider";

declare global {
  interface Window {
    YT?: {
      Player: new (
        element: HTMLElement | string,
        config: Record<string, unknown>,
      ) => unknown;
      PlayerState?: {
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export type DetailBackdropPlayerHandle = {
  setMuted: (muted: boolean) => void;
  togglePlay: () => void;
};

type DetailBackdropPlayerProps = {
  backdropPath: string | null;
  posterPath: string | null;
  trailerKey?: string | null;
  muted?: boolean;
  onMutedChange?: (muted: boolean) => void;
};

export const DetailBackdropPlayer = forwardRef<
  DetailBackdropPlayerHandle,
  DetailBackdropPlayerProps
>(function DetailBackdropPlayer(
  { backdropPath, posterPath, trailerKey, muted = true, onMutedChange },
  ref,
) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const { isLowDataMode } = useLowDataMode();

  useEffect(() => {
    setVideoLoaded(false);
    setIsPlaying(true);
    if (!trailerKey) return;
    const timer = setTimeout(() => {
      setVideoLoaded(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, [trailerKey]);

  useEffect(() => {
    if (!trailerKey || typeof window === "undefined") return;

    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube-nocookie.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }

    let playerInstance: unknown = null;
    const iframeId = `detail-yt-player-${trailerKey}`;

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
            },
          },
        });
      } catch {
        // Player init fallback
      }
    };

    if (window.YT?.Player) {
      setTimeout(initPlayer, 100);
    } else {
      window.onYouTubeIframeAPIReady = () => setTimeout(initPlayer, 100);
    }

    return () => {
      if (
        playerInstance &&
        typeof (playerInstance as { destroy?: () => void }).destroy ===
          "function"
      ) {
        (playerInstance as { destroy: () => void }).destroy();
      }
    };
  }, [trailerKey]);

  useImperativeHandle(
    ref,
    () => ({
      setMuted: (nextMuted: boolean) => {
        if (!iframeRef.current) return;
        const func = nextMuted ? "mute" : "unMute";
        iframeRef.current.contentWindow?.postMessage(
          JSON.stringify({ event: "command", func, args: "" }),
          "*",
        );
        onMutedChange?.(nextMuted);
      },
      togglePlay: () => {
        if (!iframeRef.current) return;
        const func = isPlaying ? "pauseVideo" : "playVideo";
        iframeRef.current.contentWindow?.postMessage(
          JSON.stringify({ event: "command", func, args: "" }),
          "*",
        );
        setIsPlaying((prev) => !prev);
      },
    }),
    [isPlaying, onMutedChange],
  );

  const imageSrc = tmdbImage(backdropPath || posterPath, isLowDataMode ? "w780" : "w1280");

  return (
    <div className='absolute inset-0 overflow-hidden bg-black select-none pointer-events-none'>
      {imageSrc ? (
        <Image
          alt=''
          className={`object-cover object-center transition-opacity duration-700 ${
            videoLoaded && !isLowDataMode ? "opacity-0" : "opacity-80"
          }`}
          fill
          priority={!isLowDataMode}
          loading={isLowDataMode ? "lazy" : undefined}
          quality={isLowDataMode ? 60 : 85}
          sizes='100vw'
          src={imageSrc}
        />
      ) : null}

      {!isLowDataMode && trailerKey ? (
        <iframe
          id={`detail-yt-player-${trailerKey}`}
          ref={iframeRef}
          onLoad={() => setVideoLoaded(true)}
          src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&showinfo=0&rel=0&modestbranding=1&iv_load_policy=3&disablekb=1&enablejsapi=1&playsinline=1`}
          className={`absolute top-1/2 left-1/2 w-[300%] h-[300%] md:w-[150%] md:h-[150%] -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-opacity duration-700 ${
            videoLoaded ? "opacity-100" : "opacity-0"
          }`}
          allow='autoplay; encrypted-media; picture-in-picture'
          title='Backdrop Trailer'
        />
      ) : null}

      <div className='absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent z-10' />
      <div className='absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent z-10' />
    </div>
  );
});


