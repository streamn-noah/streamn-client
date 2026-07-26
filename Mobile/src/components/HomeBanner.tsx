import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { MediaSummary, tmdbImage, adjustDominantColor, getItemFallbackColor } from '@/services/media';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import ImageColors from 'react-native-image-colors';
import { useRouter } from 'expo-router';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.round(SCREEN_WIDTH * 0.78);
const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.36);
const CARD_SPACING = 14;
const SNAP_INTERVAL = CARD_WIDTH + CARD_SPACING;
const SIDE_PADDING = (SCREEN_WIDTH - CARD_WIDTH) / 2;

interface HomeBannerProps {
  items: MediaSummary[];
  activeTab: string;
  activeIndex: number;
  setActiveIndex: (index: number) => void;
  inList: boolean;
  onMyListPress: () => void;
  listScale?: Animated.Value;
  activeBannerProgress?: any;
  isActive: boolean;
  onDominantColorChange?: (color: string) => void;
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
  isActive,
  onDominantColorChange,
}: HomeBannerProps) {
  const router = useRouter();
  const flatListRef = useRef<FlatList<any>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const [bannerColors, setBannerColors] = useState<Record<number, string>>({});
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;

  useEffect(() => {
    setActiveIndex(0);
    activeIndexRef.current = 0;
    flatListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [activeTab]);

  // Extract dominant dark colors for banner items
  useEffect(() => {
    if (!items || items.length === 0) return;

    items.forEach((item) => {
      if (bannerColors[item.id]) return;
      const path = item.posterPath || item.backdropPath;
      const fallback = getItemFallbackColor(item);

      if (!path) {
        setBannerColors((prev) => ({ ...prev, [item.id]: fallback }));
        return;
      }

      const uri = tmdbImage(path, 'w500');
      ImageColors.getColors(uri, { fallback, cache: true })
        .then((colors) => {
          let raw = fallback;
          if (colors.platform === 'ios') {
            raw = colors.primary || colors.background || colors.detail || fallback;
          } else if (colors.platform === 'android') {
            raw = colors.dominant || colors.vibrant || colors.darkVibrant || fallback;
          } else {
            raw = (colors as any).dominant || (colors as any).vibrant || fallback;
          }
          const dark = adjustDominantColor(raw, fallback);
          setBannerColors((prev) => ({ ...prev, [item.id]: dark }));
        })
        .catch(() => {
          setBannerColors((prev) => ({ ...prev, [item.id]: fallback }));
        });
    });
  }, [items]);

  // Notify parent of active item dominant color
  useEffect(() => {
    const currentItem = items[activeIndex];
    if (currentItem) {
      const color = bannerColors[currentItem.id] || getItemFallbackColor(currentItem);
      onDominantColorChange?.(color);
    }
  }, [activeIndex, items, bannerColors, onDominantColorChange]);

  // Auto scroll carousel every 8.5 seconds
  useEffect(() => {
    if (!items || items.length <= 1) return;

    const interval = setInterval(() => {
      if (!flatListRef.current) return;
      const nextIndex = (activeIndexRef.current + 1) % items.length;
      flatListRef.current.scrollToOffset({
        offset: nextIndex * SNAP_INTERVAL,
        animated: true,
      });
    }, 8500);

    return () => clearInterval(interval);
  }, [items]);

  const activeBanner = items[activeIndex < items.length ? activeIndex : 0];
  const targetColor = activeBanner ? bannerColors[activeBanner.id] || getItemFallbackColor(activeBanner) : '#1e293b';

  const [currentColor, setCurrentColor] = useState(targetColor);
  const [prevColor, setPrevColor] = useState(targetColor);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (targetColor !== currentColor) {
      setPrevColor(currentColor);
      setCurrentColor(targetColor);
      fadeAnim.setValue(1);
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 650,
        useNativeDriver: true,
      }).start();
    }
  }, [targetColor, currentColor]);

  const getGenreName = (genreIds?: number[]) => {
    if (!genreIds || genreIds.length === 0) return '';
    const genreMap: Record<number, string> = {
      28: 'Action',
      12: 'Adventure',
      16: 'Animation',
      35: 'Comedy',
      80: 'Crime',
      99: 'Documentary',
      18: 'Drama',
      10751: 'Family',
      14: 'Fantasy',
      36: 'History',
      27: 'Horror',
      10402: 'Music',
      9648: 'Mystery',
      10749: 'Romance',
      878: 'Sci-Fi',
      53: 'Thriller',
      10752: 'War',
      37: 'Western',
    };
    const names = genreIds.map((id) => genreMap[id]).filter(Boolean);
    return names.slice(0, 2).join(' • ');
  };

  if (!items || items.length === 0) return null;

  return (
    <View style={[styles.bannerContainer, { backgroundColor: '#000000' }]}>
      {/* New Active Color Layer */}
      <ExpoLinearGradient
        colors={[currentColor, currentColor, 'rgba(0,0,0,0.55)', '#000000']}
        locations={[0, 0.5, 0.82, 1.0]}
        style={StyleSheet.absoluteFill}
      />

      {/* Previous Color Fading Out Layer */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fadeAnim }]} pointerEvents="none">
        <ExpoLinearGradient
          colors={[prevColor, prevColor, 'rgba(0,0,0,0.55)', '#000000']}
          locations={[0, 0.5, 0.82, 1.0]}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.FlatList
        ref={flatListRef as any}
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={SNAP_INTERVAL}
        decelerationRate="fast"
        contentContainerStyle={{
          paddingHorizontal: SIDE_PADDING,
          paddingTop: 136,
          paddingBottom: 20,
        }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          {
            useNativeDriver: true,
            listener: (event: any) => {
              const offsetX = event.nativeEvent.contentOffset.x;
              const index = Math.round(offsetX / SNAP_INTERVAL);
              if (index !== activeIndexRef.current && index >= 0 && index < items.length) {
                activeIndexRef.current = index;
                setActiveIndex(index);
              }
            },
          }
        )}
        scrollEventThrottle={16}
        keyExtractor={(item) => `banner-${item.id}`}
        renderItem={({ item, index }: { item: MediaSummary; index: number }) => {
          const inputRange = [
            (index - 1) * SNAP_INTERVAL,
            index * SNAP_INTERVAL,
            (index + 1) * SNAP_INTERVAL,
          ];

          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.91, 1.0, 0.91],
            extrapolate: 'clamp',
          });

          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.55, 1.0, 0.55],
            extrapolate: 'clamp',
          });

          const isRecent = item.year
            ? parseInt(item.year, 10) >= 2024 || item.year === '2025' || item.year === '2026'
            : false;

          const isFocused = index === activeIndex;

          return (
            <View style={{ width: CARD_WIDTH, marginRight: CARD_SPACING, alignItems: 'center' }}>
              <TouchableOpacity
                activeOpacity={0.94}
                onPress={() => {
                  if (!isFocused) {
                    flatListRef.current?.scrollToOffset({
                      offset: index * SNAP_INTERVAL,
                      animated: true,
                    });
                  } else if (item.mediaType && item.id) {
                    router.push(`/main/home/detail/${item.mediaType}/${item.id}` as any);
                  }
                }}
              >
                <Animated.View
                  style={[
                    styles.cardContainer,
                    {
                      width: CARD_WIDTH,
                      height: CARD_HEIGHT,
                      transform: [{ scale }],
                      opacity,
                    },
                  ]}
                >
                  <Image
                    source={{ uri: tmdbImage(item.posterPath || item.backdropPath, 'w780') }}
                    style={styles.cardImage}
                    contentFit="cover"
                  />

                  <ExpoLinearGradient
                    colors={[
                      'transparent',
                      'rgba(0,0,0,0.15)',
                      'rgba(0,0,0,0.7)',
                      'rgba(0,0,0,0.92)',
                    ]}
                    locations={[0.3, 0.55, 0.8, 1.0]}
                    style={styles.cardGradient}
                    pointerEvents="none"
                  />

                  <View style={styles.cardContent} pointerEvents="box-none">
                    {isRecent && (
                      <View style={styles.tagBadge}>
                        <Text style={styles.tagBadgeText}>
                          {item.mediaType === 'tv' ? 'New Series' : 'New Movie'}
                        </Text>
                      </View>
                    )}

                    {item.logoPath ? (
                      <Image
                        source={{ uri: tmdbImage(item.logoPath, 'w500') }}
                        style={styles.cardLogo}
                        contentFit="contain"
                      />
                    ) : (
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                    )}

                    <View style={styles.cardMetaRow}>
                      {item.voteAverage > 0 && (
                        <View style={styles.ratingBadge}>
                          <Text style={styles.ratingText}>
                            {item.voteAverage.toFixed(1)}★
                          </Text>
                        </View>
                      )}
                      <Text style={styles.cardMetaText}>
                        {item.year ? `${item.year}` : ''}
                        {item.year && getGenreName(item.genreIds) ? ' • ' : ''}
                        {getGenreName(item.genreIds)}
                      </Text>
                    </View>
                  </View>
                </Animated.View>
              </TouchableOpacity>
            </View>
          );
        }}
      />

      <View style={styles.paginationRow}>
        {items.map((_, i) => {
          const isActive = i === activeIndex;
          return (
            <View
              key={i}
              style={[styles.paginationDot, isActive && styles.paginationDotActive]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    width: SCREEN_WIDTH,
    position: 'relative',
    paddingBottom: 20,
  },
  cardContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1A1A1E',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 14,
    elevation: 10,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  trailerWrapper: {
    ...StyleSheet.absoluteFill,
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '65%',
    borderRadius: 14,
  },
  cardContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingBottom: 18,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  tagBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  tagBadgeText: {
    fontFamily: 'Aeonik-Bold',
    fontSize: 11,
    color: '#000000',
    letterSpacing: 0.2,
  },
  cardLogo: {
    width: '82%',
    height: 44,
    marginBottom: 8,
  },
  cardTitle: {
    fontFamily: 'Aeonik-Bold',
    fontSize: 22,
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 6,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  cardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ratingBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  ratingText: {
    fontFamily: 'Aeonik-Bold',
    fontSize: 11,
    color: '#FFFFFF',
  },
  cardMetaText: {
    fontFamily: 'Aeonik-Medium',
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
  },
  paginationRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  paginationDotActive: {
    width: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
  },
});

