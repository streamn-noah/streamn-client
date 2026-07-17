"use client";

import { useEffect, useState } from "react";
import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";
import { WatchPartyRoom } from "@/components/streamn/watch-party-room";
import type { MediaDetail } from "@/lib/media";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

export function WatchPartyClient({
  roomId,
  item,
  mediaType,
  mediaId,
  season,
  episode,
}: {
  roomId: string;
  item: MediaDetail;
  mediaType: "movie" | "tv";
  mediaId: number;
  season: number;
  episode: number;
}) {
  const searchParams = useSearchParams();
  const isHost = searchParams?.get("host") === "1";

  const [displayName, setDisplayName] = useState("");
  const [token, setToken] = useState("");
  const [hasJoined, setHasJoined] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const serverUrl = process.env.NEXT_PUBLIC_LIVEKIT_URL;

  const joinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    setIsConnecting(true);
    try {
      const res = await fetch("/api/watchparty/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName: roomId,
          participantName: displayName,
          isHost,
        }),
      });
      const data = await res.json();
      if (data.token) {
        setToken(data.token);
        setHasJoined(true);
      } else {
        alert("Failed to get token: " + data.error);
      }
    } catch (err) {
      alert("Error joining room.");
    } finally {
      setIsConnecting(false);
    }
  };

  if (!serverUrl) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white p-8 text-center">
        <div>
          <h2 className="text-2xl font-bold mb-2">LiveKit Not Configured</h2>
          <p className="text-white/60">
            Please add LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and NEXT_PUBLIC_LIVEKIT_URL to your .env file.
          </p>
        </div>
      </div>
    );
  }

  if (!hasJoined) {
    return (
      <div className="flex h-screen items-center justify-center bg-black text-white">
        <form
          onSubmit={joinRoom}
          className="w-full max-w-sm rounded-3xl bg-[#111] p-8 border border-white/10 shadow-2xl space-y-6"
        >
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-2">Join Watch Party</h1>
            <p className="text-sm text-white/60">
              Watching: <span className="text-white font-semibold">{item.title}</span>
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-white/80 block">
              Choose a Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. John Doe"
              className="w-full rounded-xl bg-black/50 border border-white/10 px-4 py-3 text-white outline-none focus:border-white/30 transition"
              autoFocus
              maxLength={20}
              required
            />
          </div>

          <button
            type="submit"
            disabled={isConnecting || !displayName.trim()}
            className="w-full rounded-xl bg-white text-black py-3 font-bold hover:bg-white/90 transition disabled:opacity-50 flex items-center justify-center"
          >
            {isConnecting ? <Loader2 className="size-5 animate-spin" /> : "Join Room"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <LiveKitRoom
      video={false}
      audio={true}
      token={token}
      serverUrl={serverUrl}
      data-lk-theme="default"
      style={{ height: "100vh", backgroundColor: "black" }}
    >
      <WatchPartyRoom
        item={item}
        mediaType={mediaType}
        mediaId={mediaId}
        season={season}
        episode={episode}
        isHost={isHost}
      />
    </LiveKitRoom>
  );
}
