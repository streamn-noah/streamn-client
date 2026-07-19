import AsyncStorage from '@react-native-async-storage/async-storage';
import { MediaSummary, MediaType } from './media';

export type WatchProgress = MediaSummary & {
  progressSeconds: number;
  durationSeconds: number;
  seasonNumber?: number;
  episodeNumber?: number;
  updatedAt: number;
};

const CONTINUE_WATCHING_KEY = 'streamn_continue_watching';

export async function getContinueWatching(): Promise<WatchProgress[]> {
  try {
    const data = await AsyncStorage.getItem(CONTINUE_WATCHING_KEY);
    if (!data) return [];
    return JSON.parse(data) as WatchProgress[];
  } catch {
    return [];
  }
}

export async function getLastWatched(): Promise<WatchProgress | null> {
  const cw = await getContinueWatching();
  return cw.length > 0 ? cw[0] : null;
}

export async function getWatchProgress(mediaType: MediaType, id: number): Promise<WatchProgress | null> {
  const cw = await getContinueWatching();
  return cw.find(item => item.mediaType === mediaType && item.id === id) || null;
}

export async function saveWatchProgress(item: WatchProgress) {
  try {
    const cw = await getContinueWatching();
    item.updatedAt = Date.now();
    const existingIndex = cw.findIndex(i => i.id === item.id && i.mediaType === item.mediaType);
    if (existingIndex >= 0) {
      cw[existingIndex] = item;
    } else {
      cw.unshift(item);
    }
    cw.sort((a, b) => b.updatedAt - a.updatedAt);
    await AsyncStorage.setItem(CONTINUE_WATCHING_KEY, JSON.stringify(cw.slice(0, 20)));
  } catch (e) {
    console.error('Failed to save watch progress', e);
  }
}

export async function removeContinueWatching(item: WatchProgress) {
  try {
    let cw = await getContinueWatching();
    cw = cw.filter(i => !(i.id === item.id && i.mediaType === item.mediaType));
    await AsyncStorage.setItem(CONTINUE_WATCHING_KEY, JSON.stringify(cw));
  } catch (e) {
    console.error('Failed to remove continue watching', e);
  }
}
