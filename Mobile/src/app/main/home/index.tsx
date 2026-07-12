import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, Dimensions, TouchableOpacity, FlatList, ActivityIndicator, Animated, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import Icon from 'react-native-remix-icon';
import { colors, typography } from '@/constants/theme';
import { getTrending, getLatest, getTopRated, enrichWithLogos } from '@/services/tmdb';
import { MediaSummary, tmdbImage, adjustDominantColor } from '@/services/media';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import ImageColors from 'react-native-image-colors';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import MediaCard from '@/components/MediaCard';
import MediaRow from '@/components/MediaRow';
import { fetchStreamSources, getFileSizeRange, SourceItem } from '@/services/stream-source';

const { width, height } = Dimensions.get('window');
const bannerHeight = height * 0.8;
const scaleFactor = 1.3;
const videoWidth = bannerHeight * (16 / 9) * scaleFactor;
const videoHeight = bannerHeight * scaleFactor;
const videoOffsetX = (videoWidth - width) / 2;
const videoOffsetY = (videoHeight - bannerHeight) / 2;

const HomeSkeleton = () => {
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true })
      ])
    ).start();
  }, [pulseAnim]);

  return (
    <View style={styles.container}>
      <Animated.View style={{ opacity: pulseAnim, flex: 1 }}>
        <View style={{ width, height: height * 0.75, backgroundColor: 'rgba(255,255,255,0.1)' }} />
        {[1, 2, 3].map((row) => (
          <View key={row} style={{ marginTop: 24 }}>
            <View style={{ width: 150, height: 24, backgroundColor: 'rgba(255,255,255,0.1)', marginLeft: 16, marginBottom: 12, borderRadius: 4 }} />
            <View style={{ flexDirection: 'row', paddingHorizontal: 12 }}>
              {[1, 2, 3, 4].map((card) => (
                <View key={card} style={{ width: 120, height: 180, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 6, borderRadius: 12 }} />
              ))}
            </View>
          </View>
        ))}
      </Animated.View>
    </View>
  );
};

function BackgroundYoutubePlayer({ videoId, isMuted, onProgress, onEnded }: { videoId: string, isMuted: boolean, onProgress: (progress: number) => void, onEnded: () => void }) {
  const webviewRef = useRef<WebView>(null);

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
            ${isMuted ? 'event.target.mute();' : 'event.target.unMute();'}
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

  return (
    <WebView
      ref={webviewRef}
      source={{ html, baseUrl: 'https://www.youtube-nocookie.com' }}
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



export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollY = useRef(new Animated.Value(0)).current;

  const [loading, setLoading] = useState(true);
  const [bannerItems, setBannerItems] = useState<MediaSummary[]>([]);
  const flatListRef = useRef<FlatList>(null);
  const [trendingMovies, setTrendingMovies] = useState<MediaSummary[]>([]);
  const [latestMovies, setLatestMovies] = useState<MediaSummary[]>([]);
  const [topRatedTv, setTopRatedTv] = useState<MediaSummary[]>([]);
  const [topRatedMovies, setTopRatedMovies] = useState<MediaSummary[]>([]);

  const [activeIndex, setActiveIndex] = useState(0);
  const activeBanner = bannerItems[activeIndex];

  const [dominantColor, setDominantColor] = useState<string>('rgba(0,0,0,0.8)');
  const [sourceStatus, setSourceStatus] = useState<"loading" | "available" | "unavailable">("loading");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [isMuted, setIsMuted] = useState(true);
  const [videoProgress, setVideoProgress] = useState(0);

  useEffect(() => {
    if (!activeBanner) return;
    let isMounted = true;
    setSourceStatus("loading");
    setSources([]);

    fetchStreamSources(activeBanner.mediaType, activeBanner.id, 1, 1, false, "download")
      .then((res) => {
        if (!isMounted) return;
        if (res.sources && res.sources.length > 0) {
          setSources(res.sources);
          setSourceStatus("available");
        } else {
          setSourceStatus("unavailable");
        }
      })
      .catch(() => {
        if (isMounted) {
          setSourceStatus("unavailable");
          setSources([]);
        }
      });

    return () => { isMounted = false; };
  }, [activeBanner]);

  const fileSizeRange = useMemo(() => {
    return getFileSizeRange(sources);
  }, [sources]);

  const [refreshing, setRefreshing] = useState(false);

  const fetchHomeData = useCallback(async () => {
    try {
      const [trendingAll, tMovies, lMovies, trTv, trMovies] = await Promise.all([
        getTrending("all", "week"),
        getTrending("movie", "day"),
        getLatest("movie"),
        getTopRated("tv"),
        getTopRated("movie"),
      ]);

      const enrichedBanner = await enrichWithLogos(trendingAll.slice(0, 5));

      setBannerItems(enrichedBanner);
      setTrendingMovies(tMovies);
      setLatestMovies(lMovies);
      setTopRatedTv(trTv);
      setTopRatedMovies(trMovies);
    } catch (error) {
      console.error("Failed to load home data", error);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    fetchHomeData().finally(() => {
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [fetchHomeData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchHomeData().finally(() => {
      setRefreshing(false);
    });
  }, [fetchHomeData]);

  // Dominant color extraction
  useEffect(() => {
    let mounted = true;
    if (activeBanner) {
      const url = tmdbImage(activeBanner.backdropPath || activeBanner.posterPath, 'w780');
      ImageColors.getColors(url, {
        fallback: '#000000',
        cache: true,
      }).then(c => {
        if (!mounted) return;
        if (c.platform === 'ios') {
          setDominantColor(adjustDominantColor(c.primary, 'rgba(0,0,0,0.8)'));
        } else if (c.platform === 'android') {
          setDominantColor(adjustDominantColor(c.dominant || '#000000', 'rgba(0,0,0,0.8)'));
        } else {
          setDominantColor(adjustDominantColor(c.dominant || '#000000', 'rgba(0,0,0,0.8)'));
        }
      }).catch(() => {
        if (mounted) setDominantColor('rgba(0,0,0,0.8)');
      });
    }
    return () => { mounted = false; };
  }, [activeBanner]);

  // Fallback 5-second interval for items without trailers
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (!activeBanner?.trailerKey) {
      setVideoProgress(0);
      let ticks = 0;
      interval = setInterval(() => {
        ticks += 0.5;
        setVideoProgress(Math.min(ticks / 10, 1));
        if (ticks >= 10 && bannerItems.length > 0) {
          const nextIndex = (activeIndex + 1) % bannerItems.length;
          flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
        }
      }, 500);
    }
    return () => clearInterval(interval);
  }, [activeBanner, bannerItems.length, activeIndex]);

  const handleScroll = (event: any) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const index = event.nativeEvent.contentOffset.x / slideSize;
    const roundIndex = Math.round(index);
    if (roundIndex !== activeIndex && roundIndex >= 0 && roundIndex < bannerItems.length) {
      setActiveIndex(roundIndex);
    }
  };

  const [viewableRows, setViewableRows] = useState<Set<string>>(new Set());

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    setViewableRows((prev) => {
      const newSet = new Set(prev);
      viewableItems.forEach((v: any) => {
        if (v.isViewable && v.key) newSet.add(v.key);
      });
      return newSet;
    });
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current;

  if (loading) {
    return <HomeSkeleton />;
  }

  const getBannerMetaString = (item: MediaSummary) => {
    const rating = item.voteAverage ? item.voteAverage.toFixed(1) : "6.5";
    const year = item.year || "2026";
    const type = item.mediaType === "movie" ? "Movie" : "Series";

    const genreMap: Record<number, string> = {
      28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
      99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
      27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
      53: "Thriller", 10752: "War", 37: "Western"
    };

    const genreStr = item.genreIds?.map(id => genreMap[id]).filter(Boolean).slice(0, 2).join(' · ') || type;
    return `★ ${rating} · ${year} · ${genreStr} ·`;
  };

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 150],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      <Animated.FlatList
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        style={styles.container}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        data={[
          { key: 'trending', title: 'Trending Right Now', items: trendingMovies, variant: 'default' },
          { key: 'latest', title: 'New Releases', items: latestMovies, variant: 'default' },
          { key: 'tv', title: 'Top 10 TV Shows', items: topRatedTv.slice(0, 10), variant: 'top10', onTitlePress: () => router.push('/main/home/top-10/tv') },
          { key: 'movies', title: 'Top 10 Movies', items: topRatedMovies.slice(0, 10), variant: 'top10', onTitlePress: () => router.push('/main/home/top-10/movie') },
        ]}
        keyExtractor={item => item.key}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        initialNumToRender={1}
        maxToRenderPerBatch={1}
        windowSize={3}
        renderItem={({ item, index }) => (
          <View style={[index === 0 && { marginTop: -20, zIndex: 2 }]}>
            <MediaRow
              title={item.title}
              items={item.items}
              variant={item.variant as any}
              onTitlePress={item.onTitlePress}
              shouldAnimate={viewableRows.has(item.key)}
            />
          </View>
        )}
        ListFooterComponent={<View style={{ height: 120 }} />}
        ListHeaderComponent={
          <View style={styles.bannerContainer}>
            {bannerItems.length > 0 && (
              <FlatList
                ref={flatListRef}
                data={bannerItems}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={handleScroll}
                scrollEventThrottle={16}
                keyExtractor={(item) => `banner-${item.id}`}
                renderItem={({ item, index }) => (
                  <View style={{ width, height: height * 0.75, overflow: 'hidden' }}>
                    <Image
                      source={{ uri: tmdbImage(item.posterPath || item.backdropPath, 'w1280') }}
                      style={styles.fill}
                      contentFit="cover"
                    />
                    {item.trailerKey && index === activeIndex && (
                      <View style={{ position: 'absolute', top: -videoOffsetY, left: -videoOffsetX, width: videoWidth, height: videoHeight, opacity: 1 }}>
                        <BackgroundYoutubePlayer
                          videoId={item.trailerKey}
                          isMuted={isMuted}
                          onProgress={setVideoProgress}
                          onEnded={() => {
                            if (bannerItems.length > 0) {
                              const nextIndex = (activeIndex + 1) % bannerItems.length;
                              flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
                            }
                          }}
                        />
                        {/* Invisible overlay to block touches but let WebView stay natively interactable for iOS autoplay */}
                        <View style={StyleSheet.absoluteFill} />
                      </View>
                    )}
                  </View>
                )}
              />
            )}

            <MaskedView
              style={styles.fill}
              pointerEvents="none"
              maskElement={
                <ExpoLinearGradient
                  colors={['rgba(0,0,0,1)', 'transparent', 'rgba(0,0,0,1)', 'rgba(0,0,0,1)']}
                  locations={[0.1, 0.4, 0.6, 1]}
                  style={styles.fill}
                />
              }
            >
              <BlurView intensity={100} tint="dark" style={styles.fill} />
            </MaskedView>
            <View style={styles.fill} pointerEvents="none">
              <ExpoLinearGradient
                colors={['transparent', 'rgba(0,0,0,0.2)', 'rgba(0,0,0,0.8)', '#000']}
                locations={[0, 0.4, 0.7, 1]}
                style={styles.fill}
              />
            </View>

            <View style={[styles.bannerOverlay, { paddingBottom: 40 }]}>
              {activeBanner && (
                <View style={styles.bannerContent}>
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
                    <View style={styles.fileSizeBadge}>
                      {sourceStatus === 'loading' ? (
                        <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
                      ) : (
                        <Text style={styles.fileSizeText}>{sourceStatus === 'unavailable' ? 'N/A' : fileSizeRange}</Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.actionRow}>
                    {sourceStatus === 'loading' ? (
                      <TouchableOpacity style={[styles.watchNowButton, { opacity: 0.7 }]} disabled>
                        <ActivityIndicator size="small" color="#000" />

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
                        onPress={() => router.push((`/player/${activeBanner.mediaType}/${activeBanner.id}` as any))}
                      >
                        <Text style={styles.watchNowText}>Watch Now</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity activeOpacity={0.8}>
                      <BlurView intensity={20} tint="light" style={styles.iconButton}>
                        <Icon name="add-line" size={24} color="#fff" />
                      </BlurView>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.paginationRow}>
                    {bannerItems.map((_, i) => {
                      const isActive = i === activeIndex;
                      return (
                        <View
                          key={i}
                          style={[
                            styles.dot,
                            isActive && styles.activeDotWrapper
                          ]}
                        >
                          {isActive && (
                            <View style={[styles.activeDotFill, { width: `${videoProgress * 100}%` }]} />
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          </View>
        }
      />

      {/* Sticky Header */}
      <View style={[styles.stickyHeader, { height: insets.top + 70 }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: headerOpacity }]} pointerEvents="none">
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
        </Animated.View>
        <View style={[styles.headerContent, { marginTop: insets.top, paddingVertical: 12 }]} pointerEvents="box-none">
          <Image
            source={require('@/assets/images/streamn-loo.svg')}
            style={{ width: 28, height: 28, tintColor: '#fff' }}
            contentFit="contain"
          />
          <View style={styles.headerIcons}>
            <TouchableOpacity onPress={() => setIsMuted(!isMuted)} activeOpacity={0.8}>
              <BlurView intensity={20} tint="light" style={styles.iconButton}>
                <Icon name={isMuted ? "volume-mute-line" : "volume-up-line"} size={20} color="#fff" />
              </BlurView>
            </TouchableOpacity>
            {/* <TouchableOpacity activeOpacity={0.8}>
              <BlurView intensity={20} tint="light" style={styles.iconButton}>
                <Icon name="notification-3-line" size={20} color="#fff" />
              </BlurView>
            </TouchableOpacity> */}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  bannerContainer: {
    width,
    height: height * 0.75,
    position: 'relative',
  },
  bannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  bannerContent: {
    alignItems: 'center',
    width: '100%',

  },
  logoImage: {
    width: width * 0.7,
    height: 100,
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
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  metaText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '500',
  },
  fileSizeBadge: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
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
    gap: 12,
    marginBottom: 32,
  },
  watchNowButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 30,
  },
  watchNowText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  activeDotWrapper: {
    width: 24,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  activeDotFill: {
    height: '100%',
    backgroundColor: '#fff',
  },
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  contentContainer: {
    paddingBottom: 120,
  },

});
