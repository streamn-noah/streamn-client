"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  useParticipants,
  AudioTrack,
  isTrackReference,
  ConnectionQualityIndicator,
  useTracks,
  useLocalParticipant,
  useRoomContext,
} from "@livekit/components-react";
import { Track, ConnectionState, RoomEvent } from "livekit-client";
import { IframePlayer, type IframePlayerHandle } from "./iframe-player";
import type { MediaDetail } from "@/lib/media";
import { Mic, MicOff, Volume2, Users, Crown, Pin } from "lucide-react";

export function WatchPartyPlayer({
  item,
  mediaType,
  mediaId,
  season,
  episode,
  isHost: initialIsHost,
  hostIdentity: initialHostIdentity,
  anyoneCanControl,
  onLeave,
}: {
  item: MediaDetail;
  mediaType: "movie" | "tv";
  mediaId: number;
  season: number;
  episode: number;
  isHost: boolean;
  hostIdentity?: string;
  anyoneCanControl: boolean;
  onLeave: () => void;
}) {
  const room = useRoomContext();
  const playerRef = useRef<IframePlayerHandle>(null);
  const participants = useParticipants();
  const audioTracks = useTracks([Track.Source.Microphone]);
  const { localParticipant } = useLocalParticipant();
  const localIdentity = localParticipant.identity;

  const [activeHostIdentity, setActiveHostIdentity] = useState<string | null>(
    initialHostIdentity || (initialIsHost ? localIdentity : null)
  );

  const [micEnabled, setMicEnabled] = useState(true);
  const [voiceVolume, setVoiceVolume] = useState(1);

  // Auto-hiding overlay state
  const [showOverlay, setShowOverlay] = useState(true);
  const [isOverlayPinned, setIsOverlayPinned] = useState(false);
  const hideOverlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringOverlayRef = useRef(false);

  // Dynamic host status check
  const isEffectiveHost = activeHostIdentity ? localIdentity === activeHostIdentity : initialIsHost;
  const canControl = isEffectiveHost || anyoneCanControl;

  // Track timestamp until which we ignore iframe video events to avoid echo loops
  const ignoreLocalEventsUntilRef = useRef(0);

  // Auto-hide overlay after mouse inactivity (3.5 seconds)
  const triggerOverlayVisibility = useCallback(() => {
    if (isOverlayPinned) {
      setShowOverlay(true);
      return;
    }
    setShowOverlay(true);
    if (hideOverlayTimerRef.current) clearTimeout(hideOverlayTimerRef.current);
    hideOverlayTimerRef.current = setTimeout(() => {
      if (!isHoveringOverlayRef.current && !isOverlayPinned) {
        setShowOverlay(false);
      }
    }, 3500);
  }, [isOverlayPinned]);

  useEffect(() => {
    triggerOverlayVisibility();
    return () => {
      if (hideOverlayTimerRef.current) clearTimeout(hideOverlayTimerRef.current);
    };
  }, [triggerOverlayVisibility]);

  // Safe publish data helper
  const sendData = useCallback((dataObj: object, reliable = true) => {
    if (room.state !== ConnectionState.Connected) return;
    try {
      const payload = new TextEncoder().encode(JSON.stringify(dataObj));
      room.localParticipant.publishData(payload, { reliable }).catch(() => {});
    } catch (e) {}
  }, [room]);

  // Helper for Host to broadcast current player state
  const broadcastHostSync = useCallback((currentTime: number, isPlaying: boolean) => {
    sendData({
      type: "host_sync",
      hostIdentity: activeHostIdentity || localIdentity,
      currentTime,
      isPlaying,
      timestamp: Date.now(),
    }, false);
  }, [sendData, activeHostIdentity, localIdentity]);

  // Toggle microphone
  const toggleMic = async () => {
    const enabled = !micEnabled;
    await room.localParticipant.setMicrophoneEnabled(enabled);
    setMicEnabled(enabled);
  };

  // Turn on mic by default when entering player
  useEffect(() => {
    room.localParticipant.setMicrophoneEnabled(true).catch(console.error);
    setMicEnabled(true);
  }, [room]);

  // Listen to room data events directly
  useEffect(() => {
    const handleDataReceived = (payload: Uint8Array) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        if (!playerRef.current) return;

        if (data.type === "host_sync") {
          if (data.hostIdentity) setActiveHostIdentity(data.hostIdentity);

          if (!isEffectiveHost) {
            // GUEST SYNCING TO HOST MASTER CLOCK!
            const targetIsPlaying = data.isPlaying;
            const hostTime = data.currentTime;
            const msgTimestamp = data.timestamp || Date.now();
            const latency = (Date.now() - msgTimestamp) / 1000;
            const expectedTime = Math.max(0, hostTime + (targetIsPlaying ? latency : 0));

            const guestTime = playerRef.current.getCurrentTime();
            const guestPlaying = playerRef.current.getIsPlaying();

            // 1. Play/Pause Sync
            if (targetIsPlaying && !guestPlaying) {
              ignoreLocalEventsUntilRef.current = Date.now() + 1500;
              playerRef.current.postCommand("play");
            } else if (!targetIsPlaying && guestPlaying) {
              ignoreLocalEventsUntilRef.current = Date.now() + 1500;
              playerRef.current.postCommand("pause");
            }

            // 2. Position Drift Sync (Seek if drifted > 1.0s or starting from 0)
            const drift = Math.abs(guestTime - expectedTime);
            if (drift > 1.0 || (expectedTime > 3 && guestTime < 2)) {
              ignoreLocalEventsUntilRef.current = Date.now() + 1500;
              playerRef.current.postCommand("seek", [expectedTime]);
            }
          }
        }

        if (data.type === "user_action") {
          // Action triggered by any user (Play / Pause / Seek)
          ignoreLocalEventsUntilRef.current = Date.now() + 1500;

          if (data.action === "play") {
            playerRef.current.postCommand("play");
          } else if (data.action === "pause") {
            playerRef.current.postCommand("pause");
          } else if (data.action === "seek") {
            playerRef.current.postCommand("seek", [data.time]);
          }

          // If I am the Host, immediately broadcast fresh host_sync as source of truth
          if (isEffectiveHost && playerRef.current) {
            const currentTime = data.action === "seek" ? data.time : playerRef.current.getCurrentTime();
            const isPlaying = data.action === "play" ? true : data.action === "pause" ? false : playerRef.current.getIsPlaying();
            broadcastHostSync(currentTime, isPlaying);
          }
        }

        if (data.type === "request_host_sync" && isEffectiveHost) {
          // New guest joined, reconnected, or player became ready!
          if (playerRef.current) {
            broadcastHostSync(playerRef.current.getCurrentTime(), playerRef.current.getIsPlaying());
          }
        }
      } catch (err) {}
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room, isEffectiveHost, broadcastHostSync]);

  // Host Migration inside player: If Host leaves, oldest remaining participant becomes Host!
  useEffect(() => {
    if (participants.length === 0) return;

    const hostStillInRoom = activeHostIdentity && participants.some((p) => p.identity === activeHostIdentity);

    if (!hostStillInRoom) {
      const oldestParticipant = [...participants].sort((a, b) => {
        const timeA = a.joinedAt?.getTime() ?? 0;
        const timeB = b.joinedAt?.getTime() ?? 0;
        return timeA - timeB;
      })[0];

      if (oldestParticipant) {
        setActiveHostIdentity(oldestParticipant.identity);
      }
    }
  }, [participants, activeHostIdentity]);

  // Host periodic heartbeat interval (every 2 seconds)
  useEffect(() => {
    if (!isEffectiveHost) return;

    const interval = setInterval(() => {
      if (playerRef.current) {
        const currentTime = playerRef.current.getCurrentTime();
        const isPlaying = playerRef.current.getIsPlaying();
        broadcastHostSync(currentTime, isPlaying);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isEffectiveHost, broadcastHostSync]);

  // Request host sync upon entering player screen or when video loads
  const requestHostSync = useCallback(() => {
    if (!isEffectiveHost) {
      sendData({ type: "request_host_sync" }, true);
    }
  }, [isEffectiveHost, sendData]);

  useEffect(() => {
    requestHostSync();
  }, [requestHostSync]);

  // Handle local video player events (user clicking Play, Pause, or seeking on native/custom player controls)
  const handleVideoEvent = useCallback((type: string, current: number, duration: number) => {
    // When guest's player finishes loading/buffering, request host sync to jump to host's time immediately!
    if (type === "ready" && !isEffectiveHost) {
      requestHostSync();
      return;
    }

    // If we are currently processing a remote sync command, ignore this iframe event to prevent echo loops
    if (Date.now() < ignoreLocalEventsUntilRef.current) return;
    if (!canControl) return;

    if (type === "play" || type === "playing") {
      sendData({
        type: "user_action",
        action: "play",
        sender: localIdentity
      }, true);

      if (isEffectiveHost) broadcastHostSync(current, true);
    } else if (type === "pause") {
      sendData({
        type: "user_action",
        action: "pause",
        sender: localIdentity
      }, true);

      if (isEffectiveHost) broadcastHostSync(current, false);
    } else if (type === "seeked") {
      sendData({
        type: "user_action",
        action: "seek",
        time: current,
        sender: localIdentity
      }, true);

      if (isEffectiveHost) broadcastHostSync(current, playerRef.current?.getIsPlaying() ?? true);
    }
  }, [canControl, isEffectiveHost, localIdentity, broadcastHostSync, requestHostSync, sendData]);

  return (
    <div 
      className="relative w-full h-screen bg-black overflow-hidden"
      onMouseMove={triggerOverlayVisibility}
    >
      {/* Remote Audio Tracks with volume control (Skip local participant to prevent SDK volume warnings) */}
      {audioTracks
        .filter(isTrackReference)
        .filter((track) => !track.participant.isLocal)
        .map((track) => (
          <AudioTrack 
            key={track.participant.identity} 
            trackRef={track} 
            volume={voiceVolume} 
          />
        ))}

      <IframePlayer
        ref={playerRef}
        item={item}
        mediaType={mediaType}
        mediaId={mediaId}
        season={season}
        episode={episode}
        hideNativeControls={true}
        onClose={onLeave}
        onVideoEvent={handleVideoEvent}
      />

      {/* Mic & Party Toggle Buttons in Floating Top Bar */}
      <div 
        className={`absolute top-6 left-6 z-40 flex items-center gap-3 transition-opacity duration-300 ${
          showOverlay ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <button
          onClick={toggleMic}
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-xs backdrop-blur-xl border transition-all cursor-pointer shadow-lg ${
            micEnabled
              ? "bg-black/60 text-white border-white/20 hover:bg-black/80"
              : "bg-red-500/80 text-white border-red-500 hover:bg-red-600"
          }`}
        >
          {micEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
          <span>{micEnabled ? "Mic On" : "Muted"}</span>
        </button>

        <button
          onClick={() => {
            setIsOverlayPinned((prev) => !prev);
            setShowOverlay(true);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-xs backdrop-blur-xl border transition-all cursor-pointer shadow-lg ${
            isOverlayPinned
              ? "bg-indigo-500/80 text-white border-indigo-400"
              : "bg-black/60 text-white/80 border-white/20 hover:bg-black/80 hover:text-white"
          }`}
          title={isOverlayPinned ? "Unpin Voice Overlay" : "Pin Voice Overlay"}
        >
          <Users className="size-4" />
          <span>{participants.length} Online</span>
          {isOverlayPinned && <Pin className="size-3 fill-current ml-0.5" />}
        </button>
      </div>

      {/* Voice Call Overlay (Auto-hides on idle, stays open when hovered or pinned) */}
      <div 
        onMouseEnter={() => { isHoveringOverlayRef.current = true; }}
        onMouseLeave={() => {
          isHoveringOverlayRef.current = false;
          triggerOverlayVisibility();
        }}
        className={`absolute bottom-24 right-6 w-72 max-h-[60vh] overflow-y-auto bg-black/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-4 shadow-2xl transition-all duration-500 z-40 ${
          showOverlay ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-10 pointer-events-none"
        }`}
      >
        <div className="flex items-center justify-between mb-4 px-2">
          <div className="flex items-center gap-2 text-white/80 text-sm font-bold">
            <Users className="size-4" />
            Watch Party
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsOverlayPinned((prev) => !prev)}
              className={`p-1 rounded-full transition ${isOverlayPinned ? "text-indigo-400" : "text-white/40 hover:text-white"}`}
              title={isOverlayPinned ? "Pinned (Always Visible)" : "Click to Pin"}
            >
              <Pin className="size-3.5" />
            </button>
            <button
              onClick={toggleMic}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                micEnabled
                  ? "bg-white/10 text-white hover:bg-white/20"
                  : "bg-red-500/20 text-red-400 hover:bg-red-500/30"
              }`}
            >
              {micEnabled ? <Mic className="size-3" /> : <MicOff className="size-3" />}
              <span>{micEnabled ? "Mic On" : "Muted"}</span>
            </button>
          </div>
        </div>

        <div className="space-y-2.5">
          {participants.map((p) => {
            const displayName = p.name || p.identity || "Guest";
            const isParticipantHost = activeHostIdentity ? p.identity === activeHostIdentity : p.isLocal && initialIsHost;

            return (
              <div key={p.sid} className="flex items-center justify-between bg-white/5 rounded-2xl p-2.5 border border-white/5">
                <div className="flex items-center gap-3">
                  <div className={`relative flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-xs font-bold ${p.isSpeaking ? "ring-2 ring-green-500 ring-offset-1 ring-offset-black" : ""}`}>
                    {displayName.charAt(0).toUpperCase()}
                    <div className="absolute -bottom-1 -right-1 bg-black rounded-full p-0.5">
                      {p.isMicrophoneEnabled ? (
                        <Mic className="size-2.5 text-white" />
                      ) : (
                        <MicOff className="size-2.5 text-red-400" />
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <span className="text-white text-xs font-semibold truncate max-w-[90px]">
                        {displayName}
                      </span>
                      {p.isLocal && <span className="text-white/40 text-[10px]">(You)</span>}
                    </div>
                    {isParticipantHost && (
                      <span className="text-[9px] font-bold text-indigo-400 flex items-center gap-0.5">
                        <Crown className="size-2.5" /> Host
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center text-white">
                  <ConnectionQualityIndicator participant={p} className="opacity-80" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Voice Volume Control */}
        <div className="mt-4 px-2 pt-3 border-t border-white/10">
          <div className="flex items-center gap-3">
            <Volume2 className="size-4 text-white/70" />
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={voiceVolume}
              onChange={(e) => setVoiceVolume(parseFloat(e.target.value))}
              className="w-full accent-white cursor-pointer"
              title="Voice Chat Volume"
            />
          </div>
          <div className="text-[10px] text-white/40 text-center mt-1">Voice Chat Volume</div>
        </div>
      </div>
    </div>
  );
}
