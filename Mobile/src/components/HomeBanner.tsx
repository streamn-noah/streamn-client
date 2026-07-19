import React, { useEffect, useState, useRef, useMemo } from 'react';
import { StyleSheet, Text, View, Dimensions, TouchableOpacity, FlatList, Animated, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import Icon from 'react-native-remix-icon';
import { typography } from '@/constants/theme';
import { MediaSummary, tmdbImage } from '@/services/media';
import { WebView } from 'react-native-webview';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { fetchStreamSources, getFileSizeRange, SourceItem } from '@/services/stream-source';
import { useRouter } from 'expo-router';

const { width, height } = Dimensions.get('window');
const bannerHeight = height * 0.8;
const scaleFactor = 1.2;
const videoWidth = bannerHeight * (16 / 9) * scaleFactor;
const videoHeight = bannerHeight * scaleFactor;
const videoOffsetX = (videoWidth - width) / 2;
const videoOffsetY = (videoHeight - bannerHeight) / 2;

function BackgroundYoutubePlayer({ videoId, isMuted, onProgress, onEnded }: { videoId: string, isMuted: boolean, onProgress: (progress: number) => void, onEnded: () => void }) {
  const webviewRef = useRef<WebView>(null);
  const initialMuted = useRef(isMuted).current;

  useEffect(() => {
    if (webviewRef.current) {
      webviewRef.current.injectJavaScript(`
        if (typeof player !== 'undefined' && player.mute && player.unMute) {
          ${isMuted ? 'player.mute();' : 'player.unMute();'}
        }
        true;
      `);
    }
  }, [isMuted]);

  const source = useMemo(() => {
    const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <style>
          body { margin: 0; padding: 0; background-color: transparent; overflow: hidden; }
          #player { position: absolute; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; }
        </style>
      </head>
      <body>
        <div id="player"></div>
        <script>
          var tag = document.createElement('script');
          tag.src = "https://www.youtube.com/iframe_api";
          var firstScriptTag = document.getElementsByTagName('script')[0];
          firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

          var player;
          function onYouTubeIframeAPIReady() {
            player = new YT.Player('player', {
              host: 'https://www.youtube-nocookie.com',
              videoId: '${videoId}',
              playerVars: {
                'playsinline': 1,
                'autoplay': 1,
                'mute': 1,
                'controls': 0,
                'rel': 0,
                'showinfo': 0,
                'modestbranding': 1,
                'iv_load_policy': 3,
                'fs': 0,
                'origin': 'https://www.youtube-nocookie.com'
              },
              events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange
              }
            });
          }

          function onPlayerReady(event) {
            ${initialMuted ? 'event.target.mute();' : 'event.target.unMute();'}
            event.target.playVideo();
            setInterval(function() {
              if (player && player.getCurrentTime) {
                 var currentTime = player.getCurrentTime();
                 var duration = player.getDuration();
                 if (duration > 0) {
                   window.ReactNativeWebView.postMessage(JSON.stringify({
                     type: 'progress',
                     progress: currentTime / duration
                   }));
                 }
              }
            }, 500);
          }

          function onPlayerStateChange(event) {
            if (event.data === YT.PlayerState.ENDED) {
              window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ended' }));
            }
          }
        </script>
      </body>
    </html>
  `;
    return { html, baseUrl: 'https://www.youtube-nocookie.com' };
  }, [videoId, initialMuted]);

  return (
    <WebView
      ref={webviewRef}
      source={source}
      style={{ flex: 1, backgroundColor: 'transparent' }}
      allowsInlineMediaPlayback={true}
      mediaPlaybackRequiresUserAction={false}
      scrollEnabled={false}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      onMessage={(event) => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data.type === 'progress') {
            onProgress(data.progress);
          } else if (data.type === 'ended') {
            onEnded();
          }
        } catch (e) { }
      }}
    />
  );
}

export default function HomeBanner({
  items,
  activeTab,
  activeIndex,
  setActiveIndex,
  inList,
  onMyListPress,
  listScale,
  activeBannerProgress,
  isActive
}: {
  items: MediaSummary[];
  activeTab: string;
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  inList: boolean;
  onMyListPress: () => void;
  listScale: Animated.Value;
  activeBannerProgress: any;
  isActive: boolean;
}) {
  const router = useRouter();
  const flatListRef = useRef<FlatList<any>>(null);

  const [isMuted, setIsMuted] = useState(true);
  const [videoProgress, setVideoProgress] = useState(0);
  const [sourceStatus, setSourceStatus] = useState<"loading" | "available" | "unavailable">("loading");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const sourcesCache = useRef<Record<string, { status: "available" | "unavailable", sources: SourceItem[] }>>({});

  useEffect(() => {
    AsyncStorage.getItem('streamn_is_muted').then((val) => {
      if (val !== null) {
        setIsMuted(val === 'true');
      }
    });
  }, []);

  const toggleMute = () => {
    const newVal = !isMuted;
    setIsMuted(newVal);
    AsyncStorage.setItem('streamn_is_muted', String(newVal));
  };

  useEffect(() => {
    setActiveIndex(0);
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [activeTab]);

  const activeBanner = items[activeIndex < items.length ? activeIndex : 0];

  useEffect(() => {
    if (!activeBanner) return;
    const cacheKey = `${activeBanner.mediaType}-${activeBanner.id}`;

    if (sourcesCache.current[cacheKey]) {
      const cached = sourcesCache.current[cacheKey];
      setSources(cached.sources);
      setSourceStatus(cached.status);
      return;
    }

    let isMounted = true;
    setSourceStatus("loading");
    setSources([]);

    fetchStreamSources(activeBanner.mediaType, activeBanner.id, 1, 1, false, "playback")
      .then((res) => {
        if (!isMounted) return;
        if (res.sources && res.sources.length > 0) {
          sourcesCache.current[cacheKey] = { status: "available", sources: res.sources };
          setSources(res.sources);
          setSourceStatus("available");
        } else {
          sourcesCache.current[cacheKey] = { status: "unavailable", sources: [] };
          setSourceStatus("unavailable");
        }
      })
      .catch(() => {
        if (isMounted) {
          sourcesCache.current[cacheKey] = { status: "unavailable", sources: [] };
          setSourceStatus("unavailable");
          setSources([]);
        }
      });

    return () => { isMounted = false; };
  }, [activeBanner]);

  const handleScroll = (event: any) => {
    const slideSize = width * 0.85;
    const index = event.nativeEvent.contentOffset.x / slideSize;
    const roundIndex = Math.round(index);
    if (roundIndex !== activeIndex && roundIndex >= 0 && roundIndex < items.length) {
      setActiveIndex(roundIndex);
    }
  };

  useEffect(() => {
    let interval: any;
    if (!activeBanner?.trailerKey) {
      setVideoProgress(0);
      let ticks = 0;
      interval = setInterval(() => {
        ticks += 0.5;
        setVideoProgress(Math.min(ticks / 10, 1));
        if (ticks >= 10 && items.length > 0) {
          const nextIndex = (activeIndex + 1) % items.length;
          flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
        }
      }, 500);
    }
    return () => clearInterval(interval);
  }, [activeBanner, items.length, activeIndex]);

  const getBannerMetaString = (item: MediaSummary) => {
    const type = item.mediaType === "movie" ? "Movie" : "Series";

    const genreMap: Record<number, string> = {
      28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
      99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
      27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
      53: "Thriller", 10752: "War", 37: "Western"
    };

    const genreStr = item.genreIds?.map(id => genreMap[id]).filter(Boolean).slice(0, 3).join(' • ') || type;
    return `${genreStr}`;
  };

  if (!items || items.length === 0) return null;

  return (
    <View style={styles.bannerContainer}>
      <FlatList
        ref={flatListRef as any}
        data={items}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        keyExtractor={(item: any) => `banner-${item.id}`}
        renderItem={({ item, index }: any) => (
          <TouchableOpacity
            activeOpacity={0.9}
            style={{ width, height: bannerHeight, overflow: 'hidden' }}
            onPress={() => {
              if (item.mediaType && item.id) {
                router.push(`/main/home/detail/${item.mediaType}/${item.id}` as any);
              }
            }}
          >
            <Image
              source={{ uri: tmdbImage(item.posterPath || item.backdropPath, 'w1280') }}
              style={styles.fill}
              contentFit="cover"
            />
            {item.trailerKey && index === activeIndex && isActive && (
              <View style={{ position: 'absolute', top: -videoOffsetY, left: -videoOffsetX, width: videoWidth, height: videoHeight, opacity: 1 }} pointerEvents="none">
                <BackgroundYoutubePlayer
                  videoId={item.trailerKey}
                  isMuted={isMuted}
                  onProgress={setVideoProgress}
                  onEnded={() => {
                    if (items.length > 0) {
                      const nextIndex = (activeIndex + 1) % items.length;
                      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
                    }
                  }}
                />
                <View style={StyleSheet.absoluteFill} />
              </View>
            )}
          </TouchableOpacity>
        )}
      />

      <View style={styles.fill} pointerEvents="none">
        <ExpoLinearGradient
          colors={['rgba(0,0,0,0.9)', 'transparent', 'rgba(0,0,0,0.8)', '#000']}
          locations={[0, 0.3, 0.7, 1]}
          style={styles.fill}
        />
      </View>

      <View style={[styles.bannerOverlay, { paddingBottom: 40 }]} pointerEvents="box-none">
        {activeBanner && (
          <View style={styles.bannerContent} pointerEvents="box-none">
            {activeBanner.logoPath ? (
              <Image
                source={{ uri: tmdbImage(activeBanner.logoPath, 'w500') }}
                style={styles.logoImage}
                contentFit="contain"
              />
            ) : (
              <Text style={styles.logoText}>{activeBanner.title}</Text>
            )}

            <View style={styles.statsRow}>
              <Text style={styles.metaText}>{getBannerMetaString(activeBanner)}</Text>
              {sourceStatus === 'loading' ? (
                <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
              ) : sourceStatus === 'available' ? (
                <View style={styles.fileSizeBadge}>
                  <Text style={styles.fileSizeText}>{getFileSizeRange(sources)}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.actionRow}>
              {sourceStatus === 'loading' ? (
                <TouchableOpacity style={[styles.watchNowButton, { opacity: 0.7 }]} disabled>
                  <ActivityIndicator size="small" color="#000" />
                  <Text style={[styles.watchNowText, { marginLeft: 8 }]}>Loading...</Text>
                </TouchableOpacity>
              ) : sourceStatus === 'unavailable' ? (
                <TouchableOpacity style={[styles.watchNowButton, { backgroundColor: 'rgba(255,255,255,0.2)' }]} disabled>
                  <Icon name="error-warning-line" size={20} color="rgba(255,255,255,0.4)" />
                  <View style={{ marginLeft: 8 }}>
                    <Text style={[styles.watchNowText, { color: 'rgba(255,255,255,0.4)' }]}>Unavailable</Text>
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.watchNowButton}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (activeBannerProgress) {
                      router.push(`/player/${activeBanner.mediaType}/${activeBanner.id}?season=${activeBannerProgress.seasonNumber || 1}&episode=${activeBannerProgress.episodeNumber || 1}` as any);
                    } else {
                      router.push(`/player/${activeBanner.mediaType}/${activeBanner.id}?season=1&episode=1` as any);
                    }
                  }}
                >
                  <Text style={styles.watchNowText}>
                    {activeBannerProgress ? "Continue Watching" : "Watch Now"}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity activeOpacity={0.8} onPress={onMyListPress}>
                <Animated.View style={[
                  styles.iconButton,
                  inList && { backgroundColor: '#ffffff' },
                  { transform: [{ scale: listScale }] }
                ]}>
                  <Icon name={inList ? "check-fill" : "add-line"} size={24} color={inList ? "#000000" : "#ffffff"} />
                </Animated.View>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.8} onPress={toggleMute}>
                <View style={styles.iconButton}>
                  <Icon name={isMuted ? "volume-mute-line" : "volume-up-line"} size={24} color="#fff" />
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.paginationRow}>
              {items.map((_: any, i: number) => {
                const isActive = i === activeIndex;
                return (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      isActive && styles.activeDotWrapper
                    ]}
                  >
                    {isActive && activeBanner.trailerKey && (
                      <Animated.View
                        style={[
                          styles.activeDotIndicator,
                          {
                            width: `${videoProgress * 100}%`,
                          }
                        ]}
                      />
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    height: bannerHeight,
    width,
    position: 'relative',
    backgroundColor: 'black',
  },
  fill: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
  },
  bannerOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    zIndex: 2,
  },
  bannerContent: {
    alignItems: 'center',
    gap: 16,
  },
  logoImage: {
    width: '80%',
    height: 40,
    marginBottom: 8,
  },
  logoText: {
    ...typography.headline,
    fontSize: 42,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metaText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  fileSizeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  fileSizeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 32,
  },
  watchNowButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  watchNowText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  paginationRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  activeDotWrapper: {
    width: 32,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  activeDotIndicator: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 3,
  },
});
