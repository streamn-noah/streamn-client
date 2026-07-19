import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Icon from 'react-native-remix-icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MediaSummary } from '@/services/media';
import { 
  getPersonCredits, 
  getTrending, 
  getLatest, 
  getTopRated, 
  discoverByGenre, 
  discoverByOriginCountry, 
  getAnime,
  getMediaDetail
} from '@/services/tmdb';
import MediaCard from '@/components/MediaCard';

const { width } = Dimensions.get('window');

export default function GenericListScreen() {
  const { title, rowKey, personId, mediaId, mediaType } = useLocalSearchParams<{ title: string; rowKey?: string; personId?: string; mediaId?: string; mediaType?: 'movie' | 'tv' }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<MediaSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const cardWidth = (width - 48) / 3;
  const cardHeight = cardWidth * 1.4;

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        if (personId) {
          const personCredits = await getPersonCredits(Number(personId));
          setItems(personCredits);
        } else if (rowKey === 'recommendations' && mediaId && mediaType) {
          const detail = await getMediaDetail(mediaType, Number(mediaId));
          setItems(detail?.recommendations || []);
        } else if (rowKey) {
          let data: MediaSummary[] = [];
          switch (rowKey) {
            case 'trending':
              data = await getTrending("all", "week");
              break;
            case 'newMovies':
              data = await getLatest("movie");
              break;
            case 'nollywoodMovies':
              data = await discoverByOriginCountry("movie", "NG");
              break;
            case 'nollywoodShows':
              data = await discoverByOriginCountry("tv", "NG");
              break;
            case 'topRatedSeries':
              data = await getTopRated("tv");
              break;
            case 'topRatedMovies':
              data = await getTopRated("movie");
              break;
            case 'blockbusterAction':
              data = await discoverByGenre("movie", 28);
              break;
            case 'kdramas':
              data = await discoverByOriginCountry("tv", "KR");
              break;
            case 'laughOutLoud':
              data = await discoverByGenre("movie", 35);
              break;
            case 'sciFiFantasy':
              data = await discoverByGenre("movie", 878);
              break;
            case 'animeSeries':
              data = await getAnime();
              break;
            case 'spineChillingHorror':
              data = await discoverByGenre("movie", 27);
              break;
            case 'heartwarmingRomance':
              data = await discoverByGenre("movie", 10749);
              break;
            case 'voyageOfAdventure':
              data = await discoverByGenre("movie", 12);
              break;
            case 'crimeThrillers':
              data = await discoverByGenre("movie", 80);
              break;
            default:
              data = [];
          }
          setItems(data);
        }
      } catch (err) {
        console.error("Failed to load list content", err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [rowKey, personId]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity style={styles.circleBtn} onPress={() => router.back()}>
          <Icon name="arrow-left-line" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title || 'Browse'}</Text>
        <TouchableOpacity style={styles.circleBtn} onPress={() => router.back()}>
          <Icon name="close-line" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.mediaType}-${item.id}`}
          numColumns={3}
          contentContainerStyle={styles.listContent}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <View style={styles.gridItem}>
              <MediaCard 
                item={item} 
                width={cardWidth}
                height={cardHeight}
                onPress={() => router.push(`/main/home/detail/${item.mediaType}/${item.id}` as any)}
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No content found.</Text>
            </View>
          }
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
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    flex: 1,
    marginHorizontal: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 80,
  },
  columnWrapper: {
    justifyContent: 'flex-start',
    gap: 8,
    marginBottom: 16,
  },
  gridItem: {
    width: '33.33%',
    alignItems: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 16,
  },
});
