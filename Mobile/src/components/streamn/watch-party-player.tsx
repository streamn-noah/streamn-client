import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  Share,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-remix-icon';
import { Room, RoomEvent, ConnectionState, Participant, RemoteParticipant } from 'livekit-client';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import CustomPlayer, { CustomPlayerHandle } from './custom-player';
import { MediaSummary, MediaType, tmdbImage } from '@/services/media';
import { typography, fontFamilies } from '@/constants/theme';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type WatchPartyPlayerProps = {
  room: Room;
  item: MediaSummary;
  mediaType: MediaType;
  mediaId: number;
  season: number;
  episode: number;
  isHost: boolean;
  initialHostIdentity?: string;
  anyoneCanControl?: boolean;
  onLeave: () => void;
};

export function WatchPartyPlayer({
  room,
  item,
  mediaType,
  mediaId,
  season,
  episode,
  isHost: initialIsHost,
  initialHostIdentity,
  anyoneCanControl = true,
  onLeave,
}: WatchPartyPlayerProps) {
  const insets = useSafeAreaInsets();
  const playerRef = useRef<CustomPlayerHandle>(null);
  const localParticipant = room.localParticipant;
  const localIdentity = localParticipant?.identity;

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [activeHostIdentity, setActiveHostIdentity] = useState<string | null>(
    initialHostIdentity || (initialIsHost ? localIdentity || null : null)
  );

  const [partyStatus, setPartyStatus] = useState<'lobby' | 'playing'>('lobby');
  const [anyoneCanControlState, setAnyoneCanControlState] = useState(anyoneCanControl);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showEndPartyModal, setShowEndPartyModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [selectedMemberOptions, setSelectedMemberOptions] = useState<Participant | null>(null);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [hasIntentionallyEnded, setHasIntentionallyEnded] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [micEnabled, setMicEnabled] = useState(false);
  const [micStates, setMicStates] = useState<Record<string, boolean>>({});

  const requestMicPermission = useCallback(async () => {
    try {
      const { requestRecordingPermissionsAsync } = await import('expo-audio');
      const res = await requestRecordingPermissionsAsync();
      if (res.granted) {
        setMicEnabled(true);
        return;
      }
    } catch (e) {
      try {
        const g = typeof globalThis !== 'undefined' ? (globalThis as any) : {};
        if (g.navigator?.mediaDevices?.getUserMedia) {
          await g.navigator.mediaDevices.getUserMedia({ audio: true });
          setMicEnabled(true);
        }
      } catch (err) {}
    }
  }, []);

  useEffect(() => {
    requestMicPermission();
  }, [requestMicPermission]);

  const toggleMic = async () => {
    try {
      let granted = false;
      const g = typeof globalThis !== 'undefined' ? (globalThis as any) : {};
      if (g.navigator?.mediaDevices?.getUserMedia) {
        await g.navigator.mediaDevices.getUserMedia({ audio: true });
        granted = true;
      } else {
        const { requestRecordingPermissionsAsync } = await import('expo-audio');
        const res = await requestRecordingPermissionsAsync();
        granted = res.granted;
      }

      if (granted) {
        const nextState = !micEnabled;
        setMicEnabled(nextState);
        if (localIdentity) {
          sendData({ type: 'mic_status', sender: localIdentity, micEnabled: nextState }, true);
        }
      }
    } catch (err) {
      Alert.alert('Microphone Permission', 'Microphone permission is required for voice chat.');
    }
  };

  const isEffectiveHost = activeHostIdentity ? localIdentity === activeHostIdentity : initialIsHost;
  const canControl = isEffectiveHost || anyoneCanControlState;
  const ignoreLocalEventsUntilRef = useRef(0);

  // Manage Orientation based on lobby vs playing state
  useEffect(() => {
    if (partyStatus === 'playing') {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    }

    return () => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, [partyStatus]);

  // Update participant list helper
  const updateParticipantList = useCallback(() => {
    const list: Participant[] = [];
    if (room.localParticipant) list.push(room.localParticipant);
    room.remoteParticipants.forEach((p: RemoteParticipant) => list.push(p));
    setParticipants(list);
  }, [room]);

  useEffect(() => {
    if ((room as any).engine) {
      const engine = (room as any).engine;
      engine.negotiate = async () => {};
      engine.ensurePublisherConnected = async () => {};
      engine.verifyTransport = () => true;
      engine.checkConnectionState = () => {};
      engine.transportsConnectedOrConnecting = true;
      if (engine.pcManager) {
        engine.pcManager.negotiate = async () => {};
        engine.pcManager.ensurePCTransportConnection = async () => {};
      }
    }
    (room as any).registerConnectionReconcile = () => {};
    (room as any).clearConnectionReconcile();

    updateParticipantList();

    const handleParticipantConnected = () => updateParticipantList();
    const handleParticipantDisconnected = () => updateParticipantList();
    const handleStateChanged = (state: ConnectionState) => {
      if (state === ConnectionState.Disconnected) {
        setIsDisconnected(true);
      }
    };

    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
    room.on(RoomEvent.ConnectionStateChanged, handleStateChanged);

    return () => {
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected);
      room.off(RoomEvent.ConnectionStateChanged, handleStateChanged);
    };
  }, [room, updateParticipantList]);

  // Safe publish data helper
  const sendData = useCallback(
    (dataObj: object, reliable = true) => {
      if (room.state !== ConnectionState.Connected) return;
      try {
        const jsonStr = JSON.stringify(dataObj);
        const encoder = new TextEncoder();
        const payload = encoder.encode(jsonStr);
        room.localParticipant.publishData(payload, { reliable }).catch(() => {});
      } catch (e) {}
    },
    [room]
  );

  // Host clock sync broadcast
  const broadcastHostSync = useCallback(
    (currentTime: number, isPlaying: boolean) => {
      sendData(
        {
          type: 'host_sync',
          hostIdentity: activeHostIdentity || localIdentity,
          currentTime,
          isPlaying,
          timestamp: Date.now(),
        },
        false
      );
    },
    [sendData, activeHostIdentity, localIdentity]
  );

  // Listen to Room Data Received
  useEffect(() => {
    const handleDataReceived = (payload: Uint8Array) => {
      try {
        const decoder = new TextDecoder();
        const jsonStr = decoder.decode(payload);
        const data = JSON.parse(jsonStr);

        if (data.type === 'mic_status' && data.sender) {
          setMicStates((prev) => ({ ...prev, [data.sender]: data.micEnabled }));
        }

        if (data.type === 'start_party') {
          setPartyStatus('playing');
        }

        if (data.type === 'update_settings') {
          setAnyoneCanControlState(data.anyoneCanControl);
        }

        if (data.type === 'kick_participant') {
          if (data.targetIdentity === localIdentity) {
            Alert.alert('Disconnected', 'You have been removed from the watch party by the host.');
            room.disconnect();
            onLeave();
          }
        }

        if (data.type === 'host_sync' && playerRef.current) {
          if (data.hostIdentity) setActiveHostIdentity(data.hostIdentity);
          setPartyStatus('playing');

          if (!isEffectiveHost) {
            const targetIsPlaying = data.isPlaying;
            const hostTime = data.currentTime;
            const msgTimestamp = data.timestamp || Date.now();
            const latency = (Date.now() - msgTimestamp) / 1000;
            const expectedTime = Math.max(0, hostTime + (targetIsPlaying ? latency : 0));

            const guestTime = playerRef.current?.getCurrentTime() ?? 0;
            const guestPlaying = playerRef.current?.getIsPlaying() ?? false;

            if (targetIsPlaying && !guestPlaying) {
              ignoreLocalEventsUntilRef.current = Date.now() + 1500;
              playerRef.current?.postCommand('play');
            } else if (!targetIsPlaying && guestPlaying) {
              ignoreLocalEventsUntilRef.current = Date.now() + 1500;
              playerRef.current?.postCommand('pause');
            }

            const drift = Math.abs(guestTime - expectedTime);
            if (drift > 1.0 || (expectedTime > 3 && guestTime < 2)) {
              ignoreLocalEventsUntilRef.current = Date.now() + 1500;
              playerRef.current?.postCommand('seek', [expectedTime]);
            }
          }
        }

        if (data.type === 'user_action' && playerRef.current) {
          ignoreLocalEventsUntilRef.current = Date.now() + 1500;

          if (data.action === 'play') {
            playerRef.current?.postCommand('play');
          } else if (data.action === 'pause') {
            playerRef.current?.postCommand('pause');
          } else if (data.action === 'seek') {
            playerRef.current?.postCommand('seek', [data.time]);
          }

          if (isEffectiveHost && playerRef.current) {
            const currentTime = data.action === 'seek' ? data.time : playerRef.current?.getCurrentTime() ?? 0;
            const isPlaying =
              data.action === 'play' ? true : data.action === 'pause' ? false : playerRef.current?.getIsPlaying() ?? true;
            broadcastHostSync(currentTime, isPlaying);
          }
        }

        if (data.type === 'request_host_sync' && isEffectiveHost) {
          sendData(
            {
              type: 'update_settings',
              anyoneCanControl: anyoneCanControlState,
            },
            true
          );
          if (partyStatus === 'playing' && playerRef.current) {
            broadcastHostSync(playerRef.current?.getCurrentTime() ?? 0, playerRef.current?.getIsPlaying() ?? true);
          }
        }
      } catch (err) {}
    };

    room.on(RoomEvent.DataReceived, handleDataReceived);
    return () => {
      room.off(RoomEvent.DataReceived, handleDataReceived);
    };
  }, [room, isEffectiveHost, broadcastHostSync, partyStatus, anyoneCanControlState, sendData, localIdentity, onLeave]);

  // Dynamic host migration if host leaves
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

  // Host heartbeat (every 2 seconds)
  useEffect(() => {
    if (!isEffectiveHost || partyStatus !== 'playing') return;

    const interval = setInterval(() => {
      if (playerRef.current) {
        const currentTime = playerRef.current?.getCurrentTime() ?? 0;
        const isPlaying = playerRef.current?.getIsPlaying() ?? true;
        broadcastHostSync(currentTime, isPlaying);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isEffectiveHost, partyStatus, broadcastHostSync]);

  const requestHostSync = useCallback(() => {
    if (!isEffectiveHost) {
      sendData({ type: 'request_host_sync' }, true);
    }
  }, [isEffectiveHost, sendData]);

  useEffect(() => {
    requestHostSync();
  }, [requestHostSync]);

  const handleVideoEvent = useCallback(
    (type: string, current: number, duration: number) => {
      if (type === 'ready' && !isEffectiveHost) {
        requestHostSync();
        return;
      }

      if (Date.now() < ignoreLocalEventsUntilRef.current) return;
      if (!canControl) return;

      if (type === 'play' || type === 'playing') {
        sendData({ type: 'user_action', action: 'play', sender: localIdentity }, true);
        if (isEffectiveHost) broadcastHostSync(current, true);
      } else if (type === 'pause') {
        sendData({ type: 'user_action', action: 'pause', sender: localIdentity }, true);
        if (isEffectiveHost) broadcastHostSync(current, false);
      } else if (type === 'seeked') {
        sendData({ type: 'user_action', action: 'seek', time: current, sender: localIdentity }, true);
        if (isEffectiveHost) broadcastHostSync(current, playerRef.current?.getIsPlaying() ?? true);
      }
    },
    [canControl, isEffectiveHost, localIdentity, broadcastHostSync, requestHostSync, sendData]
  );

  const handleStartParty = () => {
    setPartyStatus('playing');
    sendData({ type: 'start_party' }, true);
  };

  const handleKickParticipant = (targetIdentity: string) => {
    if (!isEffectiveHost) return;
    sendData({ type: 'kick_participant', targetIdentity }, true);
  };

  const confirmEndParty = async () => {
    setHasIntentionallyEnded(true);
    const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://streamn.vercel.app';
    try {
      await fetch(`${baseUrl}/api/watchparty/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomName: room.name }),
      });
    } catch (err) {
      console.error('Failed to end party', err);
    }
    room.disconnect();
    onLeave();
  };

  const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://streamn.vercel.app';
  const inviteLink = `${baseUrl}/watchparty/${room.name}?mediaType=${mediaType}&mediaId=${mediaId}&s=${season}&e=${episode}`;

  const handleCopyInvite = async () => {
    try {
      await Clipboard.setStringAsync(inviteLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (e) {}
  };

  const handleShareInvite = async () => {
    try {
      await Share.share({
        message: `Join my Watch Party: ${inviteLink}`,
        title: `Join Watch Party: ${item.title}`,
      });
    } catch (e) {}
  };

  // Render Full-Screen Custom Player when in "playing" state
  if (partyStatus === 'playing') {
    return (
      <View style={styles.fullscreenPlayerContainer}>
        <CustomPlayer
          ref={playerRef}
          item={item}
          mediaType={mediaType}
          mediaId={mediaId}
          season={season}
          episode={episode}
          isWatchParty={true}
          onWatchPartyToggle={() => setShowMembersModal(true)}
          onVideoEvent={handleVideoEvent}
          autoPlay={true}
          onClose={() => {
            room.disconnect();
            onLeave();
          }}
        />

        {/* Watch Party Members Overlay Modal inside Player */}
        <Modal
          visible={showMembersModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowMembersModal(false)}
        >
          <View style={styles.membersModalOverlay}>
            <View style={styles.membersModalContent}>
              <View style={styles.membersModalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon name="group-line" size={20} color="#00D2FF" />
                  <Text style={styles.membersModalTitle}>Watch Party Members ({participants.length})</Text>
                </View>
                <TouchableOpacity
                  style={styles.closeBtnSmall}
                  onPress={() => setShowMembersModal(false)}
                  activeOpacity={0.7}
                >
                  <Icon name="close-line" size={20} color="rgba(255,255,255,0.7)" />
                </TouchableOpacity>
              </View>

              {/* Host Settings Toggle */}
              {isEffectiveHost && (
                <View style={styles.hostSettingsBox}>
                  <Text style={styles.hostSettingsTitle}>HOST PERMISSIONS</Text>
                  <TouchableOpacity
                    style={styles.toggleRow}
                    activeOpacity={0.8}
                    onPress={() => {
                      const nextVal = !anyoneCanControlState;
                      setAnyoneCanControlState(nextVal);
                      sendData({ type: 'update_settings', anyoneCanControl: nextVal }, true);
                    }}
                  >
                    <Text style={styles.toggleText}>Allow others to control playback</Text>
                    <Icon
                      name={anyoneCanControlState ? 'checkbox-circle-fill' : 'close-circle-line'}
                      size={22}
                      color={anyoneCanControlState ? '#00D2FF' : 'rgba(255,255,255,0.3)'}
                    />
                  </TouchableOpacity>
                </View>
              )}

              {/* Participant List */}
              <ScrollView style={styles.membersScrollList} showsVerticalScrollIndicator={false}>
                {participants.map((p) => {
                  const displayName = p.name || p.identity || 'Guest';
                  const isParticipantHost = activeHostIdentity
                    ? p.identity === activeHostIdentity
                    : p.isLocal && initialIsHost;
                  const isMe = p.isLocal;

                  return (
                    <View key={p.sid || p.identity} style={styles.memberRow}>
                      <View style={styles.memberRowLeft}>
                        <View style={[styles.avatarCircle, isParticipantHost && styles.hostAvatarCircle]}>
                          <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
                        </View>
                        <View style={{ marginLeft: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={styles.memberName} numberOfLines={1}>
                              {displayName}
                            </Text>
                            {isParticipantHost && <Icon name="vip-crown-fill" size={14} color="#FFD700" />}
                          </View>
                          {isMe && <Text style={styles.youBadge}>You</Text>}
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {isMe && (
                          <TouchableOpacity
                            style={[
                              styles.micBtn,
                              micEnabled && { backgroundColor: 'rgba(0,210,255,0.15)', borderColor: '#00D2FF' },
                            ]}
                            onPress={toggleMic}
                            activeOpacity={0.7}
                          >
                            <Icon
                              name={micEnabled ? 'mic-line' : 'mic-off-line'}
                              size={16}
                              color={micEnabled ? '#00D2FF' : 'rgba(255,255,255,0.4)'}
                            />
                          </TouchableOpacity>
                        )}
                        {isEffectiveHost && !isMe && (
                          <TouchableOpacity
                            style={styles.kickBtn}
                            onPress={() => handleKickParticipant(p.identity)}
                            activeOpacity={0.7}
                          >
                            <Icon name="user-unfollow-line" size={16} color="#FF4D4D" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </ScrollView>

              {/* Footer Actions */}
              <View style={styles.membersModalFooter}>
                <TouchableOpacity
                  style={styles.inviteActionBtn}
                  onPress={() => {
                    setShowMembersModal(false);
                    setShowInviteModal(true);
                  }}
                  activeOpacity={0.8}
                >
                  <Icon name="share-line" size={16} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={styles.inviteActionText}>Share Invite</Text>
                </TouchableOpacity>

                {isEffectiveHost && (
                  <TouchableOpacity
                    style={styles.endPartyActionBtn}
                    onPress={() => {
                      setShowMembersModal(false);
                      setShowEndPartyModal(true);
                    }}
                    activeOpacity={0.8}
                  >
                    <Icon name="logout-box-r-line" size={16} color="#FF4D4D" style={{ marginRight: 6 }} />
                    <Text style={styles.endPartyActionText}>End Party</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </Modal>

        {/* Invite Modal */}
        <Modal visible={showInviteModal} transparent animationType="fade" onRequestClose={() => setShowInviteModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowInviteModal(false)} activeOpacity={0.7}>
                <Icon name="close-line" size={20} color="rgba(255,255,255,0.6)" />
              </TouchableOpacity>

              <Text style={styles.modalTitle}>Invite Friends</Text>
              <Text style={styles.modalSubtitle}>Share this room link with friends to watch together.</Text>

              <View style={styles.inviteLinkBox}>
                <Text style={styles.inviteLinkText} numberOfLines={1}>
                  {inviteLink}
                </Text>
                <TouchableOpacity style={styles.copyIconBtn} onPress={handleCopyInvite} activeOpacity={0.8}>
                  <Icon name={copiedLink ? 'check-line' : 'file-copy-line'} size={18} color="#000" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.shareActionBtn} onPress={handleShareInvite} activeOpacity={0.8}>
                <Icon name="share-forward-line" size={18} color="#000" style={{ marginRight: 6 }} />
                <Text style={styles.shareActionText}>Share Link</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* End Party Confirmation Modal */}
        <Modal visible={showEndPartyModal} transparent animationType="fade" onRequestClose={() => setShowEndPartyModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.dangerIconCircle}>
                <Icon name="error-warning-line" size={28} color="#FF4D4D" />
              </View>
              <Text style={styles.modalTitle}>End Watch Party?</Text>
              <Text style={styles.modalSubtitle}>
                Are you sure you want to end the watch party? This will disconnect all participants.
              </Text>

              <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 12 }}>
                <TouchableOpacity
                  style={[styles.dialogBtn, { backgroundColor: 'rgba(255,255,255,0.1)' }]}
                  onPress={() => setShowEndPartyModal(false)}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontFamily: fontFamilies.bodyBold, color: '#fff', fontSize: 14 }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.dialogBtn, { backgroundColor: '#FF4D4D' }]}
                  onPress={confirmEndParty}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontFamily: fontFamilies.bodyBold, color: '#fff', fontSize: 14 }}>End Party</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Disconnected Modal */}
        <Modal visible={isDisconnected && !hasIntentionallyEnded} transparent animationType="fade" onRequestClose={onLeave}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.dangerIconCircle}>
                <Icon name="logout-box-r-line" size={28} color="#FF4D4D" />
              </View>
              <Text style={styles.modalTitle}>Party Ended</Text>
              <Text style={styles.modalSubtitle}>The host has ended this watch party.</Text>

              <TouchableOpacity style={styles.shareActionBtn} onPress={onLeave} activeOpacity={0.8}>
                <Text style={styles.shareActionText}>Back to Home</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // Pre-Lobby Screen (Portrait Mode)
  return (
    <View style={styles.container}>
      {/* Artwork Backdrop */}
      {item.backdropPath || item.posterPath ? (
        <Image
          source={{ uri: tmdbImage(item.backdropPath || item.posterPath, 'w1280') }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
        />
      ) : null}
      <LinearGradient
        colors={['rgba(6,6,8,0.7)', 'rgba(6,6,8,0.92)', '#060608']}
        locations={[0, 0.4, 0.9]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={[styles.lobbyHeader, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => {
            room.disconnect();
            onLeave();
          }}
          activeOpacity={0.7}
        >
          <Icon name="arrow-left-line" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.lobbyHeaderTitle}>Watch Party Lobby</Text>
        <TouchableOpacity style={styles.headerBtn} onPress={() => setShowInviteModal(true)} activeOpacity={0.7}>
          <Icon name="share-line" size={18} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.lobbyScrollContent} showsVerticalScrollIndicator={false}>
        {/* Media Preview Card */}
        <View style={styles.lobbyMediaCard}>
          {item.posterPath ? (
            <Image source={{ uri: tmdbImage(item.posterPath, 'w342') }} style={styles.lobbyPoster} contentFit="cover" />
          ) : (
            <View style={[styles.lobbyPoster, styles.emptyPoster]}>
              <Icon name="film-line" size={28} color="rgba(255,255,255,0.3)" />
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text style={styles.lobbyMediaTitle} numberOfLines={2}>
              {item.title}
            </Text>
            {mediaType === 'tv' && (
              <Text style={styles.lobbyMediaSubtitle}>
                {`Season ${season} · Episode ${episode}`}
              </Text>
            )}
            <View style={styles.roleTag}>
              <Icon name={isEffectiveHost ? 'vip-crown-fill' : 'group-line'} size={14} color="#00D2FF" />
              <Text style={styles.roleTagText}>{isEffectiveHost ? 'Host' : 'Participant'}</Text>
            </View>
          </View>
        </View>

        {/* Room Members Section */}
        <View style={styles.lobbyMembersCard}>
          <View style={styles.lobbyMembersHeader}>
            <Text style={styles.lobbyMembersTitle}>Members</Text>
            <View style={styles.lobbyHeaderRightControls}>
              <TouchableOpacity style={styles.iconCircleBtn} onPress={toggleMic} activeOpacity={0.7}>
                <Icon
                  name={micEnabled ? 'mic-line' : 'mic-off-line'}
                  size={18}
                  color={micEnabled ? '#fff' : 'rgba(255,255,255,0.4)'}
                />
              </TouchableOpacity>

              {isEffectiveHost && (
                <TouchableOpacity
                  style={styles.iconCircleBtn}
                  onPress={() => setShowSettingsModal(true)}
                  activeOpacity={0.7}
                >
                  <Icon name="settings-3-line" size={18} color="#fff" />
                </TouchableOpacity>
              )}

              <View style={styles.memberCountBadge}>
                <Text style={styles.memberCountBadgeText}>{`${participants.length}/5`}</Text>
              </View>
            </View>
          </View>

          {/* Vertical Members List */}
          <View style={styles.verticalMembersList}>
            {participants.map((p) => {
              const displayName = p.name || p.identity || 'Guest';
              const isParticipantHost = activeHostIdentity
                ? p.identity === activeHostIdentity
                : p.isLocal && initialIsHost;
              const isMe = p.isLocal;

              return (
                <View key={p.sid || p.identity} style={styles.verticalMemberRow}>
                  <View style={styles.memberRowLeftInfo}>
                    <View style={styles.avatarWrapper}>
                      <View style={styles.avatarCircleVertical}>
                        <Text style={styles.avatarTextVertical}>
                          {displayName.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.onlineDot} />
                    </View>

                    <View style={styles.memberTextContainer}>
                      <Text style={styles.verticalMemberName} numberOfLines={1}>
                        {displayName}
                      </Text>
                      {isMe && <Text style={styles.youSubtext}>YOU</Text>}
                    </View>
                  </View>

                  <View style={styles.memberRowRightControls}>
                    {isParticipantHost && (
                      <View style={styles.hostCrownContainer}>
                        <Icon name="vip-crown-fill" size={16} color="#00D2FF" />
                      </View>
                    )}

                    {isMe ? (
                      <TouchableOpacity
                        style={styles.memberControlIconBtn}
                        onPress={toggleMic}
                        activeOpacity={0.7}
                      >
                        <Icon
                          name={micEnabled ? 'mic-line' : 'mic-off-line'}
                          size={18}
                          color={micEnabled ? '#fff' : 'rgba(255,255,255,0.4)'}
                        />
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity style={styles.memberControlIconBtn} activeOpacity={0.7}>
                        <Icon name="mic-line" size={18} color="rgba(255,255,255,0.6)" />
                      </TouchableOpacity>
                    )}

                    {isEffectiveHost && !isMe && (
                      <TouchableOpacity
                        style={styles.memberControlIconBtn}
                        onPress={() => setSelectedMemberOptions(p)}
                        activeOpacity={0.7}
                      >
                        <Icon name="more-fill" size={18} color="rgba(255,255,255,0.6)" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* CTA Buttons Box */}
        <View style={styles.lobbyCtaBox}>
          {isEffectiveHost ? (
            <TouchableOpacity style={styles.primaryWhiteBtn} onPress={handleStartParty} activeOpacity={0.85}>
              <Icon name="play-fill" size={20} color="#000" style={{ marginRight: 8 }} />
              <Text style={styles.primaryWhiteBtnText}>Start Party</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.primaryWhiteBtn} onPress={() => setPartyStatus('playing')} activeOpacity={0.85}>
              <Icon name="play-fill" size={20} color="#000" style={{ marginRight: 8 }} />
              <Text style={styles.primaryWhiteBtnText}>Join Watch Party</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.secondarySubtleBtn}
            onPress={() => setShowEndPartyModal(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.secondarySubtleBtnText}>
              {isEffectiveHost ? 'End Party' : 'Leave Party'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Settings Modal */}
      <Modal visible={showSettingsModal} transparent animationType="fade" onRequestClose={() => setShowSettingsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowSettingsModal(false)} activeOpacity={0.7}>
              <Icon name="close-line" size={20} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>Room Settings</Text>
            <Text style={styles.modalSubtitle}>Control participant permissions for this room.</Text>

            <TouchableOpacity
              style={styles.settingsToggleRow}
              activeOpacity={0.8}
              onPress={() => {
                const nextVal = !anyoneCanControlState;
                setAnyoneCanControlState(nextVal);
                sendData({ type: 'update_settings', anyoneCanControl: nextVal }, true);
              }}
            >
              <Text style={styles.settingsToggleLabel}>Allow members to control player</Text>
              <Icon
                name={anyoneCanControlState ? 'checkbox-circle-fill' : 'close-circle-line'}
                size={24}
                color={anyoneCanControlState ? '#fff' : 'rgba(255,255,255,0.3)'}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.primaryWhiteBtn, { marginTop: 20 }]}
              onPress={() => setShowSettingsModal(false)}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryWhiteBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Member Options Modal */}
      <Modal visible={!!selectedMemberOptions} transparent animationType="fade" onRequestClose={() => setSelectedMemberOptions(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSelectedMemberOptions(null)} activeOpacity={0.7}>
              <Icon name="close-line" size={20} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>Member Options</Text>
            <Text style={styles.modalSubtitle}>
              {selectedMemberOptions?.name || selectedMemberOptions?.identity}
            </Text>

            <TouchableOpacity
              style={styles.dangerActionBtn}
              onPress={() => {
                if (selectedMemberOptions) {
                  handleKickParticipant(selectedMemberOptions.identity);
                  setSelectedMemberOptions(null);
                }
              }}
              activeOpacity={0.8}
            >
              <Icon name="user-unfollow-line" size={18} color="#FF4D4D" style={{ marginRight: 8 }} />
              <Text style={styles.dangerActionText}>Remove from Watch Party</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* End Party Confirmation Modal */}
      <Modal visible={showEndPartyModal} transparent animationType="fade" onRequestClose={() => setShowEndPartyModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.dangerIconCircle}>
              <Icon name="error-warning-line" size={28} color="#FF4D4D" />
            </View>
            <Text style={styles.modalTitle}>{isEffectiveHost ? 'End Watch Party?' : 'Leave Watch Party?'}</Text>
            <Text style={styles.modalSubtitle}>
              {isEffectiveHost
                ? 'Are you sure you want to end the watch party? This will disconnect all participants.'
                : 'Are you sure you want to leave the watch party?'}
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, width: '100%', marginTop: 12 }}>
              <TouchableOpacity
                style={[styles.dialogBtn, { backgroundColor: 'rgba(255,255,255,0.1)' }]}
                onPress={() => setShowEndPartyModal(false)}
                activeOpacity={0.8}
              >
                <Text style={{ fontFamily: fontFamilies.bodyBold, color: '#fff', fontSize: 14 }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dialogBtn, { backgroundColor: '#FF4D4D' }]}
                onPress={() => {
                  setShowEndPartyModal(false);
                  if (isEffectiveHost) {
                    confirmEndParty();
                  } else {
                    room.disconnect();
                    onLeave();
                  }
                }}
                activeOpacity={0.8}
              >
                <Text style={{ fontFamily: fontFamilies.bodyBold, color: '#fff', fontSize: 14 }}>
                  {isEffectiveHost ? 'End Party' : 'Leave Party'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Invite Modal */}
      <Modal visible={showInviteModal} transparent animationType="fade" onRequestClose={() => setShowInviteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowInviteModal(false)} activeOpacity={0.7}>
              <Icon name="close-line" size={20} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>

            <Text style={styles.modalTitle}>Invite Friends</Text>
            <Text style={styles.modalSubtitle}>Share this room link with friends to watch together.</Text>

            <View style={styles.inviteLinkBox}>
              <Text style={styles.inviteLinkText} numberOfLines={1}>
                {inviteLink}
              </Text>
              <TouchableOpacity style={styles.copyIconBtn} onPress={handleCopyInvite} activeOpacity={0.8}>
                <Icon name={copiedLink ? 'check-line' : 'file-copy-line'} size={18} color="#000" />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.primaryWhiteBtn} onPress={handleShareInvite} activeOpacity={0.8}>
              <Icon name="share-forward-line" size={18} color="#000" style={{ marginRight: 6 }} />
              <Text style={styles.primaryWhiteBtnText}>Share Link</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Disconnected Modal */}
      <Modal visible={isDisconnected && !hasIntentionallyEnded} transparent animationType="fade" onRequestClose={onLeave}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.dangerIconCircle}>
              <Icon name="logout-box-r-line" size={28} color="#FF4D4D" />
            </View>
            <Text style={styles.modalTitle}>Party Ended</Text>
            <Text style={styles.modalSubtitle}>The host has ended this watch party.</Text>

            <TouchableOpacity style={styles.primaryWhiteBtn} onPress={onLeave} activeOpacity={0.8}>
              <Text style={styles.primaryWhiteBtnText}>Back to Home</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060608',
  },
  fullscreenPlayerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  lobbyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    zIndex: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lobbyHeaderTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 18,
    color: '#fff',
  },
  lobbyScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 20,
  },
  lobbyMediaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 16,
    gap: 16,
    marginTop: 20,
  },
  lobbyPoster: {
    width: 64,
    height: 94,
    borderRadius: 14,
  },
  emptyPoster: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lobbyMediaTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 18,
    color: '#fff',
    marginBottom: 4,
  },
  lobbyMediaSubtitle: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 8,
  },
  roleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,210,255,0.12)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  roleTagText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
    color: '#00D2FF',
  },
  lobbyMembersCard: {
    backgroundColor: '#111115',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 20,
  },
  lobbyMembersHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  lobbyMembersTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 16,
    color: '#fff',
  },
  lobbyHeaderRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  memberCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  memberCountBadgeText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  verticalMembersList: {
    gap: 12,
  },
  verticalMemberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  memberRowLeftInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarCircleVertical: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarTextVertical: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 18,
    color: '#fff',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#111115',
  },
  memberTextContainer: {
    flex: 1,
  },
  verticalMemberName: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 15,
    color: '#fff',
  },
  youSubtext: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 1,
    letterSpacing: 0.5,
  },
  memberRowRightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hostCrownContainer: {
    marginRight: 2,
  },
  memberControlIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lobbyCtaBox: {
    gap: 10,
    marginTop: 10,
  },
  primaryWhiteBtn: {
    width: '100%',
    height: 50,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryWhiteBtnText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 15,
    color: '#000000',
  },
  secondarySubtleBtn: {
    width: '100%',
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondarySubtleBtnText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
  settingsToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    borderRadius: 16,
    marginTop: 12,
  },
  settingsToggleLabel: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 14,
    color: '#fff',
    flex: 1,
  },
  dangerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(255,77,77,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,77,77,0.25)',
    marginTop: 16,
  },
  dangerActionText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 14,
    color: '#FF4D4D',
  },
  membersModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  membersModalContent: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: '#111115',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 20,
  },
  membersModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  membersModalTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 16,
    color: '#fff',
  },
  closeBtnSmall: {
    padding: 4,
  },
  hostSettingsBox: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  hostSettingsTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    letterSpacing: 1,
    marginBottom: 6,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleText: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 13,
    color: '#fff',
  },
  membersScrollList: {
    maxHeight: 220,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  memberRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hostAvatarCircle: {
    backgroundColor: '#6366F1',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  avatarText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 14,
    color: '#fff',
  },
  memberName: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 14,
    color: '#fff',
  },
  youBadge: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 9,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
  },
  kickBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,77,77,0.1)',
  },
  membersModalFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  inviteActionBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteActionText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 13,
    color: '#fff',
  },
  endPartyActionBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,77,77,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,77,77,0.3)',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  endPartyActionText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 13,
    color: '#FF4D4D',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#111115',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 20,
    alignItems: 'center',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    padding: 4,
  },
  modalTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 18,
    color: '#fff',
    marginBottom: 6,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginBottom: 16,
  },
  inviteLinkBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  inviteLinkText: {
    flex: 1,
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.7)',
    marginRight: 8,
  },
  copyIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareActionBtn: {
    width: '100%',
    height: 44,
    borderRadius: 12,
    backgroundColor: '#00D2FF',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shareActionText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 14,
    color: '#000',
  },
  dangerIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,77,77,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  dialogBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
});
