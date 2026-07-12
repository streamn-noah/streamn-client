import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from 'react-native-remix-icon';
import { MediaSummary } from '@/services/media';
import MediaCard from './MediaCard';

interface MediaRowProps {
  title: string;
  items: MediaSummary[];
  variant?: 'default' | 'top10';
  onTitlePress?: () => void;
  shouldAnimate?: boolean;
}

export default function MediaRow({ title, items, variant = 'default', onTitlePress, shouldAnimate = true }: MediaRowProps) {
  const router = useRouter();
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(30)).current;

  const hasAnimated = React.useRef(false);

  React.useEffect(() => {
    if (shouldAnimate && !hasAnimated.current) {
      hasAnimated.current = true;
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          friction: 8,
          tension: 40,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [shouldAnimate]);

  if (!items.length) return null;
  return (
    <Animated.View style={[styles.rowContainer, { opacity: fadeAnim, transform: [{ translateY }] }]}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={onTitlePress}
        disabled={!onTitlePress}
        style={styles.titleContainer}
      >
        <Text style={styles.rowTitle}>{title}</Text>
        {onTitlePress && <Icon name="arrow-right-s-line" size={28} color="#fff" style={{ marginTop: 2 }} />}
      </TouchableOpacity>
      <FlatList
        data={items}
        horizontal
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => `${item.mediaType}-${item.id}`}
        renderItem={({ item, index }) => (
          <MediaCard 
            item={item} 
            variant={variant} 
            rank={variant === 'top10' ? index + 1 : undefined} 
            index={index}
            shouldAnimate={shouldAnimate}
            onPress={() => router.push((`/main/home/detail/${item.mediaType}/${item.id}` as any))}
          />
        )}
        contentContainerStyle={styles.rowList}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  rowContainer: {
    marginBottom: 32,
  },
  titleContainer: {
    flexDirection: 'row', 
    alignItems: 'center', 
    marginBottom: 12, 
    paddingHorizontal: 16 
  },
  rowTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  rowList: {
    paddingHorizontal: 12,
  },
});
