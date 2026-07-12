import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Animated } from 'react-native';
import { Image } from 'expo-image';
import { MediaSummary, tmdbImage } from '@/services/media';
import Svg, { Defs, LinearGradient, Stop, Rect, Text as SvgText } from 'react-native-svg';

interface MediaCardProps {
  item: MediaSummary;
  variant?: 'default' | 'top10';
  rank?: number;
  index?: number;
  shouldAnimate?: boolean;
  onPress?: () => void;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export default function MediaCard({ item, variant = 'default', rank, index = 0, shouldAnimate = true, onPress }: MediaCardProps) {
  const isTop10 = variant === 'top10';

  const type = item.mediaType === "movie" ? "Movie" : "Series";
  const genreMap: Record<number, string> = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
    27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
    53: "Thriller", 10752: "War", 37: "Western"
  };
  const genreStr = item.genreIds?.map(id => genreMap[id]).filter(Boolean)[0] || type;

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

  return (
    <AnimatedTouchable
      activeOpacity={0.8}
      style={[styles.cardContainer, isTop10 && styles.cardContainerTop10, { opacity: fadeAnim, transform: [{ translateY }] }]}
      onPress={onPress}
    >
      <Image
        source={{ uri: tmdbImage(item.posterPath, 'w500') }}
        style={styles.cardImage}
        contentFit="cover"
        transition={300}
      />

      {isTop10 && (
        <View style={styles.fill} pointerEvents="none">
          <Svg height="100%" width="100%" style={styles.fill}>
            <Defs>
              <LinearGradient id="bottomGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#000" stopOpacity="0" />
                <Stop offset="50%" stopColor="#000" stopOpacity="0.2" />
                <Stop offset="100%" stopColor="#000" stopOpacity="0.9" />
              </LinearGradient>
              <LinearGradient id="textGrad" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
                <Stop offset="70%" stopColor="#ffffff" stopOpacity="0.8" />
                <Stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#bottomGrad)" />

            {rank !== undefined && (
              <SvgText
                fill="url(#textGrad)"
                fontSize="64"
                fontWeight="900"
                x="8"
                y="64"
                fontFamily="System"
              >
                {rank}
              </SvgText>
            )}
          </Svg>

          <View style={styles.textOverlay}>
            <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
            <Text style={styles.genre}>{genreStr}</Text>
          </View>
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
    width: 120,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  cardContainerTop10: {
    width: 150,
    height: 220,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  textOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
    alignItems: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 2,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  genre: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  }
});
