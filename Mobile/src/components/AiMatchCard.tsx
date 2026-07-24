import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import Icon from 'react-native-remix-icon';
import { MediaSummary, tmdbImage } from '@/services/media';
import { typography } from '@/constants/theme';

interface AiMatchCardProps {
  item: MediaSummary;
  onPress?: () => void;
  onMenuPress?: () => void;
}

export default function AiMatchCard({ item, onPress, onMenuPress }: AiMatchCardProps) {
  const router = useRouter();

  const handleCardPress = () => {
    if (onPress) {
      onPress();
    } else {
      router.push(`/main/home/detail/${item.mediaType}/${item.id}` as any);
    }
  };

  const handleMenuPress = (e: any) => {
    e.stopPropagation();
    if (onMenuPress) {
      onMenuPress();
    }
  };

  const yearText = item.year || '';
  const typeText = item.mediaType === 'movie' ? 'Movie' : 'Series';
  const ratingText = item.voteAverage ? `${item.voteAverage.toFixed(1)}★` : '';
  const metadata = [yearText, ratingText, typeText].filter(Boolean).join('  •  ');

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={handleCardPress}
      style={styles.cardContainer}
    >
      {/* Poster Background */}
      <Image
        source={{ uri: tmdbImage(item.posterPath || item.backdropPath, 'w500') }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={300}
      />

      {/* Dark Gradient Overlay for text readability */}
      <LinearGradient
        colors={['transparent', 'rgba(0, 0, 0, 0.4)', 'rgba(0, 0, 0, 0.95)']}
        locations={[0, 0.4, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Top Menu Icon */}
      <TouchableOpacity
        activeOpacity={0.6}
        onPress={handleMenuPress}
        style={styles.menuButton}
      >
        <Icon name="more-2-fill" size={20} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Bottom Content Overlay */}
      <View style={styles.contentContainer}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>

        <Text style={styles.metadata}>
          {metadata}
        </Text>

        <Text style={styles.overview} numberOfLines={3}>
          {item.overview || 'No description available.'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    width: 240,
    height: 340,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
    marginHorizontal: 8,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  menuButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    justifyContent: 'flex-end',
  },
  title: {
    fontFamily: typography.bodyBold.fontFamily,
    fontWeight: '700',
    fontSize: 20,
    color: '#FFFFFF',
    marginBottom: 6,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  metadata: {
    fontFamily: typography.caption.fontFamily,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 8,
  },
  overview: {
    fontFamily: typography.body.fontFamily,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.55)',
    lineHeight: 16,
  },
});
