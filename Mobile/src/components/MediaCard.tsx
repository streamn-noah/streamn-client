import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Animated, Alert, Modal, TouchableWithoutFeedback } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import ImageColors from 'react-native-image-colors';
import { Image } from 'expo-image';
import { MediaSummary, tmdbImage, adjustDominantColor } from '@/services/media';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect, Text as SvgText } from 'react-native-svg';
import Icon from 'react-native-remix-icon';
import { WatchProgress, removeContinueWatching } from '@/services/storage';

interface MediaCardProps {
  item: any; // Can be MediaSummary, WatchProgress, or Watchlist
  variant?: 'default' | 'top10' | 'continueWatching' | 'communityWatchlist';
  rank?: number;
  index?: number;
  shouldAnimate?: boolean;
  onPress?: () => void;
  width?: number;
  height?: number;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

function formatProgress(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m watched`;
  return `${mins}m watched`;
}

export default function MediaCard({ item, variant = 'default', rank, index = 0, shouldAnimate = true, onPress, width, height }: MediaCardProps) {
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
              const leftOffset = i * 20; // tighter spacing
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
                  {watchlist.profiles?.display_name?.charAt(0).toUpperCase() || "S"}
                </Text>
              </View>
            )}
            <Text style={styles.watchlistUserText} numberOfLines={1}>
              {watchlist.profiles?.display_name || "Streamn User"}
            </Text>
            <Text style={styles.watchlistDot}>·</Text>
            <Text style={styles.watchlistCount}>{itemCount} films</Text>
          </View>
        </View>
      </AnimatedTouchable>
    );
  }

  const [dominantColor, setDominantColor] = React.useState<string>('rgba(0,0,0,0.8)');

  React.useEffect(() => {
    if (isContinueWatching && item) {
      const progressItem = item as WatchProgress;
      const imageUrl = tmdbImage(progressItem.backdropPath || progressItem.posterPath, 'w500');
      if (imageUrl) {
        ImageColors.getColors(imageUrl, {
          fallback: '#1A1A1A',
          cache: true,
          key: imageUrl,
        }).then((colors) => {
          if (colors.platform === 'android') {
            const raw = colors.dominant || colors.vibrant || '#1A1A1A';
            setDominantColor(adjustDominantColor(raw, '#1A1A1A'));
          } else if (colors.platform === 'ios') {
            const raw = colors.background || colors.primary || '#1A1A1A';
            setDominantColor(adjustDominantColor(raw, '#1A1A1A'));
          } else {
            setDominantColor(adjustDominantColor(colors.dominant || '#1A1A1A', '#1A1A1A'));
          }
        }).catch(() => { });
      }
    }
  }, [isContinueWatching, item]);

  if (isContinueWatching) {
    const progressItem = item as WatchProgress;
    const isTv = progressItem.mediaType === "tv";
    const titleText = isTv ? `S${progressItem.seasonNumber || 1}, E${progressItem.episodeNumber || 1}` : null;
    const subtitleText = formatProgress(progressItem.progressSeconds);
    const progressPercent = Math.min((progressItem.progressSeconds / (progressItem.durationSeconds || 1)) * 100, 100);

    const [isMenuVisible, setMenuVisible] = React.useState(false);

    const handleRemove = () => {
      Alert.alert("Remove", "Remove this from Continue Watching?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove", style: "destructive", onPress: async () => {
            await removeContinueWatching(progressItem);
            Alert.alert("Removed", "Swipe down to refresh the Home screen.");
          }
        }
      ]);
    };

    return (
      <>
        <AnimatedTouchable
          activeOpacity={0.8}
          style={[styles.continueContainer, { opacity: fadeAnim, transform: [{ translateY }] }]}
          onPress={onPress}
        >
          <Image
            source={{ uri: tmdbImage(progressItem.backdropPath || progressItem.posterPath, 'w500') }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
          />
          <LinearGradient
            colors={[dominantColor, 'transparent', 'transparent', dominantColor]}
            style={StyleSheet.absoluteFill}
            locations={[0, 0.3, 0.6, 1]}
          />

          <View style={styles.continueTopRow}>
            <Text style={styles.continueTopTitle} numberOfLines={1}>{progressItem.title}</Text>
          </View>

          <View style={styles.continueBottomRow}>
            <View style={styles.continuePlayIcon}>
              <Icon name="play-fill" size={16} color="#fff" />
            </View>

            <View style={styles.continueInfo}>
              <View style={styles.continueProgressTrack}>
                <View style={[styles.continueProgressFill, { width: `${progressPercent}%` }]} />
              </View>
              <View style={styles.continueTextRow}>
                {titleText && (
                  <>
                    <Text style={[styles.continueTitleText, { flexShrink: 1 }]} numberOfLines={1}>{titleText}</Text>
                    <Text style={styles.continueDot}>·</Text>
                  </>
                )}
                <Text style={[styles.continueSubtitleText, { flexShrink: 1 }]} numberOfLines={1}>{subtitleText}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.continueOptionsBtn} activeOpacity={0.6} onPress={(e) => { e.stopPropagation(); setMenuVisible(true); }}>
              <Icon name="more-fill" size={20} color="rgba(255,255,255,0.7)" />
            </TouchableOpacity>
          </View>
        </AnimatedTouchable>

        <Modal visible={isMenuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
          <TouchableWithoutFeedback onPress={() => setMenuVisible(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.menuContainer}>
                  <TouchableOpacity style={styles.menuItem} onPress={() => setMenuVisible(false)}>
                    <Icon name="arrow-down-circle-line" size={20} color="#fff" />
                    <Text style={styles.menuItemText}>Download</Text>
                  </TouchableOpacity>

                  {isTv && (
                    <>
                      <TouchableOpacity style={styles.menuItem} onPress={() => setMenuVisible(false)}>
                        <Icon name="information-line" size={20} color="#fff" />
                        <Text style={styles.menuItemText}>Go to Episode</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.menuItem} onPress={() => setMenuVisible(false)}>
                        <Icon name="information-line" size={20} color="#fff" />
                        <Text style={styles.menuItemText}>Go to Show</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.menuItem} onPress={() => setMenuVisible(false)}>
                        <Icon name="share-box-line" size={20} color="#fff" />
                        <Text style={styles.menuItemText}>Share Episode</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.menuItem} onPress={() => setMenuVisible(false)}>
                        <Icon name="share-box-line" size={20} color="#fff" />
                        <Text style={styles.menuItemText}>Share Show</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  {!isTv && (
                    <>
                      <TouchableOpacity style={styles.menuItem} onPress={() => setMenuVisible(false)}>
                        <Icon name="information-line" size={20} color="#fff" />
                        <Text style={styles.menuItemText}>Go to Movie</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.menuItem} onPress={() => setMenuVisible(false)}>
                        <Icon name="share-box-line" size={20} color="#fff" />
                        <Text style={styles.menuItemText}>Share Movie</Text>
                      </TouchableOpacity>
                    </>
                  )}

                  <TouchableOpacity style={styles.menuItem} onPress={() => setMenuVisible(false)}>
                    <Icon name="subtract-line" size={20} color="#fff" />
                    <Text style={styles.menuItemText}>Remove from Watchlist</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.menuItem} onPress={() => setMenuVisible(false)}>
                    <Icon name="checkbox-multiple-blank-line" size={20} color="#fff" />
                    <Text style={styles.menuItemText}>Mark as Watched</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); handleRemove(); }}>
                    <Icon name="delete-bin-line" size={20} color="#fff" />
                    <Text style={styles.menuItemText}>Remove from Recently Watched</Text>
                  </TouchableOpacity>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </>
    );
  }

  // Default and Top 10
  return (
    <AnimatedTouchable
      activeOpacity={0.8}
      style={[
        styles.cardContainer,
        isTop10 && styles.cardContainerTop10,
        width !== undefined && { width },
        height !== undefined && { height },
        { opacity: fadeAnim, transform: [{ translateY }] }
      ]}
      onPress={onPress}
    >
      <View style={[
        styles.cardImageWrapper,
        width !== undefined && { width },
        height !== undefined && { height }
      ]}>
        <Image
          source={{ uri: tmdbImage(item.posterPath || item.backdropPath, 'w500') }}
          style={styles.cardImage}
          contentFit="cover"
          transition={300}
        />

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
    borderColor: 'rgba(255,255,255,0.1)',
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
    width: 280,
    aspectRatio: 16 / 9,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1e232d',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  continueTopRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: 12,
  },
  continueTopTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  continueBottomRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
  },
  continuePlayIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueInfo: {
    flex: 1,
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 4,
  },
  continueProgressTrack: {
    width: 24,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  continueProgressFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  continueTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  continueTitleText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  continueDot: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
  continueSubtitleText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '500',
  },
  continueOptionsBtn: {
    padding: 4,
  },

  // Community Watchlist
  watchlistContainer: {
    marginHorizontal: 6,
    width: 180,
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
    borderColor: 'rgba(255,255,255,0.1)',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContainer: {
    width: 260,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(25, 25, 25, 0.98)',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  menuItemText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
    flexShrink: 1,
  },
});
