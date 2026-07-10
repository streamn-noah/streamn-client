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

// Short TTL — MovieBox signed URLs expire quickly. 90s is enough to cover
// the detail modal → watch page navigation without a double-fetch.
const sourceCache = new Map<string, { data: StreamBackendResponse; timestamp: number }>();
const CACHE_TTL_MS = 90 * 1000; // 90 seconds

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
  const key = getCacheKey(type, id, season, episode, mode);

  if (!ignoreCache) {
    const cached = sourceCache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const queryParams = new URLSearchParams({
    type,
    id: String(id),
    season: String(season),
    episode: String(episode),
    mode,
  });

  const endpoint = `/api/stream-source?${queryParams.toString()}`;

  try {
    const res = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch sources: ${res.statusText}`);
    }

    const data: StreamBackendResponse = await res.json();
    
    // Ensure arrays exist
    data.sources = Array.isArray(data.sources) ? data.sources : [];
    data.subtitles = Array.isArray(data.subtitles) ? data.subtitles : [];

    sourceCache.set(key, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    console.error("Error fetching stream sources:", error);
    return {
      sources: [],
      subtitles: [],
    };
  }
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
