import { getMovieBoxStreams, getMovieBoxDownloadSources, getMovieBoxSeasonDownloads, MovieBoxLookupInput } from './moviebox';
import { getMediaDetail } from './tmdb';
import { Platform } from 'react-native';
import { getDownload } from './download';

export type AudioTrackItem = {
  label?: string;
  language?: string;
};

export type ProviderInfo = {
  id?: string;
  name?: string;
};

export type SourceItem = {
  url: string;
  quality?: string;
  type?: string;
  audioTracks?: AudioTrackItem[];
  provider?: ProviderInfo;
  size?: string;
  duration?: number;
};

export type SubtitleItem = {
  url: string;
  format?: string;
  label: string;
  language?: string;
};

export type StreamBackendResponse = {
  responseId?: string;
  expiresAt?: string;
  sources: SourceItem[];
  subtitles: SubtitleItem[];
  diagnostics?: Array<{
    code: string;
    message: string;
    field?: string;
    severity?: string;
  }>;
};

export type StreamSourceMode = "playback" | "download";

const sourceCache = new Map<string, { data: StreamBackendResponse; timestamp: number }>();
const CACHE_TTL_MS = 90 * 1000;

function getCacheKey(
  type: "movie" | "tv",
  id: number,
  season = 1,
  episode = 1,
  mode: StreamSourceMode = "playback",
): string {
  return type === "movie"
    ? `movie:${id}:${mode}`
    : `tv:${id}:${season}:${episode}:${mode}`;
}

export async function fetchStreamSources(
  type: "movie" | "tv",
  id: number,
  season = 1,
  episode = 1,
  ignoreCache = false,
  mode: StreamSourceMode = "playback",
): Promise<StreamBackendResponse> {
  // Check if a local download exists (always returns local file if downloaded, even if online)
  const localDl = getDownload(type, id, season, episode);
  if (localDl) {
    return {
      sources: [
        {
          url: localDl.localVideoUri,
          quality: localDl.quality,
          type: 'local',
          size: localDl.sizeStr,
        },
      ],
      subtitles: [],
    };
  }

  const key = getCacheKey(type, id, season, episode, mode);

  if (!ignoreCache) {
    const cached = sourceCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }


  let wyzieSubtitles: SubtitleItem[] = [];
  try {
    const wyzieKey = process.env.EXPO_PUBLIC_WYZIE_API_KEY;
    if (wyzieKey) {
      const url = new URL("https://sub.wyzie.io/search");
      url.searchParams.set("id", String(id));
      url.searchParams.set("language", "en");
      url.searchParams.set("key", wyzieKey);
      
      if (type === "tv") {
        url.searchParams.set("season", String(season));
        url.searchParams.set("episode", String(episode));
      }

      const res = await fetch(url.toString());
      if (res.ok) {
        const wyzieData = await res.json();
        if (Array.isArray(wyzieData)) {
          wyzieSubtitles = wyzieData.map((sub: any) => ({
            url: sub.url,
            format: sub.format || "vtt",
            label: `Wyzie - ${sub.language || "English"}${sub.origin ? ` (${sub.origin})` : ""}`,
            language: sub.language || "en",
          }));
        }
      } else {
        const errText = await res.text();
        console.warn(`Wyzie 400: ${errText}`);
      }
    }
  } catch (error) {
    console.error("Wyzie subtitles fetch error:", error);
  }

  try {
    // 1. Get media title/year from TMDB to pass to MovieBox
    const mediaDetail = await getMediaDetail(type, id);
    if (!mediaDetail) {
      throw new Error(`Media not found for ID: ${id}`);
    }

    const input: MovieBoxLookupInput = {
      title: mediaDetail.title,
      type,
      year: mediaDetail.year,
      season,
      episode,
    };

    // 2. Fetch directly from MovieBox
    const response = mode === "download" 
      ? await getMovieBoxDownloadSources(input) 
      : await getMovieBoxStreams(input);

    if (!response || !response.streams) {
      return { sources: [], subtitles: wyzieSubtitles };
    }

    // 3. Map MovieBoxStream to our SourceItem
    const sources: SourceItem[] = response.streams
      .filter((stream: any) => {
        // We now support H.265 on both Android (via expo-video) and iOS (via WebView)
        return true;
      })
      .map((stream) => ({
      url: stream.url,
      quality: stream.quality,
      type: stream.format || 'mp4',
      size: stream.size,
      duration: stream.duration,
      provider: { name: 'MovieBox' },
    }));

    // Subtitles mapping
    let subtitles: SubtitleItem[] = [];
    const seenSubUrls = new Set<string>();

    response.streams.forEach(stream => {
      if (stream.captions) {
        stream.captions.forEach(caption => {
          if (caption.url && !seenSubUrls.has(caption.url)) {
            seenSubUrls.add(caption.url);
            subtitles.push({
              url: caption.url,
              label: caption.language,
              language: caption.language_code,
              format: 'vtt',
            });
          }
        });
      }
    });

    subtitles.push(...wyzieSubtitles);

    const data: StreamBackendResponse = {
      sources,
      subtitles,
    };

    sourceCache.set(key, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    console.error("Error fetching stream sources:", error);
    return {
      sources: [],
      subtitles: wyzieSubtitles,
    };
  }
}

export function getFileSizeRange(sources: SourceItem[]): string | null {
  if (!sources.length) return null;

  const sizedSources = sources.filter((s) => s.size);
  if (!sizedSources.length) return null;

  const parseSize = (sizeStr: string) => {
    const num = parseFloat(sizeStr);
    if (isNaN(num)) return 0;
    if (sizeStr.toUpperCase().includes("GB")) return num * 1024;
    return num;
  };

  const formatSize = (sizeInMB: number) => {
    if (sizeInMB >= 1024) {
      const gb = sizeInMB / 1024;
      return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
    }
    return `${Math.round(sizeInMB)} MB`;
  };

  const sorted = [...sizedSources].sort(
    (a, b) => parseSize(a.size!) - parseSize(b.size!),
  );

  const minMB = parseSize(sorted[0].size!);
  const maxMB = parseSize(sorted[sorted.length - 1].size!);

  const formattedMin = formatSize(minMB);
  const formattedMax = formatSize(maxMB);

  if (formattedMin === formattedMax) return formattedMin;
  return `${formattedMin} - ${formattedMax}`;
}

export function getCachedStreamSources(
  type: "movie" | "tv",
  id: number,
  season = 1,
  episode = 1,
  mode: StreamSourceMode = "playback",
): StreamBackendResponse | null {
  const key = getCacheKey(type, id, season, episode, mode);
  const cached = sourceCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  return null;
}

export async function prewarmStreamCache(
  type: "movie" | "tv",
  id: number,
  season = 1,
  episode = 1,
) {
  // Fire and forget to cache the response
  fetchStreamSources(type, id, season, episode, false, "playback").catch(() => {});
}

export type SeasonDownloadResponse = {
  responseId?: string;
  expiresAt?: string;
  episodes: Array<{
    episode: number;
    sources: SourceItem[];
  }>;
};

export async function fetchSeasonDownloadSources(
  type: "movie" | "tv",
  id: number,
  season = 1,
): Promise<SeasonDownloadResponse> {
  if (type === "movie") return { episodes: [] };

  try {
    const mediaDetail = await getMediaDetail(type, id);
    if (!mediaDetail) {
      throw new Error(`Media not found for ID: ${id}`);
    }

    const input: MovieBoxLookupInput = {
      title: mediaDetail.title,
      type,
      year: mediaDetail.year,
      season,
    };

    const pack = await getMovieBoxSeasonDownloads(input);
    if (!pack || !pack.seasons) {
      return { episodes: [] };
    }

    const seasonEntry = pack.seasons.find((entry) => entry.season === season);
    if (!seasonEntry || !seasonEntry.episodes) {
      return { episodes: [] };
    }

    const episodes = seasonEntry.episodes.map((ep) => {
      const streams = ep.qualities ?? ep.streams ?? [];
      const sources: SourceItem[] = streams.map((stream) => ({
        url: stream.url,
        quality: stream.quality,
        type: stream.format || 'mp4',
        size: stream.size,
        duration: stream.duration,
        provider: { name: 'MovieBox' },
      }));

      return {
        episode: ep.episode,
        sources: [...sources].sort((a, b) => {
          const resA = parseInt(a.quality || "0");
          const resB = parseInt(b.quality || "0");
          return resB - resA;
        }),
      };
    });

    return { episodes };
  } catch (error) {
    console.error("Error in fetchSeasonDownloadSources:", error);
    return { episodes: [] };
  }
}
