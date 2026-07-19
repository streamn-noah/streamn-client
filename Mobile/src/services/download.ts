import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { MediaType } from './media';

const DOWNLOADS_KEY = 'streamn_downloads_list';

export interface DownloadItem {
  id: number;
  mediaType: MediaType;
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  year: string;
  runtime: number | null;
  voteAverage: number;
  // TV specific
  seasonNumber?: number;
  episodeNumber?: number;
  episodeName?: string;
  episodeOverview?: string;
  // Local files
  localVideoUri: string;
  localPosterUri: string | null;
  // Download metadata
  quality: string;
  sizeStr: string;
  sizeBytes: number;
  addedAt: number;
}

export interface ActiveDownload {
  id: number;
  mediaType: MediaType;
  seasonNumber?: number;
  episodeNumber?: number;
  title: string;
  episodeName?: string;
  progress: number; // 0 to 1
  status: 'downloading' | 'paused' | 'error';
  localVideoUri: string;
  resumable: any;
}

let completedDownloads: DownloadItem[] = [];
const activeDownloads = new Map<string, ActiveDownload>(); // key: "type:id:season:episode"

type DownloadListener = () => void;
const listeners = new Set<DownloadListener>();

export function subscribeToDownloads(listener: DownloadListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  listeners.forEach((l) => l());
}

export function getDownloadKey(mediaType: MediaType, id: number, season = 1, episode = 1) {
  return mediaType === 'movie'
    ? `movie:${id}`
    : `tv:${id}:${season}:${episode}`;
}

export async function initDownloadManager() {
  try {
    const data = await AsyncStorage.getItem(DOWNLOADS_KEY);
    if (data) {
      completedDownloads = JSON.parse(data);
    }
  } catch (e) {
    console.error('Failed to load downloads list', e);
  }
}

export function getCompletedDownloads() {
  return completedDownloads;
}

export function getActiveDownloadsList() {
  return Array.from(activeDownloads.values());
}

export function getDownloadState(mediaType: MediaType, id: number, season = 1, episode = 1) {
  const key = getDownloadKey(mediaType, id, season, episode);
  if (
    completedDownloads.some((item) => {
      if (mediaType === 'movie') {
        return item.mediaType === 'movie' && item.id === id;
      } else {
        return (
          item.mediaType === 'tv' &&
          item.id === id &&
          item.seasonNumber === season &&
          item.episodeNumber === episode
        );
      }
    })
  ) {
    return 'completed';
  }
  if (activeDownloads.has(key)) {
    return 'downloading';
  }
  return 'none';
}

export function getDownloadProgress(mediaType: MediaType, id: number, season = 1, episode = 1) {
  const key = getDownloadKey(mediaType, id, season, episode);
  const active = activeDownloads.get(key);
  return active ? active.progress : 0;
}

export function getDownload(mediaType: MediaType, id: number, season = 1, episode = 1) {
  return completedDownloads.find((item) => {
    if (mediaType === 'movie') {
      return item.mediaType === 'movie' && item.id === id;
    } else {
      return (
        item.mediaType === 'tv' &&
        item.id === id &&
        item.seasonNumber === season &&
        item.episodeNumber === episode
      );
    }
  });
}

export async function startDownload({
  id,
  mediaType,
  title,
  overview,
  posterPath,
  backdropPath,
  year,
  runtime,
  voteAverage,
  seasonNumber,
  episodeNumber,
  episodeName,
  episodeOverview,
  streamUrl,
  quality,
  sizeStr,
}: {
  id: number;
  mediaType: MediaType;
  title: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  year: string;
  runtime: number | null;
  voteAverage: number;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeName?: string;
  episodeOverview?: string;
  streamUrl: string;
  quality: string;
  sizeStr: string;
}) {
  const key = getDownloadKey(mediaType, id, seasonNumber, episodeNumber);

  if (getDownloadState(mediaType, id, seasonNumber, episodeNumber) !== 'none') {
    console.log('Download already completed or in progress for key:', key);
    return;
  }

  // Create directory if it doesn't exist
  const dirPath = FileSystem.documentDirectory + 'downloads/';
  const dirInfo = await FileSystem.getInfoAsync(dirPath);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true });
  }

  const timestamp = Date.now();
  const videoFileName = `${mediaType}_${id}_${seasonNumber || 0}_${episodeNumber || 0}_${timestamp}.mp4`;
  const localVideoUri = dirPath + videoFileName;

  // Pre-download poster image locally
  let localPosterUri: string | null = null;
  if (posterPath) {
    try {
      const posterFileName = `${mediaType}_${id}_poster.jpg`;
      const posterTargetUri = dirPath + posterFileName;
      const posterDownload = await FileSystem.downloadAsync(posterPath, posterTargetUri);
      if (posterDownload.status === 200) {
        localPosterUri = posterDownload.uri;
      }
    } catch (e) {
      console.warn('Failed to download poster image locally, fallback to remote:', e);
    }
  }

  // Setup resumable download
  const callback = (downloadProgress: any) => {
    const progress =
      downloadProgress.totalBytesExpectedToWrite > 0
        ? downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite
        : 0;
    const active = activeDownloads.get(key);
    if (active) {
      active.progress = progress;
      notifyListeners();
    }
  };

  const resumable = FileSystem.createDownloadResumable(
    streamUrl,
    localVideoUri,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
      },
    },
    callback
  );

  const activeDownload: ActiveDownload = {
    id,
    mediaType,
    seasonNumber,
    episodeNumber,
    title,
    episodeName,
    progress: 0,
    status: 'downloading',
    localVideoUri,
    resumable,
  };

  activeDownloads.set(key, activeDownload);
  notifyListeners();

  try {
    const downloadResult = await resumable.downloadAsync();

    if (downloadResult && downloadResult.status === 200) {
      const sizeBytes = downloadResult.headers['content-length']
        ? parseInt(downloadResult.headers['content-length'], 10)
        : 0;

      const newItem: DownloadItem = {
        id,
        mediaType,
        title,
        overview,
        posterPath,
        backdropPath,
        year,
        runtime,
        voteAverage,
        seasonNumber,
        episodeNumber,
        episodeName,
        episodeOverview,
        localVideoUri: downloadResult.uri,
        localPosterUri,
        quality,
        sizeStr: sizeStr || (sizeBytes > 0 ? (sizeBytes / (1024 * 1024)).toFixed(1) + ' MB' : 'Unknown'),
        sizeBytes,
        addedAt: Date.now(),
      };

      completedDownloads.push(newItem);
      await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(completedDownloads));
      activeDownloads.delete(key);
      notifyListeners();
    } else {
      throw new Error(`Download failed with status: ${downloadResult?.status}`);
    }
  } catch (err) {
    console.error('Error downloading file for key:', key, err);
    activeDownloads.delete(key);
    notifyListeners();

    // Cleanup half-downloaded file
    try {
      const fileInfo = await FileSystem.getInfoAsync(localVideoUri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(localVideoUri, { idempotent: true });
      }
    } catch (e) {}
  }
}

export async function cancelDownload(mediaType: MediaType, id: number, season = 1, episode = 1) {
  const key = getDownloadKey(mediaType, id, season, episode);
  const active = activeDownloads.get(key);
  if (active) {
    try {
      await active.resumable.pauseAsync();
    } catch (e) {}
    activeDownloads.delete(key);
    notifyListeners();

    // Clean up partial file
    try {
      const fileInfo = await FileSystem.getInfoAsync(active.localVideoUri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(active.localVideoUri, { idempotent: true });
      }
    } catch (e) {}
  }
}

export async function deleteDownload(mediaType: MediaType, id: number, season = 1, episode = 1) {
  const index = completedDownloads.findIndex((item) => {
    if (mediaType === 'movie') {
      return item.mediaType === 'movie' && item.id === id;
    } else {
      return (
        item.mediaType === 'tv' &&
        item.id === id &&
        item.seasonNumber === season &&
        item.episodeNumber === episode
      );
    }
  });

  if (index >= 0) {
    const item = completedDownloads[index];
    completedDownloads.splice(index, 1);
    await AsyncStorage.setItem(DOWNLOADS_KEY, JSON.stringify(completedDownloads));

    // Delete video file
    try {
      const fileInfo = await FileSystem.getInfoAsync(item.localVideoUri);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(item.localVideoUri, { idempotent: true });
      }
    } catch (e) {
      console.warn('Failed to delete video file:', item.localVideoUri, e);
    }

    // Delete poster file (if no other episode uses it)
    if (item.localPosterUri) {
      try {
        const otherUses = completedDownloads.some(
          (other) => other.id === item.id && other.localPosterUri === item.localPosterUri
        );
        if (!otherUses) {
          const posterInfo = await FileSystem.getInfoAsync(item.localPosterUri);
          if (posterInfo.exists) {
            await FileSystem.deleteAsync(item.localPosterUri, { idempotent: true });
          }
        }
      } catch (e) {
        console.warn('Failed to delete poster file:', item.localPosterUri, e);
      }
    }

    notifyListeners();
  }
}
