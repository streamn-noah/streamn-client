"use client";

import { useEffect, useState } from "react";
import {
  useParticipants,
  useRoomContext,
} from "@livekit/components-react";
import type { MediaDetail } from "@/lib/media";
import { useRouter } from "next/navigation";
import { WatchPartyPlayer } from "./watch-party-player";

export type WatchPartyState = {
  status: "lobby" | "playing";
  anyoneCanControl: boolean;
};

export function WatchPartyRoom({
  item,
  mediaType,
  mediaId,
  season,
  episode,
  isHost: initialIsHost,
}: {
  item: MediaDetail;
  mediaType: "movie" | "tv";
  mediaId: number;
  season: number;
  episode: number;
  isHost: boolean;
}) {
  const room = useRoomContext();
  const participants = useParticipants();
  const localIdentity = room.localParticipant.identity;
  const router = useRouter();

  // Track host identity dynamically (Host migration)
  const [hostIdentity, setHostIdentity] = useState<string | null>(
    initialIsHost ? localIdentity : null
  );

  const anyoneCanControl = true;

  // Calculate effective host status dynamically
  const isEffectiveHost = hostIdentity ? localIdentity === hostIdentity : initialIsHost;

  // Host Migration Logic: If the host leaves, the oldest remaining participant becomes Host!
  useEffect(() => {
    if (participants.length === 0) return;

    const hostStillInRoom = hostIdentity && participants.some((p) => p.identity === hostIdentity);

    if (!hostStillInRoom) {
      // Find oldest remaining participant
      const oldestParticipant = [...participants].sort((a, b) => {
        const timeA = a.joinedAt?.getTime() ?? 0;
        const timeB = b.joinedAt?.getTime() ?? 0;
        return timeA - timeB;
      })[0];

      if (oldestParticipant) {
        setHostIdentity(oldestParticipant.identity);
      }
    }
  }, [participants, hostIdentity]);

  return (
    <WatchPartyPlayer
      item={item}
      mediaType={mediaType}
      mediaId={mediaId}
      season={season}
      episode={episode}
      isHost={isEffectiveHost}
      hostIdentity={hostIdentity || localIdentity}
      anyoneCanControl={anyoneCanControl}
      onLeave={() => {
        room.disconnect();
        router.push("/");
      }}
    />
  );
}
