"use client";

import Image from "next/image";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getCinesrcCurrentTime,
  sendCinesrcCommand,
  useCinesrcMessages,
} from "@/lib/cinesrc-messages";
import {
  cinesrcPreviewUrl,
  cinesrcUrl,
  tmdbImage,
  type MediaType,
} from "@/lib/media";

export type DetailBackdropPlayerHandle = {
  enterFullscreen: () => Promise<void>;
  setMuted: (muted: boolean) => void;
  isPlaying: () => boolean;
};

type DetailBackdropPlayerProps = {
  mediaType: MediaType;
  mediaId: number;
  season: number;
  episode: number;
  backdropPath: string | null;
  posterPath: string | null;
  startSeconds?: number;
  onPlayingChange?: (playing: boolean) => void;
  onMutedChange?: (muted: boolean) => void;
};

export const DetailBackdropPlayer = forwardRef<
  DetailBackdropPlayerHandle,
  DetailBackdropPlayerProps
>(function DetailBackdropPlayer(
  {
    mediaType,
    mediaId,
    season,
    episode,
    backdropPath,
    posterPath,
    startSeconds,
    onPlayingChange,
    onMutedChange,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const progressRef = useRef(startSeconds ?? 0);
  const [showVideo, setShowVideo] = useState(false);
  const [muted, setMutedState] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);

  const previewSrc = useMemo(
    () =>
      cinesrcPreviewUrl(
        mediaType,
        mediaId,
        season,
        episode,
        startSeconds,
      ),
    [episode, mediaId, mediaType, season, startSeconds],
  );

  useEffect(() => {
    setIframeSrc(previewSrc);
    setShowVideo(false);
    setFullscreen(false);
    setMutedState(true);
    progressRef.current = startSeconds ?? 0;
  }, [previewSrc, startSeconds]);

  const handlers = useMemo(
    () => ({
      onPlay: () => {
        setShowVideo(true);
        onPlayingChange?.(true);
      },
      onTimeUpdate: (currentTime: number) => {
        progressRef.current = Math.max(progressRef.current, currentTime);
      },
      onVolumeChange: (_volume: number, isMuted: boolean) => {
        setMutedState(isMuted);
        onMutedChange?.(isMuted);
      },
    }),
    [onMutedChange, onPlayingChange],
  );

  useCinesrcMessages(iframeRef, handlers, Boolean(iframeSrc));

  const setMuted = useCallback(
    (nextMuted: boolean) => {
      setMutedState(nextMuted);
      sendCinesrcCommand(iframeRef.current, "setMuted", [nextMuted]);
      onMutedChange?.(nextMuted);
    },
    [onMutedChange],
  );

  const enterFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) return;

    const currentTime = await getCinesrcCurrentTime(iframeRef.current);
    const resumeAt = Math.max(currentTime, progressRef.current);

    const fullSrc = cinesrcUrl(
      mediaType,
      mediaId,
      season,
      episode,
      resumeAt >= 30 ? resumeAt : undefined,
    );

    setIframeSrc(fullSrc);
    setFullscreen(true);
    setShowVideo(true);

    if (container.requestFullscreen) {
      await container.requestFullscreen();
    } else if (
      "webkitRequestFullscreen" in container &&
      typeof (container as HTMLElement & { webkitRequestFullscreen: () => void })
        .webkitRequestFullscreen === "function"
    ) {
      (
        container as HTMLElement & { webkitRequestFullscreen: () => void }
      ).webkitRequestFullscreen();
    }

    window.setTimeout(() => {
      sendCinesrcCommand(iframeRef.current, "setMuted", [false]);
      sendCinesrcCommand(iframeRef.current, "play");
      setMutedState(false);
      onMutedChange?.(false);
    }, 800);
  }, [episode, mediaId, mediaType, onMutedChange, season]);

  useImperativeHandle(
    ref,
    () => ({
      enterFullscreen,
      setMuted,
      isPlaying: () => showVideo,
    }),
    [enterFullscreen, setMuted, showVideo],
  );

  const imageSrc = tmdbImage(backdropPath || posterPath, "original");

  return (
    <div
      className={`absolute inset-0 overflow-hidden ${fullscreen ? "detail-backdrop-fullscreen bg-black" : ""}`}
      ref={containerRef}
    >
      {imageSrc ? (
        <Image
          alt=''
          className={`object-cover transition-opacity duration-700 ${showVideo ? "opacity-0" : "opacity-100"}`}
          fill
          priority
          sizes='100vw'
          src={imageSrc}
        />
      ) : null}
      {iframeSrc ? (
        <iframe
          allow='autoplay; fullscreen; picture-in-picture'
          allowFullScreen
          className={`absolute inset-0 h-full w-full border-0 transition-opacity duration-700 ${showVideo ? "opacity-100" : "opacity-0"} ${fullscreen ? "pointer-events-auto" : "pointer-events-none"}`}
          ref={iframeRef}
          referrerPolicy='no-referrer'
          sandbox='allow-scripts allow-same-origin allow-presentation'
          src={iframeSrc}
          title='Preview player'
        />
      ) : null}
      <div className='absolute inset-0 bg-linear-to-t from-black via-black/30 to-black/10' />
      <div className='absolute inset-0 bg-linear-to-r from-black/75 via-transparent to-transparent' />
    </div>
  );
});
