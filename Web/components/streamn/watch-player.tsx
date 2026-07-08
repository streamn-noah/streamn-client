"use client";

import { useState } from "react";
import { CustomPlayer } from "@/components/streamn/custom-player";
import { IframePlayer, type StreamProviderType } from "@/components/streamn/iframe-player";
import type { MediaSummary, MediaType } from "@/lib/media";

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
  // Read default provider from NEXT_PUBLIC_STREAM_PROVIDER env, defaulting to "cinesrc"
  const defaultEnvProvider = (process.env.NEXT_PUBLIC_STREAM_PROVIDER as StreamProviderType) || "cinesrc";
  const [provider, setProvider] = useState<StreamProviderType>(defaultEnvProvider);

  const nextHref =
    mediaType === "tv"
      ? `/watch/tv/${mediaId}?s=${season}&e=${episode + 1}`
      : null;

  return (
    <div className="flex-1 w-full h-full min-h-0 bg-black">
      {provider === "backend" || provider === "moviebox" ? (
        <CustomPlayer
          episode={episode}
          item={item}
          mediaId={mediaId}
          mediaType={mediaType}
          nextHref={nextHref}
          season={season}
        />
      ) : (
        <IframePlayer
          episode={episode}
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
