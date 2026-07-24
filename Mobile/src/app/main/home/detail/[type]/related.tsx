import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Icon from 'react-native-remix-icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MediaSummary, MediaType } from '@/services/media';
import { getMediaDetail } from '@/services/tmdb';
import MediaCard from '@/components/MediaCard';

export default function RelatedScreen() {
  const { type, id } = useLocalSearchParams<{ type: MediaType; id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<MediaSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!type || !id) return;
      try {
        setLoading(true);
        const detail = await getMediaDetail(type, Number(id));
        if (detail?.recommendations) {
          setItems(detail.recommendations);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [type, id]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Icon name="arrow-left-line" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Related Content</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#fff" />
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
            <View style={styles.cardWrapper}>
              <MediaCard 
                item={item} 
                onPress={() => router.push(`/main/home/detail/${item.mediaType}/${item.id}` as any)}
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No related content found.</Text>
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
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  backBtn: {
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
  listContent: {
    padding: 16,
    paddingBottom: 100,
  },
  columnWrapper: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cardWrapper: {
    width: '31%',
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
