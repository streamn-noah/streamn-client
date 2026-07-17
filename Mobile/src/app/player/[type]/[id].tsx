import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Platform, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { WebView } from 'react-native-webview';
import Icon from 'react-native-remix-icon';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CustomPlayer from '@/components/streamn/custom-player';
import { getMediaDetail } from '@/services/tmdb';
import { MediaSummary, MediaType } from '@/services/media';
import { fetchStreamSources, getFileSizeRange } from '@/services/stream-source';

export default function PlayerScreen() {
  const { type, id, season, episode } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [item, setItem] = useState<MediaSummary | null>(null);
  const [fileSizeRange, setFileSizeRange] = useState<string | null>(null);
  const [isH265, setIsH265] = useState(false);
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

        if (streamData && streamData.sources && streamData.sources.length > 0) {
          setFileSizeRange(getFileSizeRange(streamData.sources));
          
          const bestSource = streamData.sources[0];
          const fmt = (bestSource.type || '').toLowerCase();
          const qual = (String(bestSource.quality) || '').toLowerCase();
          const urlStr = (bestSource.url || '').toLowerCase();
          
          const isH265Stream = fmt.includes('265') || fmt.includes('hevc') ||
                               qual.includes('265') || qual.includes('hevc') ||
                               urlStr.includes('h265') || urlStr.includes('hevc');
                               
          setIsH265(isH265Stream);
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

  if (Platform.OS === 'ios' && isH265) {
    const webUrl = `${process.env.EXPO_PUBLIC_API_URL || 'https://streamn.vercel.app'}/watch/${type}/${id}?s=${season || 1}&e=${episode || 1}`;
    
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <WebView 
          source={{ uri: webUrl }}
          style={{ flex: 1 }}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
        />
        <View style={[styles.iosTopBar, { paddingTop: Math.max(insets.top, 16) }]} pointerEvents="box-none">
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
            <BlurView intensity={20} tint="light" style={styles.glassBtn}>
              <Icon name="close-line" size={24} color="#fff" />
            </BlurView>
          </TouchableOpacity>
        </View>
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
