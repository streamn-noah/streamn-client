import type { MediaSummary, MediaType } from "@/lib/media";

const CONTINUE_KEY = "streamn-continue-watching";
const LAST_WATCHED_KEY = "streamn-last-watched";
const ROULETTE_KEY = "streamn-roulette-queue";

export const MIN_CONTINUE_SECONDS = 300;

export type RouletteQueue = {
  items: MediaSummary[];
  index: number;
  prompt: string;
};

export type WatchProgress = MediaSummary & {
  progressSeconds: number;
  seasonNumber: number;
  episodeNumber: number;
  updatedAt: number;
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getContinueWatching(): WatchProgress[] {
  return readJson<WatchProgress[]>(CONTINUE_KEY, []);
}

export function getWatchProgress(
  mediaType: MediaType,
  mediaId: number,
): WatchProgress | null {
  return (
    getContinueWatching().find(
      (entry) => entry.id === mediaId && entry.mediaType === mediaType,
    ) ?? null
  );
}

export function commitWatchSession({
  item,
  progressSeconds,
  engagedSeconds,
  seasonNumber,
  episodeNumber,
}: {
  item: MediaSummary;
  progressSeconds: number;
  engagedSeconds: number;
  seasonNumber: number;
  episodeNumber: number;
}) {
  if (engagedSeconds < MIN_CONTINUE_SECONDS || progressSeconds < 30) return;

  const entry: WatchProgress = {
    ...item,
    progressSeconds: Math.floor(progressSeconds),
    seasonNumber,
    episodeNumber,
    updatedAt: Date.now(),
  };

  const current = getContinueWatching().filter(
    (existing) =>
      !(existing.id === entry.id && existing.mediaType === entry.mediaType),
  );

  writeJson(CONTINUE_KEY, [entry, ...current].slice(0, 24));
  writeJson(LAST_WATCHED_KEY, item);
}

export function getLastWatched(): MediaSummary | null {
  return readJson<MediaSummary | null>(LAST_WATCHED_KEY, null);
}

export function getRouletteQueue(): RouletteQueue | null {
  return readJson<RouletteQueue | null>(ROULETTE_KEY, null);
}

export function setRouletteQueue(items: MediaSummary[], prompt: string) {
  writeJson(ROULETTE_KEY, { items, index: 0, prompt } satisfies RouletteQueue);
}

export function advanceRouletteQueue(): MediaSummary | null {
  const queue = getRouletteQueue();
  if (!queue?.items.length) return null;

  const nextIndex = queue.index + 1;
  if (nextIndex >= queue.items.length) return null;

  const updated = { ...queue, index: nextIndex };
  writeJson(ROULETTE_KEY, updated);
  return updated.items[nextIndex];
}

export function watchHref(
  item: MediaSummary | WatchProgress,
  options?: { season?: number; episode?: number },
) {
  if (item.mediaType === "movie") return `/watch/movie/${item.id}`;

  const season =
    options?.season ??
    ("seasonNumber" in item ? item.seasonNumber : undefined) ??
    1;
  const episode =
    options?.episode ??
    ("episodeNumber" in item ? item.episodeNumber : undefined) ??
    1;

  return `/watch/tv/${item.id}?s=${season}&e=${episode}`;
}
