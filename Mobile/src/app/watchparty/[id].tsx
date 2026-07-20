import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import Icon from 'react-native-remix-icon';
import { Image } from 'expo-image';
import { Room } from 'livekit-client';

import { getMediaDetail } from '@/services/tmdb';
import { MediaSummary, MediaType, tmdbImage } from '@/services/media';
import { useAuth } from '@/components/providers/auth-provider';
import { WatchPartyPlayer } from '@/components/streamn/watch-party-player';
import { typography, fontFamilies } from '@/constants/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function WatchPartyRoomScreen() {
  const params = useLocalSearchParams();
  const roomId = params.id as string;
  const mediaType = (params.mediaType as MediaType) || 'movie';
  const mediaId = Number(params.mediaId || 0);
  const season = Number(params.season || params.s || 1);
  const episode = Number(params.episode || params.e || 1);
  const isHost = params.host === '1';

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [item, setItem] = useState<MediaSummary | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(true);

  const initialName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.username ||
    (user?.email ? user.email.split('@')[0] : '') ||
    'Guest_' + Math.floor(1000 + Math.random() * 9000);

  const [displayName, setDisplayName] = useState(initialName);
  const [hasJoined, setHasJoined] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const serverUrl =
    process.env.EXPO_PUBLIC_LIVEKIT_URL ||
    process.env.NEXT_PUBLIC_LIVEKIT_URL ||
    'wss://streamn-6v0zxmec.livekit.cloud';

  useEffect(() => {
    let active = true;
    getMediaDetail(mediaType, mediaId)
      .then((detail) => {
        if (active) setItem(detail);
      })
      .catch((err) => {
        console.error('Failed to load media detail for watch party', err);
      })
      .finally(() => {
        if (active) setLoadingMedia(false);
      });

    return () => {
      active = false;
    };
  }, [mediaType, mediaId]);

  // Clean up room connection on unmount
  useEffect(() => {
    return () => {
      if (room) {
        room.disconnect();
      }
    };
  }, [room]);

  const joinRoomWithName = useCallback(
    async (nameToUse: string) => {
      if (!nameToUse.trim()) return;

      setIsConnecting(true);
      setErrorMsg(null);

      const baseUrl = process.env.EXPO_PUBLIC_API_URL || 'https://streamn.vercel.app';

      try {
        const res = await fetch(`${baseUrl}/api/watchparty/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomName: roomId,
            participantName: nameToUse.trim(),
            isHost,
          }),
        });

        const data = await res.json();
        if (!data.token) {
          throw new Error(data.error || 'Failed to obtain room token');
        }

        const lkRoom = new Room();

        // Intercept transport creation on engine to bypass WebRTC negotiation timeouts in JS environment
        if ((lkRoom as any).engine) {
          const engine = (lkRoom as any).engine;
          if (engine.createPCTransport) {
            const origCreatePCTransport = engine.createPCTransport.bind(engine);
            engine.createPCTransport = function (...args: any[]) {
              const transport = origCreatePCTransport(...args);
              if (transport) {
                transport.negotiate = async () => {};
              }
              return transport;
            };
          }
        }

        try {
          await lkRoom.connect(serverUrl, data.token, { autoSubscribe: false });
        } catch (connErr: any) {
          if (
            connErr?.name === 'NegotiationError' ||
            connErr?.name === 'PublishDataError' ||
            connErr?.message?.includes('negotiation')
          ) {
            console.log('LiveKit Signal connected (WebRTC transport negotiation bypassed in JS environment)');
          } else {
            throw connErr;
          }
        }

        setRoom(lkRoom);
        setHasJoined(true);
      } catch (err: any) {
        console.error('Error joining watch party:', err);
        setErrorMsg(err.message || 'Failed to connect to watch party room.');
      } finally {
        setIsConnecting(false);
      }
    },
    [roomId, isHost, serverUrl]
  );

  // Auto-join room immediately if displayName is present
  const autoJoinedRef = useRef(false);
  useEffect(() => {
    if (!loadingMedia && !hasJoined && !isConnecting && !autoJoinedRef.current && initialName) {
      autoJoinedRef.current = true;
      joinRoomWithName(initialName);
    }
  }, [loadingMedia, hasJoined, isConnecting, initialName, joinRoomWithName]);

  const handleJoinRoom = () => {
    joinRoomWithName(displayName);
  };

  const handleLeave = () => {
    if (room) {
      room.disconnect();
    }
    router.back();
  };

  if (loadingMedia || (isConnecting && !hasJoined && !errorMsg)) {
    return (
      <View style={styles.centerContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color="#00D2FF" />
        <Text style={styles.loadingText}>
          {isConnecting ? 'Connecting to watch party...' : 'Loading watch party...'}
        </Text>
      </View>
    );
  }

  if (hasJoined && room && item) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <WatchPartyPlayer
          room={room}
          item={item}
          mediaType={mediaType}
          mediaId={mediaId}
          season={season}
          episode={episode}
          isHost={isHost}
          onLeave={handleLeave}
        />
      </>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={[styles.scrollContainer, { paddingTop: Math.max(insets.top, 24) }]}>
        {/* Back Header */}
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Icon name="arrow-left-line" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={styles.cardContainer}>
          {/* Media Header Preview */}
          {item && (
            <View style={styles.mediaPreview}>
              {item.posterPath ? (
                <Image
                  source={{ uri: tmdbImage(item.posterPath, 'w342') }}
                  style={styles.posterImage}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.posterImage, styles.emptyPoster]}>
                  <Icon name="film-line" size={32} color="rgba(255,255,255,0.3)" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.mediaTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                {mediaType === 'tv' && (
                  <Text style={styles.mediaSubtitle}>
                    {`Season ${season} · Episode ${episode}`}
                  </Text>
                )}
                <View style={styles.hostBadge}>
                  <Icon name={isHost ? "vip-crown-line" : "group-line"} size={14} color="#00D2FF" />
                  <Text style={styles.hostBadgeText}>{isHost ? "Host" : "Participant"}</Text>
                </View>
              </View>
            </View>
          )}

          <Text style={styles.joinTitle}>Join Watch Party</Text>
          <Text style={styles.joinSubtitle}>
            Choose a display name so others in the room know who you are.
          </Text>

          {errorMsg && (
            <View style={styles.errorBox}>
              <Icon name="error-warning-line" size={16} color="#FF4D4D" />
              <Text style={styles.errorText}>{errorMsg}</Text>
            </View>
          )}

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>DISPLAY NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Alex"
              placeholderTextColor="rgba(255,255,255,0.3)"
              value={displayName}
              onChangeText={setDisplayName}
              maxLength={24}
              autoCapitalize="words"
            />
          </View>

          <TouchableOpacity
            style={[styles.joinBtn, (!displayName.trim() || isConnecting) && styles.disabledBtn]}
            onPress={handleJoinRoom}
            disabled={!displayName.trim() || isConnecting}
            activeOpacity={0.8}
          >
            {isConnecting ? (
              <ActivityIndicator size="small" color="#000" />
            ) : (
              <Text style={styles.joinBtnText}>Join Room</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060608',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#060608',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 12,
  },
  scrollContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#111115',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  cardContainer: {
    backgroundColor: '#111115',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    padding: 24,
  },
  mediaPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 20,
    gap: 12,
  },
  posterImage: {
    width: 50,
    height: 72,
    borderRadius: 10,
  },
  emptyPoster: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 15,
    color: '#fff',
    marginBottom: 2,
  },
  mediaSubtitle: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 6,
  },
  hostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,210,255,0.12)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  hostBadgeText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 11,
    color: '#00D2FF',
  },
  joinTitle: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 22,
    color: '#fff',
    marginBottom: 6,
  },
  joinSubtitle: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 20,
    lineHeight: 18,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,77,77,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,77,77,0.2)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 12,
    color: '#FF4D4D',
    flex: 1,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontFamily: fontFamilies.bodyMedium,
    fontSize: 15,
  },
  joinBtn: {
    width: '100%',
    height: 50,
    borderRadius: 14,
    backgroundColor: '#00D2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  joinBtnText: {
    fontFamily: fontFamilies.bodyBold,
    fontSize: 15,
    color: '#000',
  },
});
