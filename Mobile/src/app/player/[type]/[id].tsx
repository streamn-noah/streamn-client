import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';

import CustomPlayer from '@/components/streamn/custom-player';
import { getMediaDetail } from '@/services/tmdb';
import { MediaSummary, MediaType } from '@/services/media';
import { fetchStreamSources, getFileSizeRange } from '@/services/stream-source';

export default function PlayerScreen() {
  const { type, id, season, episode } = useLocalSearchParams();
  const router = useRouter();

  const [item, setItem] = useState<MediaSummary | null>(null);
  const [fileSizeRange, setFileSizeRange] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Lock to landscape
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);

    return () => {
      // Restore to portrait when leaving player
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        const mediaType = type as MediaType;
        const mediaId = Number(id);
        const sNum = season ? Number(season) : 1;
        const eNum = episode ? Number(episode) : 1;

        const detail = await getMediaDetail(mediaType, mediaId);
        if (!active) return;
        
        if (detail) {
          setItem(detail);
        }

        // Pre-fetch stream sources to get file size range
        const streamData = await fetchStreamSources(mediaType, mediaId, sNum, eNum);
        if (!active) return;

        if (streamData && streamData.sources) {
          setFileSizeRange(getFileSizeRange(streamData.sources));
        }

      } catch (err) {
        console.error("Error loading player data", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    return () => { active = false; };
  }, [type, id, season, episode]);

  if (loading || !item) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <CustomPlayer
        mediaType={type as MediaType}
        mediaId={Number(id)}
        season={season ? Number(season) : 1}
        episode={episode ? Number(episode) : 1}
        item={item}
        fileSizeRange={fileSizeRange}
        onClose={() => router.back()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
