"use client";

import { useEffect, useMemo, useRef } from "react";
import { cinesrcUrl, type MediaSummary, type MediaType } from "@/lib/media";
import { commitWatchSession, getWatchProgress } from "@/lib/streamn-storage";
import { syncWatchSession } from "@/lib/user-actions";

type WatchPlayerProps = {
  mediaType: MediaType;
  mediaId: number;
  season: number;
  episode: number;
  item: MediaSummary;
};

export function WatchPlayer({
  mediaType,
  mediaId,
  season,
  episode,
  item,
}: WatchPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const progressRef = useRef(0);
  const engagedRef = useRef(0);
  const playingRef = useRef(false);
  const lastTickRef = useRef(Date.now());

  const src = useMemo(() => {
    const saved = getWatchProgress(mediaType, mediaId);
    const resumeFrom =
      saved &&
      saved.mediaType === mediaType &&
      saved.id === mediaId &&
      (mediaType === "movie" ||
        (saved.seasonNumber === season && saved.episodeNumber === episode))
        ? saved.progressSeconds
        : undefined;

    return cinesrcUrl(mediaType, mediaId, season, episode, resumeFrom);
  }, [episode, mediaId, mediaType, season]);

  useEffect(() => {
    function flushEngaged() {
      if (!playingRef.current) return;
      engagedRef.current += (Date.now() - lastTickRef.current) / 1000;
      lastTickRef.current = Date.now();
    }

    function persistSession() {
      flushEngaged();
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
    }

    function onMessage(event: MessageEvent) {
      if (event.origin !== "https://cinesrc.st") return;
      if (!event.data || typeof event.data !== "object") return;

      const { type, currentTime, duration } = event.data as {
        type?: string;
        currentTime?: number;
        duration?: number;
      };

      if (type === "cinesrc:play") {
        playingRef.current = true;
        lastTickRef.current = Date.now();
        return;
      }

      if (type === "cinesrc:pause" || type === "cinesrc:ended") {
        flushEngaged();
        playingRef.current = false;
        if (type === "cinesrc:ended") persistSession();
        return;
      }

      if (
        type === "cinesrc:timeupdate" ||
        type === "cinesrc:seeked" ||
        type === "cinesrc:seeking"
      ) {
        if (typeof currentTime === "number") {
          progressRef.current = Math.max(progressRef.current, currentTime);
        }
        if (typeof duration === "number" && duration > 0) {
          progressRef.current = Math.min(progressRef.current, duration - 5);
        }
      }
    }

    window.addEventListener("message", onMessage);
    window.addEventListener("pagehide", persistSession);

    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("pagehide", persistSession);
      persistSession();
    };
  }, [episode, item, mediaId, mediaType, season]);

  return (
    <iframe
      ref={iframeRef}
      allow='autoplay; fullscreen; picture-in-picture'
      allowFullScreen
      className='min-h-0 flex-1'
      referrerPolicy='no-referrer'
      sandbox='allow-scripts allow-same-origin allow-presentation'
      src={src}
      title='Streamn player'
    />
  );
}
