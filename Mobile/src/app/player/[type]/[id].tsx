import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import Icon from 'react-native-remix-icon';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CustomPlayer from '@/components/streamn/custom-player';
import { getMediaDetail } from '@/services/tmdb';
import { MediaSummary, MediaType } from '@/services/media';
import { fetchStreamSources, getFileSizeRange } from '@/services/stream-source';
import { getDownload } from '@/services/download';

export default function PlayerScreen() {
  const { type, id, season, episode } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

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

        let detail = null;
        try {
          detail = await getMediaDetail(mediaType, mediaId);
        } catch (err) {
          console.warn("Failed to fetch media detail from TMDB, checking local downloads:", err);
        }

        if (!detail && active) {
          const download = getDownload(mediaType, mediaId, sNum, eNum);
          if (download) {
            detail = {
              id: download.id,
              mediaType: download.mediaType,
              title: download.title,
              subtitle: '',
              overview: download.overview,
              posterPath: download.localPosterUri || download.posterPath,
              backdropPath: download.backdropPath,
              voteAverage: download.voteAverage,
              year: download.year,
              genreIds: [],
              runtime: download.runtime,
              certification: 'PG-13',
              genres: [],
              logoPath: null,
              trailerKey: null,
              cast: [],
              recommendations: [],
              seasons: [],
              episodes: [],
              videos: [],
            } as any;
          }
        }

        if (!active) return;
        
        if (detail) {
          setItem(detail);
        }

        // Pre-fetch stream sources to get file size range
        const streamData = await fetchStreamSources(mediaType, mediaId, sNum, eNum);
        if (!active) return;

        if (streamData && streamData.sources && streamData.sources.length > 0) {
          setFileSizeRange(getFileSizeRange(streamData.sources));
          
          const bestSource = streamData.sources[0];
          const fmt = (bestSource.type || '').toLowerCase();
          const qual = (String(bestSource.quality) || '').toLowerCase();
          const urlStr = (bestSource.url || '').toLowerCase();
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
  iosTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 48,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    zIndex: 10,
  },
  glassBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
