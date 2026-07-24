import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import Icon from 'react-native-remix-icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getTopRated, getMediaDetail } from '@/services/tmdb';
import { MediaSummary, tmdbImage } from '@/services/media';
import { colors } from '@/constants/theme';

export default function Top10Screen() {
  const { type, id, title: routeTitle } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [items, setItems] = useState<MediaSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const isMovie = type === 'movie';
  const defaultTitle = isMovie ? 'Top 10 Movies' : 'Top 10 TV Shows';
  const displayTitle = routeTitle ? String(routeTitle) : defaultTitle;

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      try {
        setLoading(true);
        if (id) {
          const detail = await getMediaDetail(isMovie ? 'movie' : 'tv', Number(id));
          if (mounted && detail?.recommendations) {
            setItems(detail.recommendations);
          }
        } else {
          const data = await getTopRated(isMovie ? 'movie' : 'tv');
          if (mounted) {
            setItems(data.slice(0, 10));
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadData();
    return () => { mounted = false; };
  }, [type, id]);

  const getGenreString = (item: MediaSummary) => {
    const defaultType = isMovie ? "Movie" : "Series";
    const genreMap: Record<number, string> = {
      28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
      99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
      27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
      53: "Thriller", 10752: "War", 37: "Western"
    };
    return item.genreIds?.map(id => genreMap[id]).filter(Boolean)[0] || defaultType;
  };

  const renderItem = ({ item, index }: { item: MediaSummary, index: number }) => (
    <TouchableOpacity 
      style={styles.row} 
      activeOpacity={0.7}
      onPress={() => router.push(`/main/home/detail/${item.mediaType}/${item.id}` as any)}
    >
      <Image
        source={{ uri: tmdbImage(item.posterPath, 'w500') }}
        style={styles.poster}
        contentFit="cover"
        transition={200}
      />
      
      {!id && <Text style={styles.rank}>{index + 1}</Text>}
      {id && <View style={{ width: 16 }} />}
      
      <View style={styles.infoContainer}>
        <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
        <Text style={styles.itemGenre}>{getGenreString(item)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Icon name="arrow-left-s-line" size={28} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{displayTitle}</Text>
        <View style={styles.headerRightPlaceholder} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 20 }]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#000',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    zIndex: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  headerRightPlaceholder: {
    width: 40, // Match backButton width for center alignment
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  poster: {
    width: 70,
    height: 105,
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
  },
  rank: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
    width: 50,
    textAlign: 'center',
  },
  infoContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  itemTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  itemGenre: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '500',
  },
  separator: {
    height: 1,
    backgroundColor: '#1a1a1a',
    marginLeft: 120, // Align with text start
  }
});
