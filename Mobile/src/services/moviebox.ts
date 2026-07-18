const WORKER_URL = process.env.EXPO_PUBLIC_MOVIEBOX_API_URL || "https://moviebox-api-umber.vercel.app";
const WORKER_SECRET = process.env.EXPO_PUBLIC_MOVIEBOX_WORKER_SECRET || "local-secret-12345";
const SUBJECT_MATCH_TTL_MS = 6 * 60 * 60 * 1000;
const DOWNLOAD_PACK_TTL_MS = 60 * 1000;

const ENGLISH_PREFERRED_PATTERN = /\b(english|eng|original)\b/i;
const NON_ENGLISH_PATTERN =
  /\b(hindi|tamil|telugu|malayalam|bengali|punjabi|urdu|spanish|espanol|latino|french|german|italian|korean|japanese|arabic|portuguese|russian|multi-audio|dual-audio|dubbed)\b/i;

type MovieBoxCaption = {
  language: string;
  language_code: string;
  url: string;
};

export interface MovieBoxStream {
  quality: string;
  resolution: number;
  url: string;
  format: string;
  size: string;
  codecName?: string;
  duration?: number;
  captions?: MovieBoxCaption[];
  se: number;
  ep: number;
}

type MovieBoxSearchItem = {
  subjectId: string;
  type: "movie" | "tv" | "shorts" | string;
  title: string;
  releaseDate?: string | null;
  language?: string | null;
  hasResource?: boolean;
};

type MovieBoxDownloadPack = {
  seasons?: Array<{
    season: number;
    episodes?: Array<{
      episode: number;
      qualities?: MovieBoxStream[];
      streams?: MovieBoxStream[];
    }>;
  }>;
};

export type MovieBoxLookupInput = {
  title: string;
  type: "movie" | "tv";
  year?: string | null;
  season?: number;
  episode?: number;
};

export interface MovieBoxResponse {
  title: string;
  subjectId: string;
  streams: MovieBoxStream[];
}

type CachedMovieBoxMatch = {
  match: MovieBoxSearchItem;
  timestamp: number;
};

const subjectMatchCache = new Map<string, CachedMovieBoxMatch>();
const downloadPackCache = new Map<string, { pack: MovieBoxDownloadPack; timestamp: number }>();

function getLookupCacheKey(input: MovieBoxLookupInput) {
  return `${input.type}:${input.title.toLowerCase()}:${input.year ?? ""}`;
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function getYearFromDate(value?: string | null): string | null {
  if (!value) return null;
  const match = value.match(/\b(19|20)\d{2}\b/);
  return match?.[0] ?? null;
}

function getLanguageScore(item: MovieBoxSearchItem): number {
  const haystack = `${item.title} ${item.language ?? ""}`;
  if (ENGLISH_PREFERRED_PATTERN.test(haystack)) return 25;
  if (NON_ENGLISH_PATTERN.test(haystack)) return -35;
  return 5;
}

function getTitleScore(input: MovieBoxLookupInput, item: MovieBoxSearchItem): number {
  const expected = normalizeTitle(input.title);
  const candidate = normalizeTitle(item.title);

  if (candidate === expected) return 60;
  if (candidate.startsWith(expected) || expected.startsWith(candidate)) return 40;
  if (candidate.includes(expected) || expected.includes(candidate)) return 25;

  const expectedWords = new Set(expected.split(" ").filter(Boolean));
  const candidateWords = candidate.split(" ").filter(Boolean);
  const sharedWords = candidateWords.filter((word) => expectedWords.has(word)).length;

  return sharedWords * 5;
}

function scoreSearchItem(input: MovieBoxLookupInput, item: MovieBoxSearchItem): number {
  if (input.type === "movie" && item.type !== "movie") return -1000;
  if (input.type === "tv" && item.type !== "tv") return -1000;

  let score = getTitleScore(input, item) + getLanguageScore(item);

  const candidateYear = getYearFromDate(item.releaseDate);
  if (input.year && candidateYear) {
    score += candidateYear === input.year ? 80 : -70;
  } else if (input.year && !candidateYear) {
    score -= 5;
  }

  if (item.hasResource) {
    score += 10;
  }

  return score;
}

function sortStreamsByQuality(streams: MovieBoxStream[]): MovieBoxStream[] {
  return [...streams].sort((a, b) => (b.resolution || 0) - (a.resolution || 0));
}

async function fetchMovieBoxJson<T>(path: string, init?: RequestInit): Promise<T | null> {
  const response = await fetch(`${WORKER_URL}${path}`, {
    ...init,
    headers: {
      "X-Worker-Secret": WORKER_SECRET,
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    console.error(`MovieBox request failed: ${response.status} ${response.statusText} for ${path}`);
    return null;
  }

  return (await response.json()) as T;
}

async function resolveMovieBoxMatch(input: MovieBoxLookupInput): Promise<MovieBoxSearchItem | null> {
  const cacheKey = getLookupCacheKey(input);
  const cached = subjectMatchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < SUBJECT_MATCH_TTL_MS) {
    return cached.match;
  }

  const searchData = await fetchMovieBoxJson<{ items?: MovieBoxSearchItem[] }>("/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ keyword: input.title, page: 1, perPage: 10 }),
  });

  const items = (searchData?.items ?? []).filter((item) => item.subjectId && item.title);
  if (!items.length) {
    console.warn(`No MovieBox search matches found for "${input.title}"`);
    return null;
  }

  const bestMatch = [...items].sort((a, b) => scoreSearchItem(input, b) - scoreSearchItem(input, a))[0];
  if (!bestMatch || scoreSearchItem(input, bestMatch) < 0) {
    console.warn(`No confident MovieBox match found for "${input.title}" (${input.year ?? "unknown year"})`);
    return null;
  }

  subjectMatchCache.set(cacheKey, {
    match: bestMatch,
    timestamp: Date.now(),
  });

  return bestMatch;
}

export async function getMovieBoxStreams(input: MovieBoxLookupInput): Promise<MovieBoxResponse | null> {
  if (!WORKER_URL) {
    console.warn("EXPO_PUBLIC_MOVIEBOX_API_URL environment variable is not defined");
    return null;
  }

  try {
    const match = await resolveMovieBoxMatch(input);
    if (!match) return null;

    const querySeason = input.type === "movie" ? 0 : input.season ?? 1;
    const queryEpisode = input.type === "movie" ? 0 : input.episode ?? 1;

    const streamData = await fetchMovieBoxJson<{ streams?: MovieBoxStream[] }>(
      `/stream/${match.subjectId}?se=${querySeason}&ep=${queryEpisode}&_nocache=${Date.now()}`,
    );

    return {
      title: match.title,
      subjectId: match.subjectId,
      streams: sortStreamsByQuality(streamData?.streams ?? []),
    };
  } catch (error) {
    console.error("Error in getMovieBoxStreams:", error);
    return null;
  }
}

export async function getMovieBoxDownloadSources(
  input: MovieBoxLookupInput,
): Promise<MovieBoxResponse | null> {
  if (!WORKER_URL) {
    console.warn("EXPO_PUBLIC_MOVIEBOX_API_URL environment variable is not defined");
    return null;
  }

  try {
    if (input.type === "movie") {
      return getMovieBoxStreams({
        ...input,
        season: 0,
        episode: 0,
      });
    }

    const match = await resolveMovieBoxMatch(input);
    if (!match) return null;

    const cachedPack = downloadPackCache.get(match.subjectId);
    const pack =
      cachedPack && Date.now() - cachedPack.timestamp < DOWNLOAD_PACK_TTL_MS
        ? cachedPack.pack
        : await fetchMovieBoxJson<MovieBoxDownloadPack>(`/download/${match.subjectId}`);

    if (pack) {
      downloadPackCache.set(match.subjectId, {
        pack,
        timestamp: Date.now(),
      });
    }

    const seasonEntry = pack?.seasons?.find((entry) => entry.season === (input.season ?? 1));
    const episodeEntry = seasonEntry?.episodes?.find((entry) => entry.episode === (input.episode ?? 1));
    const qualities = episodeEntry?.qualities ?? episodeEntry?.streams ?? [];

    return {
      title: match.title,
      subjectId: match.subjectId,
      streams: sortStreamsByQuality(qualities),
    };
  } catch (error) {
    console.error("Error in getMovieBoxDownloadSources:", error);
    return null;
  }
}
