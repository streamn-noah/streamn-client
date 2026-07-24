import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Icon from 'react-native-remix-icon';
import { MediaSummary, tmdbImage } from '@/services/media';
import { colors, typography } from '@/constants/theme';

interface LandscapeMediaCardProps {
  item: MediaSummary;
  onPress?: () => void;
}

export default function LandscapeMediaCard({ item, onPress }: LandscapeMediaCardProps) {
  const router = useRouter();

  const handlePlayPress = (e: any) => {
    e.stopPropagation();
    router.push(`/player/${item.mediaType}/${item.id}?season=1&episode=1` as any);
  };

  const handleCardPress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push(`/main/home/detail/${item.mediaType}/${item.id}` as any);
    }
  };

  const yearText = item.year || '';
  const typeText = item.mediaType === 'movie' ? 'Movie' : 'Series';
  const ratingText = item.voteAverage ? `${item.voteAverage.toFixed(1)}★` : '';
  const metadata = [yearText, ratingText, typeText].filter(Boolean).join('  •  ');

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={handleCardPress}
      style={styles.cardContainer}
    >
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: tmdbImage(item.backdropPath || item.posterPath, 'w300') }}
          style={styles.image}
          contentFit="cover"
          transition={200}
        />
      </View>

      <View style={styles.textContainer}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.subtitle}>
          {metadata}
        </Text>
      </View>

      <TouchableOpacity
        activeOpacity={0.6}
        onPress={handlePlayPress}
        style={styles.playButton}
      >
        <Icon name="play-circle-line" size={32} color="#FFFFFF" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginVertical: 4,
  },
  imageContainer: {
    width: 120,
    height: 68, // 16:9 ratio
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    flex: 1,
    marginLeft: 16,
    marginRight: 8,
    justifyContent: 'center',
  },
  title: {
    fontFamily: typography.bodyBold.fontFamily,
    fontWeight: '700',
    fontSize: 16,
    color: '#FFFFFF',
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  playButton: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
