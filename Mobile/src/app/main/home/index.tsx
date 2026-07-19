import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, Text, View, Dimensions, TouchableOpacity, FlatList, ActivityIndicator, Animated, RefreshControl, TextInput, ScrollView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
import { WebView } from 'react-native-webview';
import ImageColors from 'react-native-image-colors';
import { useRouter, useFocusEffect } from 'expo-router';
import { BlurView } from 'expo-blur';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import MediaRow from '@/components/MediaRow';
import HomeBanner from '@/components/HomeBanner';
import { fetchStreamSources, getFileSizeRange, SourceItem } from '@/services/stream-source';
import { getContinueWatching, WatchProgress } from '@/services/storage';
import {
  supabase,
  getPublicWatchlists,
  getMyWatchlists,
  addToWatchlist,
  removeFromWatchlist,
  createWatchlist,
  getWatchlistsForMedia
} from '@/services/supabase';
import { Sheet } from '@/components/ui/sheet';
import { AuthSheet } from '@/components/ui/auth-sheet';
import { useAuth } from '@/components/providers/auth-provider';

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

function TabItem({ item, isActive, onPress, headerOpacity }: { item: string, isActive: boolean, onPress: () => void, headerOpacity: any }) {
  const opacity = useRef(new Animated.Value(isActive ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: isActive ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isActive]);

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={styles.tabButton}
    >
      <Animated.View style={[styles.glowContainer, { opacity: Animated.multiply(opacity, headerOpacity) }]}>
        <View style={styles.glowSquash}>
          <Svg height="160" width="160">
            <Defs>
              <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
                <Stop offset="40%" stopColor="#ffffff" stopOpacity="0.2" />
                <Stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Rect width="160" height="160" fill="url(#glow)" />
          </Svg>
        </View>
      </Animated.View>


      <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
        {item}
      </Text>

      <Animated.View style={[styles.tabUnderline, { opacity }]} />
    </TouchableOpacity>
  );
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollY = useRef(new Animated.Value(0)).current;
  const { user, showGoogleSignIn } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [allBannerItems, setAllBannerItems] = useState<MediaSummary[]>([]);

  const [allRows, setAllRows] = useState<any[]>([]);

  const [dominantColor, setDominantColor] = useState<string>('rgba(0,0,0,0.8)');

  const [activeTab, setActiveTab] = useState<'Home' | 'Movies' | 'Shows' | 'Anime'>('Home');

  const bannerItems = useMemo(() => {
    if (activeTab === 'Movies') {
      const movies = allBannerItems.filter(i => i.mediaType === 'movie');
      return movies.length > 0 ? movies : allRows.find(r => r.key === 'newMovies' || r.key === 'topRatedMovies')?.items.slice(0, 5) || [];
    }
    if (activeTab === 'Shows') {
      const shows = allBannerItems.filter(i => i.mediaType === 'tv');
      return shows.length > 0 ? shows : allRows.find(r => r.key === 'topRatedSeries' || r.key === 'kdramas')?.items.slice(0, 5) || [];
    }
    if (activeTab === 'Anime') {
      return allRows.find(r => r.key === 'animeSeries')?.items.slice(0, 5) || [];
    }
    return allBannerItems;
  }, [allBannerItems, allRows, activeTab]);

  const rows = useMemo(() => {
    let result: any[] = [];
    if (activeTab === 'Home') {
      result = allRows;
    } else if (activeTab === 'Movies') {
      const movieKeys = ['newMovies', 'topRatedMovies', 'blockbusterAction', 'laughOutLoud', 'sciFiFantasy', 'spineChillingHorror', 'heartwarmingRomance', 'voyageOfAdventure', 'crimeThrillers', 'nollywoodMovies'];
      let temp = allRows.filter(r => movieKeys.includes(r.key));
      const trendingRow = allRows.find(r => r.key === 'trending');
      if (trendingRow) {
        const trendingMovies = trendingRow.items.filter((i: any) => i.mediaType === 'movie');
        if (trendingMovies.length > 0) {
          temp.unshift({ ...trendingRow, title: 'Trending Movies', items: trendingMovies });
        }
      }
      result = temp;
    } else if (activeTab === 'Shows') {
      const showKeys = ['topRatedSeries', 'nollywoodShows', 'kdramas'];
      let temp = allRows.filter(r => showKeys.includes(r.key));
      const trendingRow = allRows.find(r => r.key === 'trending');
      if (trendingRow) {
        const trendingShows = trendingRow.items.filter((i: any) => i.mediaType === 'tv');
        if (trendingShows.length > 0) {
          temp.unshift({ ...trendingRow, title: 'Trending Series', items: trendingShows });
        }
      }
      result = temp;
    } else if (activeTab === 'Anime') {
      const animeKeys = ['animeSeries'];
      result = allRows.filter(r => animeKeys.includes(r.key));
    } else {
      result = allRows;
    }

    const viewMoreKeys = [
      'trending', 'newMovies', 'nollywoodMovies', 'nollywoodShows',
      'topRatedSeries', 'topRatedMovies', 'blockbusterAction', 'kdramas',
      'laughOutLoud', 'sciFiFantasy', 'animeSeries', 'spineChillingHorror',
      'heartwarmingRomance', 'voyageOfAdventure', 'crimeThrillers'
    ];

    return result.map(row => {
      if (viewMoreKeys.includes(row.key)) {
        return {
          ...row,
          onTitlePress: () => {
            router.push(`/main/home/list?title=${encodeURIComponent(row.title)}&rowKey=${row.key}` as any);
          }
        };
      }
      return row;
    });
  }, [allRows, activeTab, router]);

  // Watchlist & Toast states for Banner
  const [activeIndex, setActiveIndex] = useState(0);
  const activeBanner = useMemo(() => {
    return bannerItems[activeIndex < bannerItems.length ? activeIndex : 0];
  }, [bannerItems, activeIndex]);

  const [watchlists, setWatchlists] = useState<any[]>([]);
  const [inList, setInList] = useState(false);
  const [inListWatchlists, setInListWatchlists] = useState<string[]>([]);
  const [watchlistSheetVisible, setWatchlistSheetVisible] = useState(false);
  const [newWatchlistName, setNewWatchlistName] = useState("");
  const [creatingWatchlist, setCreatingWatchlist] = useState(false);
  const [showNewWatchlistInput, setShowNewWatchlistInput] = useState(false);

  // Animations
  const listScale = useRef(new Animated.Value(1)).current;
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(20)).current;
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [showToastAction, setShowToastAction] = useState(false);

  const [isFocused, setIsFocused] = useState(true);
  const [scrollYVal, setScrollYVal] = useState(0);

  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      setScrollYVal(value);
    });
    return () => {
      scrollY.removeListener(id);
    };
  }, [scrollY]);

  const isBannerInView = isFocused && scrollYVal < bannerHeight * 0.8;

  // Continue Watching check for Banner
  const activeBannerProgress = useMemo(() => {
    if (!activeBanner) return null;
    const cwRow = allRows.find(r => r.key === 'continueWatching');
    const cwItems = cwRow?.items || [];
    return cwItems.find((i: any) => i.id === activeBanner.id && i.mediaType === activeBanner.mediaType) || null;
  }, [activeBanner, allRows]);

  // Load user watchlists
  useEffect(() => {
    async function loadWatchlists() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const lists = await getMyWatchlists();
        setWatchlists(lists || []);
      }
    }
    loadWatchlists();
  }, [user]);

  // Check if active banner is in list
  useEffect(() => {
    if (!activeBanner) return;
    let active = true;
    async function checkWatchlist() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          setInList(false);
          setInListWatchlists([]);
          return;
        }

        const lists = await getWatchlistsForMedia(activeBanner.id, activeBanner.mediaType);
        if (!active) return;
        if (lists && lists.length > 0) {
          setInList(true);
          setInListWatchlists(lists);
        } else {
          setInList(false);
          setInListWatchlists([]);
        }
      } catch (err) {
        console.error(err);
      }
    }
    checkWatchlist();
    return () => { active = false; };
  }, [activeBanner, user]);

  const triggerBounce = (val: Animated.Value) => {
    Animated.sequence([
      Animated.timing(val, { toValue: 1.3, duration: 100, useNativeDriver: true }),
      Animated.spring(val, { toValue: 1, friction: 4, useNativeDriver: true })
    ]).start();
  };

  const showToast = (message: string, showAction: boolean = false) => {
    setToastMessage(message);
    setShowToastAction(showAction);
    setToastVisible(true);
    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(toastTranslateY, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();

    setTimeout(() => {
      hideToast();
    }, 4000);
  };

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(toastTranslateY, { toValue: 20, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      setToastVisible(false);
    });
  };

  const handleMyListPress = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      showGoogleSignIn(() => {
        handleMyListPress();
      });
      return;
    }

    triggerBounce(listScale);

    if (inList) {
      const listIds = [...inListWatchlists];
      setInList(false);
      setInListWatchlists([]);
      for (const listId of listIds) {
        await removeFromWatchlist(listId, activeBanner.id, activeBanner.mediaType);
      }
    } else {
      let watchLaterList = watchlists.find(l => l.name.toLowerCase() === "watch later");
      if (!watchLaterList) {
        watchLaterList = await createWatchlist("Watch Later", "private");
        if (watchLaterList) {
          setWatchlists(prev => [watchLaterList, ...prev]);
        }
      }

      if (watchLaterList) {
        const ok = await addToWatchlist(watchLaterList.id, activeBanner);
        if (ok) {
          setInList(true);
          setInListWatchlists([watchLaterList.id]);
          showToast("added to watch later list", true);
        }
      }
    }
  };

  const handleToggleWatchlistPresence = async (watchlistId: string) => {
    const isAdded = inListWatchlists.includes(watchlistId);
    if (isAdded) {
      const ok = await removeFromWatchlist(watchlistId, activeBanner.id, activeBanner.mediaType);
      if (ok) {
        setInListWatchlists(prev => prev.filter(id => id !== watchlistId));
        if (inListWatchlists.length <= 1) {
          setInList(false);
        }
      }
    } else {
      const ok = await addToWatchlist(watchlistId, activeBanner);
      if (ok) {
        setInListWatchlists(prev => [...prev, watchlistId]);
        setInList(true);
      }
    }
  };

  const handleCreateNewWatchlist = async () => {
    if (!newWatchlistName.trim()) return;
    setCreatingWatchlist(true);
    try {
      const newList = await createWatchlist(newWatchlistName.trim(), "private");
      if (newList) {
        setWatchlists(prev => [newList, ...prev]);
        setNewWatchlistName("");
        setShowNewWatchlistInput(false);
        const ok = await addToWatchlist(newList.id, activeBanner);
        if (ok) {
          setInListWatchlists(prev => [...prev, newList.id]);
          setInList(true);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingWatchlist(false);
    }
  };



  const fetchPrimaryData = async () => {
    try {
      const [trendingAll, newMovies, cwData] = await Promise.all([
        getTrending("all", "week"),
        getLatest("movie"),
        getContinueWatching()
      ]);

      const enrichedBanner = await enrichWithLogos(trendingAll.slice(0, 5));
      setAllBannerItems(enrichedBanner);

      let initialRows: any[] = [];
      if (cwData.length > 0) {
        initialRows.push({ key: 'continueWatching', title: 'Continue Watching', items: cwData, variant: 'continueWatching' });
      }

      initialRows.push({ key: 'trending', title: 'Trending Right Now', items: trendingAll, variant: 'default' });
      initialRows.push({ key: 'newMovies', title: 'New Movies', items: newMovies, variant: 'default' });

      setAllRows(initialRows);

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
        publicWatchlists,
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
        getPublicWatchlists(),
      ]);

      setAllRows((prev: any[]) => {
        let updatedRows = [...prev];

        // Insert becauseYouWatched right after continue watching
        if (becauseYouWatchedItems.length > 0) {
          const cwIndex = updatedRows.findIndex(r => r.key === 'continueWatching');
          updatedRows.splice(cwIndex + 1, 0, { key: 'becauseYouWatched', title: `Because you watched ${becauseYouWatchedTitle}`, items: becauseYouWatchedItems, variant: 'default' });
        }

        updatedRows = [
          ...updatedRows,
          { key: 'nollywoodMovies', title: 'Nollywood Movies', items: nollywoodMovies, variant: 'default' },
          ...(publicWatchlists?.length > 0 ? [{ key: 'communityWatchlist', title: 'Community Watchlist', items: publicWatchlists, variant: 'communityWatchlist' }] : []),
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

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      getContinueWatching().then(cwData => {
        setAllRows(prev => {
          let rows = [...prev];
          const cwIndex = rows.findIndex(r => r.key === 'continueWatching');
          if (cwData.length > 0) {
            const cwRow = { key: 'continueWatching', title: 'Continue Watching', items: cwData, variant: 'continueWatching' };
            if (cwIndex >= 0) rows[cwIndex] = cwRow;
            else rows.unshift(cwRow);
          } else if (cwIndex >= 0) {
            rows.splice(cwIndex, 1);
          }
          return rows;
        });
      });
      return () => {
        setIsFocused(false);
      };
    }, [])
  );

  // Dominant color extraction
  useEffect(() => {
    let mounted = true;
    const banner = bannerItems[0];
    if (banner) {
      const url = tmdbImage(banner.backdropPath || banner.posterPath, 'w780');
      ImageColors.getColors(url, {
        fallback: '#000000',
        cache: true,
      }).then(c => {
        if (!mounted) return;
        if (c.platform === 'ios') {
          setDominantColor(adjustDominantColor(c.primary, 'rgba(0,0,0,0.2)'));
        } else if (c.platform === 'android') {
          setDominantColor(adjustDominantColor(c.dominant || '#ffffffff', 'rgba(0,0,0,0.2)'));
        } else {
          setDominantColor(adjustDominantColor(c.dominant || '#ffffffff', 'rgba(0,0,0,0.2)'));
        }
      }).catch(() => {
        if (mounted) setDominantColor('rgba(0,0,0,0.8)');
      });
    }
    return () => { mounted = false; };
  }, [bannerItems]);

  const [viewableRows, setViewableRows] = useState<Set<string>>(new Set());

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    setViewableRows((prev: Set<string>) => {
      const newSet = new Set(prev);
      viewableItems.forEach((v: any) => {
        if (v.isViewable && v.key) newSet.add(v.key);
      });
      return newSet;
    });
  }).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 10 }).current;

  if (loading && allRows.length === 0) {
    return <HomeSkeleton />;
  }

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 150],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const tabs = ['Home', 'Movies', 'Shows', 'Anime'];

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
        data={rows.filter((r: any) => r.items?.length > 0 || r.variant === 'communityWatchlist')} // hide empty rows
        keyExtractor={item => item.key}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        initialNumToRender={1}
        maxToRenderPerBatch={1}
        windowSize={3}
        renderItem={({ item, index }) => (
          <View style={[index === 0 && { marginTop: -10, zIndex: 2 }]}>
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
          <HomeBanner
            items={bannerItems}
            activeTab={activeTab}
            activeIndex={activeIndex}
            setActiveIndex={setActiveIndex}
            inList={inList}
            onMyListPress={handleMyListPress}
            listScale={listScale}
            activeBannerProgress={activeBannerProgress}
            isActive={isBannerInView}
          />
        }
      />

      {/* WATCHLIST PICKER BOTTOM SHEET */}
      <Sheet visible={watchlistSheetVisible} onClose={() => setWatchlistSheetVisible(false)}>
        <Text style={styles.sheetTitle}>Add to Watchlist</Text>

        <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
          {watchlists.map((list) => {
            const isAdded = inListWatchlists.includes(list.id);
            return (
              <TouchableOpacity
                key={list.id}
                style={styles.sheetListItem}
                onPress={() => handleToggleWatchlistPresence(list.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.sheetCheckbox, isAdded && styles.sheetCheckboxChecked]}>
                  {isAdded && <Icon name="check-line" size={16} color="#000" />}
                </View>
                <Text style={styles.sheetListItemText}>{list.name}</Text>
              </TouchableOpacity>
            );
          })}

          {showNewWatchlistInput ? (
            <View style={styles.newWatchlistContainer}>
              <TextInput
                style={styles.newWatchlistInput}
                placeholder="List Name..."
                placeholderTextColor="rgba(255,255,255,0.4)"
                value={newWatchlistName}
                onChangeText={setNewWatchlistName}
                autoFocus
              />
              <View style={styles.newWatchlistActions}>
                <TouchableOpacity
                  style={[styles.newWatchlistBtn, { backgroundColor: 'rgba(255,255,255,0.1)' }]}
                  onPress={() => setShowNewWatchlistInput(false)}
                >
                  <Text style={styles.newWatchlistBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.newWatchlistBtn, { backgroundColor: '#fff' }]}
                  onPress={handleCreateNewWatchlist}
                  disabled={creatingWatchlist}
                >
                  {creatingWatchlist ? (
                    <ActivityIndicator size="small" color="#000" />
                  ) : (
                    <Text style={[styles.newWatchlistBtnText, { color: '#000' }]}>Create</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.sheetCreateBtn}
              onPress={() => setShowNewWatchlistInput(true)}
              activeOpacity={0.7}
            >
              <Icon name="add-line" size={20} color="rgba(255,255,255,0.6)" />
              <Text style={styles.sheetCreateBtnText}>Create New Watchlist</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        <TouchableOpacity
          style={styles.sheetDoneBtn}
          onPress={() => setWatchlistSheetVisible(false)}
          activeOpacity={0.8}
        >
          <Text style={styles.sheetDoneBtnText}>Done</Text>
        </TouchableOpacity>
      </Sheet>

      {/* WATCH LATER TOAST NOTIFICATION */}
      {toastVisible && (
        <Animated.View style={[
          styles.toastContainer,
          {
            opacity: toastOpacity,
            transform: [{ translateY: toastTranslateY }],
            bottom: Platform.OS === 'ios' ? insets.bottom + 12 : 20
          }
        ]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
          {showToastAction && (
            <TouchableOpacity onPress={() => { hideToast(); setWatchlistSheetVisible(true); }} activeOpacity={0.7}>
              <Text style={styles.toastActionText}>change</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}

      {/* GLOBAL AUTH SHEET */}
      <AuthSheet />

      {/* Sticky Header with Tabs */}
      <View style={styles.stickyHeader} pointerEvents="box-none">
        <Animated.View style={[
          StyleSheet.absoluteFill,
          {
            opacity: headerOpacity,
            backgroundColor: 'rgba(0,0,0,1)',
            // borderBottomWidth: StyleSheet.hairlineWidth,
            // borderBottomColor: 'rrgba(38, 38, 38, 0.33)'
          }
        ]} pointerEvents="none" />

        {/* Top Header Row */}
        <View style={[styles.headerContent, { marginTop: insets.top, paddingVertical: 12, paddingBottom: 16 }]} pointerEvents="box-none">
          <Text style={styles.headerForYouText}>For You</Text>
          <View style={styles.headerIcons}>
            <TouchableOpacity activeOpacity={0.8}>
              <Icon name="search-line" size={24} color="#fff" />
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
            renderItem={({ item }) => (
              <TabItem
                item={item as string}
                isActive={activeTab === item}
                onPress={() => setActiveTab(item as any)}
                headerOpacity={headerOpacity}
              />
            )}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
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
  headerForYouText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
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
    paddingVertical: 8,
    justifyContent: 'center',
    height: 36,
    position: 'relative',
  },
  tabButtonActive: {},
  tabText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
  },
  tabTextActive: {
    color: 'white',
  },
  glowContainer: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    marginLeft: -80,
    width: 160,
    height: 36,
    overflow: 'hidden',
    zIndex: -1,
  },
  glowSquash: {
    position: 'absolute',
    left: 0,
    bottom: -80,
    width: 160,
    height: 160,
    transform: [{ scaleY: 0.5 }],
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 12,
    right: 12,
    height: 2,
    backgroundColor: 'white',
    borderRadius: 1,
  },

  // Sheet additions
  sheetTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    textAlign: 'center',
  },
  sheetListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  sheetCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    marginRight: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetCheckboxChecked: {
    borderColor: '#fff',
    backgroundColor: '#fff',
  },
  sheetListItemText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  sheetCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    marginTop: 8,
  },
  sheetCreateBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 12,
  },
  newWatchlistContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  newWatchlistInput: {
    color: '#fff',
    fontSize: 15,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    marginBottom: 12,
  },
  newWatchlistActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  newWatchlistBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newWatchlistBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  sheetDoneBtn: {
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 20,
    alignItems: 'center',
  },
  sheetDoneBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  // Toast
  toastContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 999,
  },
  toastText: {
    color: '#121214',
    fontSize: 14,
    fontWeight: '600',
  },
  toastActionText: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
});
