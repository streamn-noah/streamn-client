import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, Dimensions, TouchableOpacity, FlatList, ActivityIndicator, Animated, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import Icon from 'react-native-remix-icon';
import { colors, typography } from '@/constants/theme';
import { 
  getTrending, 
  getLatest, 
  getTopRated, 
  enrichWithLogos, 
  getMediaDetail,
  discoverByGenre,
  discoverByOriginCountry,
  getAnime,
} from '@/services/tmdb';
import { MediaSummary, tmdbImage, adjustDominantColor } from '@/services/media';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ImageColors from 'react-native-image-colors';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import MediaRow from '@/components/MediaRow';
import { fetchStreamSources, getFileSizeRange, SourceItem } from '@/services/stream-source';
import { getContinueWatching, WatchProgress } from '@/services/storage';

const { width, height } = Dimensions.get('window');
const bannerHeight = height * 0.75;

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
        <View style={{ width, height: bannerHeight, backgroundColor: 'rgba(255,255,255,0.1)' }} />
        {[1, 2, 3].map((row) => (
          <View key={row} style={{ marginTop: 24 }}>
            <View style={{ width: 150, height: 24, backgroundColor: 'rgba(255,255,255,0.1)', marginLeft: 16, marginBottom: 12, borderRadius: 4 }} />
            <View style={{ flexDirection: 'row', paddingHorizontal: 12 }}>
              {[1, 2, 3, 4].map((card) => (
                <View key={card} style={{ width: 130, height: 182, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 6, borderRadius: 12 }} />
              ))}
            </View>
          </View>
        ))}
      </Animated.View>
    </View>
  );
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollY = useRef(new Animated.Value(0)).current;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bannerItems, setBannerItems] = useState<MediaSummary[]>([]);
  const flatListRef = useRef<FlatList>(null);
  
  const [rows, setRows] = useState<any[]>([]);

  const [activeIndex, setActiveIndex] = useState(0);
  const activeBanner = bannerItems[activeIndex];

  const [dominantColor, setDominantColor] = useState<string>('rgba(0,0,0,0.8)');
  const [sourceStatus, setSourceStatus] = useState<"loading" | "available" | "unavailable">("loading");
  const [sources, setSources] = useState<SourceItem[]>([]);

  const [activeTab, setActiveTab] = useState<'For You' | 'Movies' | 'Shows' | 'Anime'>('For You');

  useEffect(() => {
    if (!activeBanner) return;
    let isMounted = true;
    setSourceStatus("loading");
    setSources([]);

    fetchStreamSources(activeBanner.mediaType, activeBanner.id, 1, 1, false, "playback")
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

  const fetchPrimaryData = async () => {
    try {
      const [trendingAll, newMovies, cwData] = await Promise.all([
        getTrending("all", "week"),
        getLatest("movie"),
        getContinueWatching()
      ]);

      const enrichedBanner = await enrichWithLogos(trendingAll.slice(0, 5));
      // Shuffle active index once initially
      const initialActiveIndex = Math.floor(Math.random() * Math.min(enrichedBanner.length, 5));
      setBannerItems(enrichedBanner);
      setActiveIndex(initialActiveIndex);

      let initialRows: any[] = [];
      if (cwData.length > 0) {
        initialRows.push({ key: 'continueWatching', title: 'Continue Watching', items: cwData, variant: 'continueWatching' });
      }

      initialRows.push({ key: 'trending', title: 'Trending Right Now', items: trendingAll, variant: 'default' });
      initialRows.push({ key: 'newMovies', title: 'New Movies', items: newMovies, variant: 'default' });
      
      setRows(initialRows);

      return { cwData, trendingAll, newMovies, enrichedBanner };
    } catch (error) {
      console.error("Failed to load primary data", error);
      return null;
    }
  };

  const fetchSecondaryData = async (cwData: WatchProgress[]) => {
    try {
      let becauseYouWatchedItems: MediaSummary[] = [];
      let becauseYouWatchedTitle = '';

      if (cwData.length > 0) {
        const lastWatched = cwData[0];
        becauseYouWatchedTitle = lastWatched.title;
        const detail = await getMediaDetail(lastWatched.mediaType, lastWatched.id);
        if (detail && detail.recommendations) {
          becauseYouWatchedItems = detail.recommendations;
        }
      }

      const [
        nollywoodMovies,
        topRatedSeries,
        nollywoodShows,
        topRatedMovies,
        blockbusterAction,
        kdramas,
        laughOutLoud,
        sciFiFantasy,
        animeSeries,
        horrorMovies,
        romanceMovies,
        adventureMovies,
        crimeThrillers,
      ] = await Promise.all([
        discoverByOriginCountry("movie", "NG"),
        getTopRated("tv"),
        discoverByOriginCountry("tv", "NG"),
        getTopRated("movie"),
        discoverByGenre("movie", 28), // Action
        discoverByOriginCountry("tv", "KR"),
        discoverByGenre("movie", 35), // Comedy
        discoverByGenre("movie", 878), // Sci-Fi
        getAnime(),
        discoverByGenre("movie", 27), // Horror
        discoverByGenre("movie", 10749), // Romance
        discoverByGenre("movie", 12), // Adventure
        discoverByGenre("movie", 80), // Crime
      ]);

      setRows(prev => {
        let updatedRows = [...prev];
        
        // Insert becauseYouWatched right after continue watching
        if (becauseYouWatchedItems.length > 0) {
          const cwIndex = updatedRows.findIndex(r => r.key === 'continueWatching');
          updatedRows.splice(cwIndex + 1, 0, { key: 'becauseYouWatched', title: `Because you watched ${becauseYouWatchedTitle}`, items: becauseYouWatchedItems, variant: 'default' });
        }

        updatedRows = [
          ...updatedRows,
          { key: 'nollywoodMovies', title: 'Nollywood Movies', items: nollywoodMovies, variant: 'default' },
          { key: 'communityWatchlist', title: 'Community Watchlist', items: [], variant: 'communityWatchlist' }, // Empty for now, as no mobile endpoint yet
          { key: 'topRatedSeries', title: 'Top Rated Series', items: topRatedSeries.slice(0, 10), variant: 'top10' },
          { key: 'nollywoodShows', title: 'Nollywood Shows', items: nollywoodShows, variant: 'default' },
          { key: 'topRatedMovies', title: 'Top Rated Movies', items: topRatedMovies.slice(0, 10), variant: 'top10' },
          { key: 'blockbusterAction', title: 'Blockbuster Action', items: blockbusterAction, variant: 'default' },
          { key: 'kdramas', title: 'K-Dramas', items: kdramas, variant: 'default' },
          { key: 'laughOutLoud', title: 'Laugh out Loud', items: laughOutLoud, variant: 'default' },
          { key: 'sciFiFantasy', title: 'Sci-Fi & Fantasy', items: sciFiFantasy, variant: 'default' },
          { key: 'animeSeries', title: 'Anime Series', items: animeSeries, variant: 'default' },
          { key: 'spineChillingHorror', title: 'Spine-Chilling Horror', items: horrorMovies, variant: 'default' },
          { key: 'heartwarmingRomance', title: 'Heartwarming Romance', items: romanceMovies, variant: 'default' },
          { key: 'voyageOfAdventure', title: 'Voyage of Adventure', items: adventureMovies, variant: 'default' },
          { key: 'crimeThrillers', title: 'Crime Thrillers', items: crimeThrillers, variant: 'default' },
        ];

        return updatedRows;
      });

    } catch (e) {
      console.error("Failed to load secondary data", e);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    const primary = await fetchPrimaryData();
    setLoading(false); // First paint fast
    if (primary) {
      // Lazy load the rest
      fetchSecondaryData(primary.cwData);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData().finally(() => {
      setRefreshing(false);
    });
  }, [loadData]);

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

  // Static banner timer fallback
  useEffect(() => {
    if (bannerItems.length === 0) return;
    const interval = setInterval(() => {
      const nextIndex = (activeIndex + 1) % bannerItems.length;
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
    }, 8000); // 8s per slide since it's static
    return () => clearInterval(interval);
  }, [activeIndex, bannerItems.length]);

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

  if (loading && rows.length === 0) {
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
    return `★ ${rating} · ${year} · ${genreStr}`;
  };

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 150],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const tabs = ['For You', 'Movies', 'Shows', 'Anime'];

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
        data={rows.filter(r => r.items?.length > 0 || r.variant === 'communityWatchlist')} // hide empty rows
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
          <View style={[styles.bannerContainer, { backgroundColor: dominantColor }]}>
            {/* Background Gradient Fade */}
            <ExpoLinearGradient
              colors={[dominantColor, 'rgba(0,0,0,1)']}
              style={styles.fill}
              locations={[0.5, 1]}
            />
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
                  <View style={{ width, height: bannerHeight, alignItems: 'center', justifyContent: 'center', paddingTop: 80 }}>
                    {/* The new simplified static card */}
                    <View style={styles.staticCardContainer}>
                      <Image
                        source={{ uri: tmdbImage(item.posterPath || item.backdropPath, 'w780') }}
                        style={styles.staticCardImage}
                        contentFit="cover"
                      />
                      <ExpoLinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.6)', 'rgba(0,0,0,1)']}
                        locations={[0, 0.5, 1]}
                        style={styles.fill}
                      />
                      <View style={styles.staticCardContent}>
                        {item.logoPath ? (
                          <Image
                            source={{ uri: tmdbImage(item.logoPath, 'w500') }}
                            style={styles.logoImage}
                            contentFit="contain"
                          />
                        ) : (
                          <Text style={styles.logoText}>{item.title}</Text>
                        )}
                        <View style={styles.statsRow}>
                          <Text style={styles.metaText}>{getBannerMetaString(item)}</Text>
                          <View style={styles.fileSizeBadge}>
                            {sourceStatus === 'loading' ? (
                              <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" />
                            ) : (
                              <Text style={styles.fileSizeText}>{sourceStatus === 'unavailable' ? 'N/A' : fileSizeRange}</Text>
                            )}
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                )}
              />
            )}

            <View style={[styles.bannerOverlay, { paddingBottom: 40 }]}>
              {activeBanner && (
                <View style={styles.bannerContent}>
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
                        <Text style={{color: '#fff', fontSize: 12, fontWeight: '600', marginLeft: 4}}>My List</Text>
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
                        />
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          </View>
        }
      />

      {/* Sticky Header with Tabs */}
      <View style={[styles.stickyHeader, { height: insets.top + 90 }]} pointerEvents="box-none">
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: headerOpacity }]} pointerEvents="none">
          <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
        </Animated.View>
        
        {/* Top Header Row */}
        <View style={[styles.headerContent, { marginTop: insets.top, paddingVertical: 12, paddingBottom: 4 }]} pointerEvents="box-none">
          <Image
            source={require('@/assets/images/streamn-loo.svg')}
            style={{ width: 28, height: 28, tintColor: '#fff' }}
            contentFit="contain"
          />
          <View style={styles.headerIcons}>
            <TouchableOpacity activeOpacity={0.8}>
              <Icon name="search-2-line" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tabs Row */}
        <View style={styles.tabsContainer}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={tabs}
            keyExtractor={item => item}
            renderItem={({item}) => (
              <TouchableOpacity 
                activeOpacity={0.8}
                onPress={() => setActiveTab(item as any)}
                style={[
                  styles.tabButton,
                  activeTab === item && styles.tabButtonActive
                ]}
              >
                <Text style={[
                  styles.tabText,
                  activeTab === item && styles.tabTextActive
                ]}>
                  {item}
                </Text>
              </TouchableOpacity>
            )}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          />
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
    backgroundColor: '#000',
  },
  bannerContainer: {
    width,
    height: bannerHeight,
    position: 'relative',
  },
  staticCardContainer: {
    width: width * 0.85,
    height: width * 1.1,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
    backgroundColor: '#1e232d'
  },
  staticCardImage: {
    width: '100%',
    height: '100%',
  },
  staticCardContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    padding: 16,
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
    width: width * 0.6,
    height: 80,
    marginBottom: 8,
  },
  logoText: {
    ...typography.headline,
    fontSize: 32,
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  fileSizeBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
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
    marginBottom: 24,
  },
  watchNowButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
  },
  watchNowText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  },
  iconButton: {
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 40,
    flexDirection: 'row',
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
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  activeDotWrapper: {
    width: 24,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tabsContainer: {
    height: 40,
  },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  tabButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  tabText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
});
