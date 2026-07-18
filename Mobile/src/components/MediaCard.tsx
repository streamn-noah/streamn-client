import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Animated } from 'react-native';
import { Image } from 'expo-image';
import { MediaSummary, tmdbImage } from '@/services/media';
import Svg, { Defs, LinearGradient, Stop, Rect, Text as SvgText } from 'react-native-svg';
import Icon from 'react-native-remix-icon';
import { WatchProgress } from '@/services/storage';

interface MediaCardProps {
  item: any; // Can be MediaSummary, WatchProgress, or Watchlist
  variant?: 'default' | 'top10' | 'continueWatching' | 'communityWatchlist';
  rank?: number;
  index?: number;
  shouldAnimate?: boolean;
  onPress?: () => void;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

function formatProgress(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m watched`;
  return `${mins}m watched`;
}

export default function MediaCard({ item, variant = 'default', rank, index = 0, shouldAnimate = true, onPress }: MediaCardProps) {
  const isTop10 = variant === 'top10';
  const isContinueWatching = variant === 'continueWatching';
  const isCommunityWatchlist = variant === 'communityWatchlist';

  const type = item.mediaType === "movie" ? "Movie" : "Series";
  const genreMap: Record<number, string> = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
    53: "Thriller", 10752: "War", 37: "Western"
  };
  const genreStr = item.genreIds?.map((id: number) => genreMap[id]).filter(Boolean)[0] || type;

  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(20)).current;
  const hasAnimated = React.useRef(false);

  React.useEffect(() => {
    if (shouldAnimate && !hasAnimated.current) {
      hasAnimated.current = true;
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 500,
          delay: index * 100, // Stagger effect
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 40,
          delay: index * 100,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [shouldAnimate, index]);

  if (isCommunityWatchlist) {
    const watchlist = item;
    const items = watchlist.watchlist_items?.slice(0, 4) || [];
    const itemCount = watchlist.watchlist_items?.length || 0;

    return (
      <AnimatedTouchable
        activeOpacity={0.8}
        style={[styles.watchlistContainer, { opacity: fadeAnim, transform: [{ translateY }] }]}
        onPress={onPress}
      >
        <View style={styles.watchlistImages}>
          {items.length === 0 ? (
            <View style={styles.emptyWatchlist}>
              <Icon name="information-line" size={24} color="rgba(255,255,255,0.5)" />
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 }}>Empty List</Text>
            </View>
          ) : (
            items.map((watchItem: any, i: number) => {
              const zIndex = 10 - i;
              const leftOffset = i * 20; // px
              const poster = watchItem.poster_path || watchItem.backdrop_path;

              return (
                <View
                  key={i}
                  style={[
                    styles.watchlistItemImage,
                    { zIndex, left: leftOffset },
                  ]}
                >
                  {poster ? (
                    <Image
                      source={{ uri: tmdbImage(poster, 'w200') }}
                      style={{ width: '100%', height: '100%' }}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e232d' }}>
                      <Text style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>No Image</Text>
                    </View>
                  )}
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${i * 0.15})` }]} />
                </View>
              );
            })
          )}
        </View>
        <View style={styles.watchlistMeta}>
          <Text style={styles.watchlistTitle} numberOfLines={2}>{watchlist.name}</Text>
          <View style={styles.watchlistUserRow}>
            {watchlist.profiles?.avatar_url ? (
              <Image source={{ uri: watchlist.profiles.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarFallbackText}>
                  {watchlist.profiles?.display_name?.charAt(0).toUpperCase() || "?"}
                </Text>
              </View>
            )}
            <Text style={styles.watchlistUserText} numberOfLines={1}>
              {watchlist.profiles?.display_name || "Unknown"}
            </Text>
            <Text style={styles.watchlistDot}>·</Text>
            <Text style={styles.watchlistCount}>{itemCount} films</Text>
          </View>
        </View>
      </AnimatedTouchable>
    );
  }

  if (isContinueWatching) {
    const progressItem = item as WatchProgress;
    const isTv = progressItem.mediaType === "tv";
    const titleText = isTv ? `S${progressItem.seasonNumber} E${progressItem.episodeNumber}` : progressItem.title;
    const subtitleText = isTv ? `${progressItem.title} · ${formatProgress(progressItem.progressSeconds)}` : formatProgress(progressItem.progressSeconds);

    return (
      <AnimatedTouchable
        activeOpacity={0.8}
        style={[styles.continueContainer, { opacity: fadeAnim, transform: [{ translateY }] }]}
        onPress={onPress}
      >
        <View style={styles.continueImageContainer}>
          <Image
            source={{ uri: tmdbImage(progressItem.backdropPath || progressItem.posterPath, 'w500') }}
            style={styles.cardImage}
            contentFit="cover"
          />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.3)' }]} />
          <View style={styles.playIconContainer}>
            <Icon name="play-fill" size={24} color="#fff" />
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(progressItem.progressSeconds / progressItem.durationSeconds) * 100}%` }]} />
          </View>
        </View>
        <View style={styles.continueMeta}>
          <Text style={styles.continueTitle} numberOfLines={1}>{titleText}</Text>
          <Text style={styles.continueSubtitle} numberOfLines={1}>{subtitleText}</Text>
        </View>
      </AnimatedTouchable>
    );
  }

  // Default and Top 10
  return (
    <AnimatedTouchable
      activeOpacity={0.8}
      style={[
        styles.cardContainer,
        isTop10 && styles.cardContainerTop10,
        { opacity: fadeAnim, transform: [{ translateY }] }
      ]}
      onPress={onPress}
    >
      <View style={styles.cardImageWrapper}>
        <Image
          source={{ uri: tmdbImage(item.posterPath || item.backdropPath, 'w500') }}
          style={styles.cardImage}
          contentFit="cover"
          transition={300}
        />
        <View style={styles.defaultMeta}>
          <Text style={styles.defaultTitle} numberOfLines={1}>{item.title}</Text>
          <View style={styles.defaultStats}>
            <Icon name="star-fill" size={10} color="#fff" />
            <Text style={styles.defaultStatText}>{item.voteAverage ? item.voteAverage.toFixed(1) : "N/A"}</Text>
            <Text style={styles.defaultStatText}>·</Text>
            <Text style={styles.defaultStatText}>{item.year || "2026"}</Text>
          </View>
        </View>
      </View>

      {isTop10 && rank !== undefined && (
        <View style={styles.top10RankContainer} pointerEvents="none">
          <Text style={styles.top10RankText}>{rank}</Text>
        </View>
      )}
    </AnimatedTouchable>
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
  cardContainer: {
    marginHorizontal: 6,
    width: 130,
    height: 182, // 1:1.4
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardContainerTop10: {
    width: 150,
  },
  cardImageWrapper: {
    width: 130,
    height: 182,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1e232d',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  defaultMeta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  defaultTitle: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
  },
  defaultStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  defaultStatText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 10,
    fontWeight: '500',
  },
  top10RankContainer: {
    position: 'absolute',
    left: -15,
    top: '10%',
    zIndex: -1,
  },
  top10RankText: {
    fontSize: 80,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.2)', // simplified from gradient stroke
  },

  // Continue Watching
  continueContainer: {
    marginHorizontal: 6,
    width: 260,
    flexDirection: 'column',
    gap: 6,
  },
  continueImageContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1e232d',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  playIconContainer: {
    position: 'absolute',
    bottom: 12,
    left: 12,
  },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#e50914',
  },
  continueMeta: {
    paddingHorizontal: 4,
  },
  continueTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  continueSubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },

  // Community Watchlist
  watchlistContainer: {
    marginHorizontal: 6,
    width: 240,
    flexDirection: 'column',
    gap: 12,
  },
  watchlistImages: {
    width: '100%',
    height: 180,
    position: 'relative',
  },
  emptyWatchlist: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 120, // 2/3 of 180
    borderRadius: 12,
    backgroundColor: '#1e232d',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  watchlistItemImage: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 120,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1e232d',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 8, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 16,
  },
  watchlistMeta: {
    paddingHorizontal: 4,
  },
  watchlistTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  watchlistUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
  },
  avatarFallback: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  watchlistUserText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  watchlistDot: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  watchlistCount: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
  },
});
