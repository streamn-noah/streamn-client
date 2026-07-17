"use client";

import { useEffect, useState } from "react";
import { CustomPlayer } from "@/components/streamn/custom-player";
import { IframePlayer, type StreamProviderType } from "@/components/streamn/iframe-player";
import type { MediaSummary, MediaType } from "@/lib/media";
import { fetchStreamSources, getFileSizeRange } from "@/lib/stream-source";

type WatchPlayerProps = {
  mediaType: MediaType;
  mediaId: number;
  season: number;
  episode: number;
  item: MediaSummary;
  recommendations?: MediaSummary[];
  runtimeMinutes?: number | null;
};

export function WatchPlayer({
  mediaType,
  mediaId,
  season,
  episode,
  item,
  recommendations = [],
  runtimeMinutes = null,
}: WatchPlayerProps) {
  // Read default provider from NEXT_PUBLIC_STREAM_PROVIDER env, defaulting to "cinesrc"
  const defaultEnvProvider = (process.env.NEXT_PUBLIC_STREAM_PROVIDER as StreamProviderType) || "cinesrc";
  const [provider, setProvider] = useState<StreamProviderType>(defaultEnvProvider);
  const [fileSizeRange, setFileSizeRange] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setFileSizeRange(null);

    fetchStreamSources(mediaType, mediaId, season, episode, false, "playback")
      .then((res) => {
        if (!isMounted) return;
        setFileSizeRange(getFileSizeRange(res.sources));
      })
      .catch(() => {
        if (isMounted) setFileSizeRange(null);
      });

    return () => {
      isMounted = false;
    };
  }, [mediaType, mediaId, season, episode]);

  const nextHref =
    mediaType === "tv"
      ? `/watch/tv/${mediaId}?s=${season}&e=${episode + 1}`
      : null;

  return (
    <div className="flex-1 w-full h-full min-h-0 bg-black">
      {provider === "backend" || provider === "moviebox" ? (
        <CustomPlayer
          episode={episode}
          fileSizeRange={fileSizeRange}
          item={item}
          mediaId={mediaId}
          mediaType={mediaType}
          nextHref={nextHref}
          recommendations={recommendations}
          runtimeMinutes={runtimeMinutes}
          season={season}
        />
      ) : (
        <IframePlayer
          episode={episode}
          fileSizeRange={fileSizeRange}
          initialProvider={provider}
          item={item}
          mediaId={mediaId}
          mediaType={mediaType}
          nextHref={nextHref}
          onSwitchToBackend={() => setProvider("moviebox")}
          season={season}
        />
      )}
    </div>
  );
}
