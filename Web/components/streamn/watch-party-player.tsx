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
import { CustomPlayer, type CustomPlayerHandle } from "./custom-player";
import type { MediaDetail } from "@/lib/media";
import { Mic, MicOff, Volume2, VolumeX, Users, Crown, Pin, UserPlus, UserMinus, X } from "lucide-react";

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
  const playerRef = useRef<CustomPlayerHandle>(null);
  const participants = useParticipants();
  const audioTracks = useTracks([Track.Source.Microphone]);
  const { localParticipant } = useLocalParticipant();
  const localIdentity = localParticipant.identity;

  const [activeHostIdentity, setActiveHostIdentity] = useState<string | null>(
    initialHostIdentity || (initialIsHost ? localIdentity : null)
  );

  const [micEnabled, setMicEnabled] = useState(true);
  const [voiceVolume, setVolume] = useState(1);
  const [showDashboard, setShowDashboard] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);

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

  const handleKickParticipant = (targetIdentity: string) => {
    if (!isEffectiveHost) return;
    sendData({
      type: "kick_participant",
      targetIdentity,
    }, true);
  };

  const getQualityColor = (quality?: string) => {
    const q = String(quality || "").toLowerCase();
    if (q === "excellent" || q === "good") return "bg-green-500";
    if (q === "poor") return "bg-yellow-500";
    return "bg-red-500"; // lost, unknown, bad
  };

  return (
    <div className="flex flex-col h-screen bg-[#08080a] text-white overflow-hidden select-none">
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

      {/* Video Player Section */}
      <div className="flex-1 relative w-full h-0 min-h-0 bg-black">
        <CustomPlayer
          ref={playerRef}
          item={item}
          mediaType={mediaType}
          mediaId={mediaId}
          season={season}
          episode={episode}
          isWatchParty={true}
          onWatchPartyToggle={() => setShowDashboard(!showDashboard)}
          showWatchPartyActive={showDashboard}
          onVideoEvent={handleVideoEvent}
        />
      </div>

      {/* Compact Bottom Watch Party Bar */}
      {showDashboard && (
        <div className="h-16 shrink-0 bg-black border-t border-white/10 px-6 flex items-center justify-between z-40">
          
          {/* Left/Center: Avatars & Invite button in a natural progression */}
          <div className="flex items-center gap-3">
            {participants.map((p) => {
              const displayName = p.name || p.identity || "Guest";
              const isParticipantHost = activeHostIdentity ? p.identity === activeHostIdentity : p.isLocal && initialIsHost;

              return (
                <div
                  key={p.sid}
                  className="relative group/avatar"
                >
                  {/* Circle Avatar */}
                  <div className={`relative flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-sm font-black shrink-0 ${
                    p.isSpeaking ? "ring-2 ring-green-500 ring-offset-1 ring-offset-black" : ""
                  }`}
                  title={displayName}
                  >
                    {displayName.charAt(0).toUpperCase()}

                    {/* Network Quality Indicator Dot */}
                    <div 
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border border-black ${getQualityColor(p.connectionQuality)}`}
                      title={`Connection Quality: ${p.connectionQuality}`}
                    />

                    {/* Host crown badge */}
                    {isParticipantHost && (
                      <div className="absolute -top-1 -left-1 bg-black rounded-full p-0.5 border border-white/10 text-indigo-400">
                        <Crown className="size-3.5" />
                      </div>
                    )}
                  </div>

                  {/* Compact Hover Actions: Mute local user / Kick other user */}
                  {p.isLocal ? (
                    <button
                      onClick={toggleMic}
                      className="absolute inset-0 flex items-center justify-center bg-black/75 rounded-full opacity-0 group-hover/avatar:opacity-100 transition cursor-pointer text-white"
                      title={micEnabled ? "Mute Mic" : "Unmute Mic"}
                    >
                      {micEnabled ? <Mic className="size-4" /> : <MicOff className="size-4 text-red-400" />}
                    </button>
                  ) : (
                    isEffectiveHost && (
                      <button
                        onClick={() => handleKickParticipant(p.identity)}
                        className="absolute inset-0 flex items-center justify-center bg-red-500/80 rounded-full opacity-0 group-hover/avatar:opacity-100 transition cursor-pointer text-white"
                        title={`Kick ${displayName}`}
                      >
                        <UserMinus className="size-4" />
                      </button>
                    )
                  )}

                  {/* Muted Mic Indicator (visible when not hovered) */}
                  {!p.isMicrophoneEnabled && (
                    <div className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5 border border-white/10 text-white scale-75 pointer-events-none">
                      <MicOff className="size-2.5" />
                    </div>
                  )}
                </div>
              );
            })}

            {/* Invite button: a natural progression next to avatars */}
            <button
              onClick={() => setShowInviteModal(true)}
              className="w-10 h-10 rounded-full bg-white/10 text-white/80 hover:bg-white/20 hover:text-white flex items-center justify-center transition cursor-pointer"
              title="Invite Friends"
            >
              <UserPlus className="size-4" />
            </button>
          </div>

          {/* Right: Vertical Volume slider popover */}
          <div className="relative flex items-center group/voice-vol h-full">
            <div className="absolute bottom-full right-0 mb-2 hidden group-hover/voice-vol:flex flex-col items-center bg-[#0d0d11] border border-white/10 rounded-2xl p-3 shadow-2xl z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={voiceVolume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                style={{ writingMode: "vertical-lr", direction: "rtl" }}
                className="h-20 cursor-pointer accent-white vertical-range"
              />
              <span className="text-[9px] text-white/50 font-black mt-2">{Math.round(voiceVolume * 100)}%</span>
            </div>
            <button
              className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/5 transition"
              title="Voice Call Volume"
            >
              {voiceVolume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
            </button>
          </div>

        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="relative max-w-sm w-full bg-neutral-900 border border-white/10 rounded-2xl p-5 shadow-2xl text-white text-center">
            <button
              onClick={() => setShowInviteModal(false)}
              className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition cursor-pointer"
            >
              <X className="size-4" />
            </button>
            <h3 className="text-sm font-bold text-white/50 uppercase tracking-wider mb-3">Share Invite Link</h3>
            <div className="flex items-center gap-2 bg-black/50 p-2.5 rounded-xl border border-white/5">
              <span className="text-xs truncate flex-1 text-white/70 select-all font-mono">
                {window.location.href}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  alert("Invite link copied to clipboard!");
                }}
                className="bg-white text-black text-xs font-bold px-3 py-1.5 rounded-lg hover:bg-white/90 transition cursor-pointer"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
