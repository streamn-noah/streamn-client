import React, { useEffect, useState, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, Dimensions, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import Icon from 'react-native-remix-icon';
import { colors, typography } from '@/constants/theme';
import { getTrending, getLatest, getTopRated, enrichWithLogos } from '@/services/tmdb';
import { MediaSummary, tmdbImage } from '@/services/media';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import YoutubeIframe from 'react-native-youtube-iframe';
import ImageColors from 'react-native-image-colors';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

function MediaCard({ item }: { item: MediaSummary }) {
  return (
    <TouchableOpacity activeOpacity={0.8} style={styles.cardContainer}>
      <Image
        source={{ uri: tmdbImage(item.posterPath, 'w500') }}
        style={styles.cardImage}
        contentFit="cover"
        transition={300}
      />
    </TouchableOpacity>
  );
}

function MediaRow({ title, items }: { title: string; items: MediaSummary[] }) {
  if (!items.length) return null;
  return (
    <View style={styles.rowContainer}>
      <Text style={styles.rowTitle}>{title}</Text>
      <FlatList
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => `${item.mediaType}-${item.id}`}
        renderItem={({ item }) => <MediaCard item={item} />}
        contentContainerStyle={styles.rowList}
      />
    </View>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [bannerItems, setBannerItems] = useState<MediaSummary[]>([]);
  const [trendingMovies, setTrendingMovies] = useState<MediaSummary[]>([]);
  const [latestMovies, setLatestMovies] = useState<MediaSummary[]>([]);
  const [topRatedTv, setTopRatedTv] = useState<MediaSummary[]>([]);
  const [topRatedMovies, setTopRatedMovies] = useState<MediaSummary[]>([]);
  
  const [activeIndex, setActiveIndex] = useState(0);
  const activeBanner = bannerItems[activeIndex];

  const [dominantColor, setDominantColor] = useState<string>('rgba(0,0,0,0.8)');
  const [isMuted, setIsMuted] = useState(true);
  const [videoProgress, setVideoProgress] = useState(0);
  const youtubeRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        const [trendingAll, tMovies, lMovies, trTv, trMovies] = await Promise.all([
          getTrending("all", "week"),
          getTrending("movie", "day"),
          getLatest("movie"),
          getTopRated("tv"),
          getTopRated("movie"),
        ]);

        if (!mounted) return;

        const enrichedBanner = await enrichWithLogos(trendingAll.slice(0, 5));

        setBannerItems(enrichedBanner);
        setTrendingMovies(tMovies);
        setLatestMovies(lMovies);
        setTopRatedTv(trTv);
        setTopRatedMovies(trMovies);
      } catch (error) {
        console.error("Failed to load home data", error);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadData();
    return () => { mounted = false; };
  }, []);

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
          setDominantColor(c.background);
        } else if (c.platform === 'android') {
          setDominantColor(c.dominant || '#000000');
        } else {
          setDominantColor(c.dominant || '#000000');
        }
      }).catch(() => {
        if (mounted) setDominantColor('rgba(0,0,0,0.8)');
      });
    }
    return () => { mounted = false; };
  }, [activeBanner]);

  // Video progress polling & auto-scroll
  const setBannerIndex = useCallback((updater: (curr: number) => number) => {
    setActiveIndex(updater);
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeBanner?.trailerKey) {
      interval = setInterval(async () => {
        if (youtubeRef.current) {
          try {
            const currentTime = await youtubeRef.current.getCurrentTime();
            const duration = await youtubeRef.current.getDuration();
            if (duration > 0) {
              setVideoProgress(currentTime / duration);
            }
          } catch(e) {}
        }
      }, 500);
    } else {
      setVideoProgress(0);
      let ticks = 0;
      interval = setInterval(() => {
        ticks += 0.5;
        setVideoProgress(Math.min(ticks / 10, 1));
        if (ticks >= 10 && bannerItems.length > 0) {
          setBannerIndex(curr => (curr + 1) % bannerItems.length);
        }
      }, 500);
    }
    return () => clearInterval(interval);
  }, [activeBanner, bannerItems.length, setBannerIndex]);

  const onStateChange = useCallback((state: string) => {
    if (state === 'ended' && bannerItems.length > 0) {
      setBannerIndex((current) => (current + 1) % bannerItems.length);
    }
  }, [bannerItems.length, setBannerIndex]);

  const handleScroll = (event: any) => {
    const slideSize = event.nativeEvent.layoutMeasurement.width;
    const index = event.nativeEvent.contentOffset.x / slideSize;
    const roundIndex = Math.round(index);
    if (roundIndex !== activeIndex && roundIndex >= 0 && roundIndex < bannerItems.length) {
      setActiveIndex(roundIndex);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
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
    return `★ ${rating} · ${year} · ${genreStr}`;
  };

  const fileSize = "1.2GB - 2.5GB"; // Placeholder

  return (
    <ScrollView style={styles.container} bounces={false} showsVerticalScrollIndicator={false}>
      {/* Banner Section */}
      <View style={styles.bannerContainer}>
        {bannerItems.length > 0 && (
          <FlatList
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
                  <View style={[styles.fill, { transform: [{ scale: 1.5 }] }]} pointerEvents="none">
                    <YoutubeIframe
                      ref={youtubeRef}
                      height={height * 0.75}
                      width={width}
                      videoId={item.trailerKey}
                      play={true}
                      mute={isMuted}
                      onChangeState={onStateChange}
                      initialPlayerParams={{
                        loop: false,
                        controls: false,
                        modestbranding: true,
                        rel: false,
                      }}
                    />
                  </View>
                )}
              </View>
            )}
          />
        )}

        <View style={styles.fill} pointerEvents="none">
          {/* Base darkening overlay */}
          <View style={[styles.fill, { backgroundColor: 'rgba(0,0,0,0.2)' }]} />
          
          {/* Radial Gradient picking dominant color */}
          <Svg height="100%" width="100%" style={styles.fill}>
            <Defs>
              <RadialGradient id="grad" cx="50%" cy="100%" rx="100%" ry="100%">
                <Stop offset="0%" stopColor={dominantColor} stopOpacity="0.8" />
                <Stop offset="70%" stopColor="#000000" stopOpacity="0.9" />
                <Stop offset="100%" stopColor="#000000" stopOpacity="1" />
              </RadialGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#grad)" />
          </Svg>
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
                  <Text style={styles.fileSizeText}>{fileSize}</Text>
                </View>
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.watchNowButton} activeOpacity={0.8}>
                  <Text style={styles.watchNowText}>Watch Now</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.iconButton} activeOpacity={0.8}>
                  <Icon name="add-line" size={24} color="#fff" />
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

        {/* Top Header Icons */}
        <View style={[styles.headerOverlay, { top: insets.top + 10 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Image 
              source={require('@/assets/images/streamn-loo.svg')} 
              style={{ width: 28, height: 28, tintColor: '#fff' }} 
              contentFit="contain" 
            />
            <Text style={styles.headerTitle}>Streamn</Text>
          </View>
          <View style={styles.headerIcons}>
            <TouchableOpacity style={styles.iconButton} onPress={() => setIsMuted(!isMuted)}>
              <Icon name={isMuted ? "volume-mute-line" : "volume-up-line"} size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton}>
              <Icon name="notification-3-line" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Discover Rows */}
      <View style={styles.contentContainer}>
        <MediaRow title="Trending Right Now" items={trendingMovies} />
        <MediaRow title="New Releases" items={latestMovies} />
        <MediaRow title="Top Rated TV" items={topRatedTv} />
        <MediaRow title="Top Rated Movies" items={topRatedMovies} />
      </View>
    </ScrollView>
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
    marginBottom: 12,
  },
  logoText: {
    ...typography.headline,
    fontSize: 42,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
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
    color: '#60a5fa',
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
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
  headerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
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
    paddingBottom: 40,
  },
  rowContainer: {
    marginBottom: 24,
  },
  rowTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  rowList: {
    paddingHorizontal: 12,
  },
  cardContainer: {
    marginHorizontal: 4,
    width: 120,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
});
