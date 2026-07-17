"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  useParticipants,
  AudioTrack,
  isTrackReference,
  useTracks,
  useRoomContext,
  useLocalParticipant,
  useConnectionState,
} from "@livekit/components-react";
import { Track, ConnectionState, RoomEvent } from "livekit-client";
import { CustomPlayer, type CustomPlayerHandle } from "./custom-player";
import type { MediaDetail } from "@/lib/media";
import { Mic, MicOff, Volume2, VolumeX, Users, Crown, Pin, UserPlus, UserMinus, X, ArrowLeft, Copy, Lock, LogOut, Send, Share, Settings, Play, AlertCircle } from "lucide-react";

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
  const localIdentity = localParticipant?.identity;

  const [activeHostIdentity, setActiveHostIdentity] = useState<string | null>(
    initialHostIdentity || (initialIsHost ? localIdentity || null : null)
  );

  const [micEnabled, setMicEnabled] = useState(true);
  const [voiceVolume, setVolume] = useState(1);
  const [showInviteModal, setShowInviteModal] = useState(false);

  const [partyStatus, setPartyStatus] = useState<"lobby" | "playing">("lobby");
  const [anyoneCanControlState, setAnyoneCanControlState] = useState(anyoneCanControl);
  const [showSettings, setShowSettings] = useState(false);
  const [showVoiceVolume, setShowVoiceVolume] = useState(false);
  const [showEndPartyModal, setShowEndPartyModal] = useState(false);
  const [hasIntentionallyEnded, setHasIntentionallyEnded] = useState(false);

  const connectionState = useConnectionState();
  const isDisconnected = connectionState === ConnectionState.Disconnected;

  // Auto-hiding overlay state
  const [showOverlay, setShowOverlay] = useState(true);
  const [isOverlayPinned, setIsOverlayPinned] = useState(false);
  const hideOverlayTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoveringOverlayRef = useRef(false);

  // Dynamic host status check
  const isEffectiveHost = activeHostIdentity ? localIdentity === activeHostIdentity : initialIsHost;
  const canControl = isEffectiveHost || anyoneCanControlState;

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
      room.localParticipant.publishData(payload, { reliable }).catch(() => { });
    } catch (e) { }
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
    if (!localParticipant) return;
    const isEnabled = localParticipant.isMicrophoneEnabled;
    await localParticipant.setMicrophoneEnabled(!isEnabled);
  };

  // Turn on mic by default when entering player
  useEffect(() => {
    if (localParticipant) {
      localParticipant.setMicrophoneEnabled(true).catch(console.error);
    }
  }, [localParticipant]);

  // Listen to room data events directly
  useEffect(() => {
    const handleDataReceived = (payload: Uint8Array) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));
        if (!playerRef.current) return;

        if (data.type === "start_party") {
          setPartyStatus("playing");
        }

        if (data.type === "update_settings") {
          setAnyoneCanControlState(data.anyoneCanControl);
        }

        if (data.type === "host_sync") {
          if (data.hostIdentity) setActiveHostIdentity(data.hostIdentity);
          setPartyStatus("playing"); // If host is sending sync, party has started

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
          sendData({
            type: "update_settings",
            anyoneCanControl: anyoneCanControlState
          }, true);
          if (partyStatus === "playing" && playerRef.current) {
            broadcastHostSync(playerRef.current.getCurrentTime(), playerRef.current.getIsPlaying());
          }
        }
      } catch (err) { }
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room, isEffectiveHost, broadcastHostSync, partyStatus, anyoneCanControlState, sendData]);

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
    if (!isEffectiveHost || partyStatus !== "playing") return;

    const interval = setInterval(() => {
      if (playerRef.current) {
        const currentTime = playerRef.current.getCurrentTime();
        const isPlaying = playerRef.current.getIsPlaying();
        broadcastHostSync(currentTime, isPlaying);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isEffectiveHost, partyStatus, broadcastHostSync]);

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

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join Watch Party: ${item.title}`,
          url: window.location.href,
        });
      } catch (err) { }
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert("Invite link copied to clipboard!");
    }
  };

  const handleEndParty = () => {
    setShowEndPartyModal(true);
  };

  const confirmEndParty = async () => {
    setHasIntentionallyEnded(true);
    try {
      await fetch("/api/watchparty/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName: room.name }),
      });
    } catch (err) {
      console.error("Failed to end party", err);
    }
    onLeave();
  };

  const handleStartParty = () => {
    setPartyStatus("playing");
    sendData({ type: "start_party" }, true);
    if (playerRef.current) {
      playerRef.current.postCommand("play");
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#060608] text-white p-4 md:p-6 gap-6 overflow-x-hidden select-none">
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

      {/* Top Header */}
      <header className="flex flex-wrap items-center justify-between shrink-0 gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <button onClick={onLeave} className="w-10 h-10 shrink-0 flex items-center justify-center rounded-xl bg-[#111115] border border-white/5 hover:bg-white/10 transition cursor-pointer">
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-white whitespace-nowrap">Watch Party</h1>
            {/* <div className="flex items-center gap-2 mt-0.5 min-w-0">
              <h1 className="text-lg font-bold tracking-[0.2em] truncate">{item.title}</h1>
            </div> */}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <button onClick={() => setShowInviteModal(true)} className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-[#111115] border border-white/5 hover:bg-white/10 transition cursor-pointer" title="Share Invite">
            <Share className="size-4" />
            <span className="text-sm font-bold hidden sm:inline">Share</span>
          </button>
          {isEffectiveHost && (
            <button onClick={handleEndParty} className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition cursor-pointer">
              <LogOut className="size-4" />
              <span className="text-sm font-bold hidden sm:inline">End party</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-col lg:flex-row flex-1 gap-6 min-h-0">

        {/* Video Player Section */}
        <div className="flex-[2] relative rounded-2xl border border-white/5 overflow-hidden bg-black flex flex-col min-w-0 min-h-[40vh] lg:min-h-0">
          <CustomPlayer
            ref={playerRef}
            item={item}
            mediaType={mediaType}
            mediaId={mediaId}
            season={season}
            episode={episode}
            isWatchParty={true}
            onWatchPartyToggle={() => { }}
            showWatchPartyActive={true}
            onVideoEvent={handleVideoEvent}
            autoPlay={partyStatus === "playing"}
            hideBackButton={true}
          />

          {/* Waiting Lobby Overlay */}
          {partyStatus === "lobby" && (
            <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-auto">
              <div className="text-center space-y-6">
                <div className="w-20 h-20 bg-white/5 border border-white/10 rounded-full flex items-center justify-center mx-auto shadow-2xl">
                  <Play className="size-8 text-white ml-1 opacity-50" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold mb-2">Ready to Watch</h2>
                  <p className="text-white/50">
                    {participants.length} {participants.length === 1 ? 'participant is' : 'participants are'} in the room.
                  </p>
                </div>
                {isEffectiveHost ? (
                  <button onClick={handleStartParty} className="bg-white text-black px-8 py-3.5 rounded-xl font-bold hover:scale-105 transition shadow-xl shadow-white/10 cursor-pointer">
                    Start Party
                  </button>
                ) : (
                  <div className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white/70 font-semibold animate-pulse">
                    Waiting for host to start party...
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar Section */}
        <div className="w-full lg:w-[380px] flex flex-col gap-6 shrink-0 h-full lg:h-auto">

          {/* Members Box */}
          <div className="flex-1 rounded-2xl border border-white/5 bg-[#0a0a0c] flex flex-col p-5 relative min-h-[300px]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold">Members</h2>
              <div className="flex items-center gap-2">
                {/* Voice Volume Control */}
                <div className="relative flex flex-col items-center">
                  {showVoiceVolume && (
                    <div className="absolute top-full mt-2 flex flex-col items-center bg-[#15151a] border border-white/10 rounded-xl p-4 w-40 justify-center shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200 z-50 right-0 md:right-auto">
                      <span className="text-xs text-white/50 font-bold uppercase tracking-wider mb-3">Voice Volume</span>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={voiceVolume}
                        onChange={(e) => setVolume(Number(e.target.value))}
                        className="w-full h-1.5 bg-white/20 appearance-none rounded-lg cursor-pointer accent-white"
                        style={{
                          background: `linear-gradient(to right, #ffffff ${voiceVolume * 100}%, rgba(255,255,255,0.2) ${voiceVolume * 100}%)`,
                        }}
                      />
                    </div>
                  )}
                  <button onClick={() => setShowVoiceVolume(!showVoiceVolume)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition cursor-pointer" title="Voice Chat Volume">
                    {voiceVolume === 0 ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                  </button>
                </div>

                {isEffectiveHost && (
                  <button onClick={() => setShowSettings(!showSettings)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition cursor-pointer" title="Participant Settings">
                    <Settings className="size-4" />
                  </button>
                )}
                <span className="text-xs font-bold bg-white/10 px-2.5 py-1 rounded-full text-white/70">{participants.length}/5</span>
              </div>
            </div>

            {/* Host Settings Dropdown */}
            {showSettings && isEffectiveHost && (
              <div className="absolute top-14 right-5 bg-[#15151a] border border-white/10 rounded-xl p-4 shadow-2xl z-40 w-64 animate-in fade-in slide-in-from-top-2">
                <h3 className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3">Host Settings</h3>
                <label className="flex items-center justify-between cursor-pointer group">
                  <span className="text-sm font-semibold text-white/80 group-hover:text-white transition">Allow others to control</span>
                  <input
                    type="checkbox"
                    checked={anyoneCanControlState}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setAnyoneCanControlState(val);
                      sendData({ type: "update_settings", anyoneCanControl: val }, true);
                    }}
                    className="w-4 h-4 rounded accent-white"
                  />
                </label>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {participants.map((p) => {
                const displayName = p.name || p.identity || "Guest";
                const isParticipantHost = activeHostIdentity ? p.identity === activeHostIdentity : p.isLocal && initialIsHost;

                return (
                  <div key={p.sid} className="flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition group">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className={`w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center font-bold shadow-sm ${p.isSpeaking ? "ring-2 ring-green-500 ring-offset-2 ring-offset-[#0a0a0c]" : ""
                          }`}>
                          {displayName.charAt(0).toUpperCase()}
                        </div>
                        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#0a0a0c] ${getQualityColor(p.connectionQuality)}`} />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold truncate max-w-[140px]">{displayName}</span>
                        {p.isLocal && <span className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">You</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isParticipantHost && <Crown className="size-4 text-yellow-500 drop-shadow-md" />}

                      {p.isLocal ? (
                        <button
                          onClick={toggleMic}
                          className="p-1.5 rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition cursor-pointer"
                          title={p.isMicrophoneEnabled ? "Mute Mic" : "Unmute Mic"}
                        >
                          {p.isMicrophoneEnabled ? <Mic className="size-4" /> : <MicOff className="size-4 text-red-400" />}
                        </button>
                      ) : (
                        <div className="flex items-center gap-1">
                          {!p.isMicrophoneEnabled && <MicOff className="size-4 text-white/20" />}
                          {isEffectiveHost && (
                            <button
                              onClick={() => handleKickParticipant(p.identity)}
                              className="p-1.5 rounded-lg text-red-400 opacity-0 group-hover:opacity-100 hover:bg-red-400/10 transition cursor-pointer"
                              title={`Kick ${displayName}`}
                            >
                              <UserMinus className="size-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" style={{ zIndex: 9999 }}>
          <div className="w-full max-w-sm rounded-2xl bg-[#111115] border border-white/10 p-6 flex flex-col relative">
            <button onClick={() => setShowInviteModal(false)} className="absolute top-4 right-4 text-white/40 hover:text-white transition cursor-pointer">
              <X className="size-5" />
            </button>
            <h2 className="text-xl font-bold mb-6 text-center">Invite Friends</h2>
            <div className="p-4 bg-black/50 rounded-xl flex items-center justify-between border border-white/10">
              <span className="text-sm font-mono text-white/80 truncate pr-2">{window.location.href}</span>
              <button onClick={handleShare} className="text-white hover:text-blue-400 transition cursor-pointer">
                <Copy className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End Party Confirmation Modal (For Host) */}
      {showEndPartyModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" style={{ zIndex: 9999 }}>
          <div className="w-full max-w-sm rounded-2xl bg-[#111115] border border-white/10 p-6 flex flex-col items-center text-center shadow-2xl">
            <div className="size-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4 text-red-500">
              <AlertCircle className="size-6" />
            </div>
            <h2 className="text-xl font-bold mb-2">End Watch Party?</h2>
            <p className="text-white/60 text-sm mb-6">
              Are you sure you want to end the watch party? This will disconnect all participants.
            </p>
            <div className="flex w-full gap-3">
              <button
                onClick={() => setShowEndPartyModal(false)}
                className="flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition font-semibold text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmEndParty}
                className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 transition font-bold text-white text-sm cursor-pointer"
              >
                End Party
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disconnected Modal (For Participants) */}
      {isDisconnected && !hasIntentionallyEnded && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" style={{ zIndex: 9999 }}>
          <div className="w-full max-w-sm rounded-2xl bg-[#111115] border border-white/10 p-6 flex flex-col items-center text-center shadow-2xl">
            <div className="size-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4 text-red-500">
              <LogOut className="size-6" />
            </div>
            <h2 className="text-xl font-bold mb-2">Party Ended</h2>
            <p className="text-white/60 text-sm mb-6">
              The host has ended this watch party.
            </p>
            <button
              onClick={onLeave}
              className="w-full py-3 rounded-xl bg-white text-black font-bold hover:bg-white/90 transition cursor-pointer"
            >
              Back to Home
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
