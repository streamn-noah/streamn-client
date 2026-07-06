"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  useParticipants,
  useRoomContext,
  useConnectionState,
} from "@livekit/components-react";
import { ConnectionState, RoomEvent } from "livekit-client";
import { Mic, MicOff, Play, Settings, ShieldAlert, UserMinus, Users } from "lucide-react";
import type { MediaDetail } from "@/lib/media";
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
  const connectionState = useConnectionState();
  const localIdentity = room.localParticipant.identity;

  const [micEnabled, setMicEnabled] = useState(true);

  // Track host identity dynamically (Host migration)
  const [hostIdentity, setHostIdentity] = useState<string | null>(
    initialIsHost ? localIdentity : null
  );

  // Room state
  const [roomState, setRoomState] = useState<WatchPartyState>({
    status: "lobby",
    anyoneCanControl: true,
  });

  const roomStateRef = useRef(roomState);
  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  // Safe publish data helper
  const sendData = useCallback((dataObj: object, reliable = true) => {
    if (room.state !== ConnectionState.Connected) return;
    try {
      const payload = new TextEncoder().encode(JSON.stringify(dataObj));
      room.localParticipant.publishData(payload, { reliable }).catch(() => {});
    } catch (e) {}
  }, [room]);

  // Send state sync helper
  const sendStateSync = useCallback((state: WatchPartyState) => {
    sendData({
      type: "sync_state",
      hostIdentity: hostIdentity || localIdentity,
      status: state.status,
      anyoneCanControl: state.anyoneCanControl,
    }, true);
  }, [sendData, hostIdentity, localIdentity]);

  // Calculate effective host status dynamically
  const isEffectiveHost = hostIdentity ? localIdentity === hostIdentity : initialIsHost;

  // Direct LiveKit Room Data Received Event Listener
  useEffect(() => {
    const handleDataReceived = (payload: Uint8Array) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        
        if (data.type === "start_movie") {
          setRoomState((prev) => ({ ...prev, status: "playing", anyoneCanControl: data.anyoneCanControl }));
          if (data.hostIdentity) setHostIdentity(data.hostIdentity);
        }
        
        if (data.type === "update_settings") {
          setRoomState((prev) => ({ ...prev, anyoneCanControl: data.anyoneCanControl }));
        }

        if (data.type === "request_state" && isEffectiveHost) {
          sendStateSync(roomStateRef.current);
        }

        if (data.type === "sync_state") {
          setRoomState({ status: data.status, anyoneCanControl: data.anyoneCanControl });
          if (data.hostIdentity) setHostIdentity(data.hostIdentity);
        }

        if ((data.type === "host_sync" || data.type === "user_action") && !isEffectiveHost) {
          // If Host is already playing movie, switch guest from lobby to playing automatically!
          setRoomState((prev) => (prev.status === "lobby" ? { ...prev, status: "playing" } : prev));
          if (data.hostIdentity) setHostIdentity(data.hostIdentity);
        }

        if (data.type === "kick_participant" && data.targetIdentity === localIdentity) {
          alert("You have been removed from the Watch Party by the host.");
          room.disconnect();
        }
      } catch (err) {
        console.error("Failed to parse data message", err);
      }
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room, isEffectiveHost, sendStateSync, localIdentity]);

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

        if (oldestParticipant.isLocal) {
          sendStateSync(roomStateRef.current);
        }
      }
    }
  }, [participants, hostIdentity, sendStateSync]);

  // Send request_state when joining as guest
  useEffect(() => {
    if (!isEffectiveHost && connectionState === ConnectionState.Connected) {
      sendData({ type: "request_state" }, true);
    }
  }, [isEffectiveHost, connectionState, sendData]);

  const handleStartMovie = () => {
    const newState: WatchPartyState = { ...roomState, status: "playing" };
    setRoomState(newState);
    sendData({
      type: "start_movie",
      hostIdentity: localIdentity,
      anyoneCanControl: newState.anyoneCanControl
    }, true);
  };

  const handleKickParticipant = (targetIdentity: string) => {
    if (!isEffectiveHost) return;
    sendData({
      type: "kick_participant",
      targetIdentity,
    }, true);
  };

  const toggleMic = async () => {
    const enabled = !micEnabled;
    await room.localParticipant.setMicrophoneEnabled(enabled);
    setMicEnabled(enabled);
  };

  // Turn on mic by default
  useEffect(() => {
    room.localParticipant.setMicrophoneEnabled(true).catch(console.error);
    return () => {
      room.localParticipant.setMicrophoneEnabled(false).catch(console.error);
    };
  }, [room]);

  if (roomState.status === "playing") {
    return (
      <WatchPartyPlayer
        item={item}
        mediaType={mediaType}
        mediaId={mediaId}
        season={season}
        episode={episode}
        isHost={isEffectiveHost}
        hostIdentity={hostIdentity || localIdentity}
        anyoneCanControl={roomState.anyoneCanControl}
        onLeave={() => room.disconnect()}
      />
    );
  }

  // LOBBY UI
  return (
    <div className="flex h-screen flex-col bg-[#0a0a0a] text-white">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Watch Party Lobby</h1>
            {isEffectiveHost && (
              <span className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                Host
              </span>
            )}
          </div>
          <p className="text-white/60 mt-1">
            {item.title} {mediaType === "tv" ? `(S${season} E${episode})` : ""}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={toggleMic}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold text-sm transition-all ${
              micEnabled ? "bg-white/10 hover:bg-white/20 text-white" : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
            }`}
          >
            {micEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
            <span>{micEnabled ? "Mic On" : "Muted"}</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-3xl space-y-8">
          
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Users className="size-5 text-white/60" />
              Participants ({participants.length})
            </h2>
            {isEffectiveHost && (
              <label className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl cursor-pointer hover:bg-white/10 transition border border-white/5">
                <input
                  type="checkbox"
                  checked={roomState.anyoneCanControl}
                  onChange={(e) => {
                    const val = e.target.checked;
                    setRoomState(prev => ({ ...prev, anyoneCanControl: val }));
                    sendData({
                      type: "update_settings",
                      anyoneCanControl: val
                    }, true);
                  }}
                  className="w-4 h-4 rounded accent-white"
                />
                <span className="text-sm font-semibold select-none flex items-center gap-2">
                  <Settings className="size-4 text-white/50" />
                  Anyone can control playback
                </span>
              </label>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {participants.map((p) => {
              const displayName = p.name || p.identity || "Guest";
              const isParticipantHost = hostIdentity ? p.identity === hostIdentity : p.isLocal && initialIsHost;

              return (
                <div key={p.sid} className="bg-white/5 rounded-2xl p-6 border border-white/10 flex flex-col items-center text-center relative group">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-xl font-bold mb-4 shadow-lg">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="font-semibold truncate w-full px-2 flex items-center justify-center gap-1.5">
                    <span>{displayName}</span>
                    {p.isLocal && <span className="text-white/50 text-xs">(You)</span>}
                  </div>
                  
                  {isParticipantHost && (
                    <span className="text-[10px] uppercase tracking-wider font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full mt-1">
                      Host
                    </span>
                  )}

                  <div className="text-xs text-white/50 mt-2 flex items-center gap-1">
                    {p.isMicrophoneEnabled ? <Mic className="size-3" /> : <MicOff className="size-3 text-red-400" />}
                    {p.isMicrophoneEnabled ? "Mic On" : "Muted"}
                  </div>
                  
                  {/* KICK BUTTON ONLY VISIBLE TO THE EFFECTIVE HOST */}
                  {isEffectiveHost && !p.isLocal && (
                    <button
                      onClick={() => handleKickParticipant(p.identity)}
                      className="absolute top-3 right-3 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity bg-red-400/10 p-1.5 rounded-lg hover:bg-red-400/20 cursor-pointer"
                      title="Remove participant"
                    >
                      <UserMinus className="size-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      </main>

      {/* Footer */}
      <footer className="p-8 border-t border-white/10 bg-black/50 backdrop-blur-md flex justify-center">
        {isEffectiveHost ? (
          <button
            onClick={handleStartMovie}
            className="flex items-center gap-2 bg-white text-black px-8 py-4 rounded-full font-bold text-lg hover:scale-105 transition-transform shadow-xl shadow-white/10 cursor-pointer"
          >
            <Play className="size-5 fill-current" />
            Start Movie
          </button>
        ) : (
          <div className="text-white/50 font-semibold flex items-center gap-2 animate-pulse">
            <ShieldAlert className="size-5" />
            Waiting for host to start the movie...
          </div>
        )}
      </footer>
    </div>
  );
}
