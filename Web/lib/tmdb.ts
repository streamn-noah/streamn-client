import {
  type CastMember,
  type Episode,
  type MediaDetail,
  type MediaSummary,
  type MediaType,
  type SearchPlan,
} from "@/lib/media";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

type TmdbListResponse<T> = {
  results: T[];
  total_pages?: number;
};

type TmdbMedia = {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  genre_ids?: number[];
};

type TmdbDetail = TmdbMedia & {
  runtime?: number | null;
  episode_run_time?: number[];
  genres?: { id: number; name: string }[];
  images?: { logos?: { file_path: string; iso_639_1: string | null }[] };
  videos?: { results?: { key: string; site: string; type: string; official?: boolean }[] };
  credits?: {
    cast?: {
      id: number;
      name: string;
      character?: string;
      profile_path?: string | null;
    }[];
  };
  recommendations?: TmdbListResponse<TmdbMedia>;
  release_dates?: {
    results?: {
      iso_3166_1: string;
      release_dates: { certification?: string }[];
    }[];
  };
  content_ratings?: {
    results?: { iso_3166_1: string; rating?: string }[];
  };
  seasons?: {
    id: number;
    name: string;
    season_number: number;
    episode_count: number;
  }[];
};

const movieGenres: Record<string, number> = {
  action: 28,
  adventure: 12,
  animation: 16,
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  fantasy: 14,
  history: 36,
  horror: 27,
  music: 10402,
  mystery: 9648,
  romance: 10749,
  "science fiction": 878,
  "sci fi": 878,
  "sci-fi": 878,
  thriller: 53,
  war: 10752,
  western: 37,
};

export function fallbackPlan(prompt: string): SearchPlan {
  const lower = prompt.toLowerCase();
  const genreIds = Object.entries(movieGenres)
    .filter(([label]) => lower.includes(label))
    .map(([, id]) => id);

  if (lower.includes("scary") && !genreIds.includes(27)) genreIds.push(27);
  if (lower.includes("funny") && !genreIds.includes(35)) genreIds.push(35);
  if (lower.includes("space") && !genreIds.includes(878)) genreIds.push(878);
  if (lower.includes("love") && !genreIds.includes(10749)) genreIds.push(10749);

  return {
    label: prompt.trim() ? `AI-curated results for "${prompt.trim()}"` : "AI-curated results",
    searchTerms: [prompt.trim()].filter(Boolean),
    genreIds,
    mediaType: lower.includes("show") || lower.includes("series") ? "tv" : "all",
  };
}

function getAuth() {
  const bearer = process.env.TMDB_BEARER_TOKEN;
  const key = process.env.TMDB_API_KEY;

  if (!bearer && !key) {
    throw new Error("Missing TMDB credentials. Set TMDB_BEARER_TOKEN or TMDB_API_KEY.");
  }

  return { bearer, key };
}

async function tmdbFetch<T>(path: string, params: Record<string, string | number | boolean> = {}) {
  const { bearer, key } = getAuth();
  const url = new URL(`${TMDB_BASE_URL}${path}`);

  Object.entries({ language: "en-US", ...params }).forEach(([paramKey, value]) => {
    url.searchParams.set(paramKey, String(value));
  });

  if (!bearer && key) url.searchParams.set("api_key", key);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url, {
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined,
      next: { revalidate: 3600 },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`TMDB request failed (${response.status}): ${body}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

function normalizeMedia(item: TmdbMedia, forcedType?: MediaType): MediaSummary | null {
  const mediaType = (forcedType ?? item.media_type) as MediaType | undefined;

  if (mediaType !== "movie" && mediaType !== "tv") return null;
  if (!item.poster_path && !item.backdrop_path) return null;

  const date = mediaType === "movie" ? item.release_date : item.first_air_date;
  const title = mediaType === "movie" ? item.title ?? item.original_title : item.name ?? item.original_name;

  if (!title) return null;

  // Filter out unreleased titles with release dates in the future
  const today = new Date().toISOString().slice(0, 10);
  if (date && date > today) return null;

  return {
    id: item.id,
    mediaType,
    title,
    subtitle: mediaType === "movie" ? "Movie" : "Series",
    overview: item.overview ?? "",
    posterPath: item.poster_path ?? null,
    backdropPath: item.backdrop_path ?? null,
    voteAverage: item.vote_average ?? 0,
    year: date ? date.slice(0, 4) : "",
    genreIds: item.genre_ids ?? [],
  };
}

function uniqueByMedia(items: MediaSummary[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.mediaType}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function searchByTitle(query: string) {
  const data = await tmdbFetch<TmdbListResponse<TmdbMedia>>("/search/multi", {
    query,
    include_adult: false,
    page: 1,
  });

  return uniqueByMedia(data.results.map((item) => normalizeMedia(item)).filter(Boolean) as MediaSummary[]);
}

async function discover(type: MediaType, plan: SearchPlan, page = 1) {
  const endpoint = type === "movie" ? "/discover/movie" : "/discover/tv";
  const params: Record<string, string | number | boolean> = {
    include_adult: false,
    page,
    sort_by: "popularity.desc",
    "vote_count.gte": 60,
  };

  if (plan.genreIds.length) params.with_genres = plan.genreIds.join(",");

  const data = await tmdbFetch<TmdbListResponse<TmdbMedia>>(endpoint, params);
  return (data.results.map((item) => normalizeMedia(item, type)).filter(Boolean) as MediaSummary[]);
}

export async function searchWithPlan(plan: SearchPlan) {
  const titleSearches = await Promise.all(
    plan.searchTerms.slice(0, 3).map((term) => searchByTitle(term).catch(() => [])),
  );

  const types: MediaType[] =
    plan.mediaType === "movie" ? ["movie"] : plan.mediaType === "tv" ? ["tv"] : ["movie", "tv"];

  const discovered = plan.genreIds.length
    ? await Promise.all(types.map((type) => discover(type, plan).catch(() => [])))
    : [];

  return uniqueByMedia([...titleSearches.flat(), ...discovered.flat()]).slice(0, 24);
}

export async function roulettePick(plan: SearchPlan) {
  const queue = await rouletteQueue(plan, 1);
  return queue[0];
}

export async function rouletteQueue(plan: SearchPlan, count = 12) {
  const type =
    plan.mediaType === "tv"
      ? "tv"
      : plan.mediaType === "movie"
        ? "movie"
        : Math.random() > 0.5
          ? "movie"
          : "tv";

  const pages = Array.from({ length: 5 }, (_, index) => index + 1);
  const batches = await Promise.all(pages.map((page) => discover(type, plan, page).catch(() => [])));
  let pool = uniqueByMedia(batches.flat());

  if (!pool.length) {
    pool = await discover(type, fallbackPlan("popular"), 1);
  }

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export async function getTrending(
  mediaType: MediaType | "all",
  timeWindow: "day" | "week" = "week",
) {
  const path =
    mediaType === "all"
      ? `/trending/all/${timeWindow}`
      : `/trending/${mediaType}/${timeWindow}`;

  const data = await tmdbFetch<TmdbListResponse<TmdbMedia>>(path);
  return uniqueByMedia(
    data.results.map((item) => normalizeMedia(item)).filter(Boolean) as MediaSummary[],
  );
}

export async function getLatest(mediaType: MediaType, page = 1) {
  const endpoint = mediaType === "movie" ? "/discover/movie" : "/discover/tv";
  const sortBy = mediaType === "movie" ? "primary_release_date.desc" : "first_air_date.desc";
  const today = new Date().toISOString().slice(0, 10);
  const dateKey = mediaType === "movie" ? "primary_release_date.lte" : "first_air_date.lte";

  const data = await tmdbFetch<TmdbListResponse<TmdbMedia>>(endpoint, {
    include_adult: false,
    page,
    sort_by: sortBy,
    [dateKey]: today,
    "vote_count.gte": 20,
  });

  return uniqueByMedia(
    data.results.map((item) => normalizeMedia(item, mediaType)).filter(Boolean) as MediaSummary[],
  );
}

export async function getTopRated(mediaType: MediaType, page = 1) {
  const path = mediaType === "movie" ? "/movie/top_rated" : "/tv/top_rated";
  const data = await tmdbFetch<TmdbListResponse<TmdbMedia>>(path, {
    include_adult: false,
    page,
  });

  return uniqueByMedia(
    data.results.map((item) => normalizeMedia(item, mediaType)).filter(Boolean) as MediaSummary[],
  );
}

export type WatchProviderInfo = {
  id: number;
  name: string;
  slug: string;
  logoPath: string;
};

export const watchProviders: WatchProviderInfo[] = [
  { id: 122, name: "Hotstar Specials", slug: "hotstar", logoPath: "/7qk6F39d89Y8h022j0eL53.png" },
  { id: 337, name: "Disney+", slug: "disney", logoPath: "/97yvRBwVzz72xBxqGj27p8L1e.png" },
  { id: 1899, name: "Max", slug: "max", logoPath: "/h4b5w7m915.png" },
  { id: 386, name: "Peacock", slug: "peacock", logoPath: "/drPlVsYrL1fWq68k60d.png" },
  { id: 8, name: "Netflix", slug: "netflix", logoPath: "/pbpMk2JmcoNnQwx5JGpXngfoWbd.png" },
  { id: 9, name: "Amazon Prime", slug: "prime", logoPath: "/g11oi9S8vU7lyV0B4Nn0mCg1L5e.png" },
  { id: 15, name: "Hulu", slug: "hulu", logoPath: "/z2686YdStH5Zq9x2a4rK1e8p2X.png" },
];

export async function fetchWatchProvidersFromTmdb() {
  try {
    const data = await tmdbFetch<{
      results?: { provider_id: number; provider_name: string; logo_path: string }[];
    }>("/watch/providers/movie", { watch_region: "US" });

    if (!data.results) return watchProviders;

    const map = new Map(data.results.map((p) => [p.provider_id, p.logo_path]));

    return watchProviders.map((p) => ({
      ...p,
      logoPath: map.get(p.id) ?? p.logoPath,
    }));
  } catch {
    return watchProviders;
  }
}

export async function getByProvider(
  mediaType: MediaType,
  providerId: number,
  page = 1,
) {
  const endpoint = mediaType === "movie" ? "/discover/movie" : "/discover/tv";
  const data = await tmdbFetch<TmdbListResponse<TmdbMedia>>(endpoint, {
    include_adult: false,
    page,
    sort_by: "popularity.desc",
    watch_region: "US",
    with_watch_providers: providerId,
  });

  return uniqueByMedia(
    data.results.map((item) => normalizeMedia(item, mediaType)).filter(Boolean) as MediaSummary[],
  );
}

export async function getRecommendations(type: MediaType, id: number) {
  const data = await tmdbFetch<TmdbListResponse<TmdbMedia>>(`/${type}/${id}/recommendations`);
  return uniqueByMedia(
    data.results.map((item) => normalizeMedia(item, type)).filter(Boolean) as MediaSummary[],
  ).slice(0, 16);
}

export async function discoverByGenre(
  mediaType: MediaType,
  genreId: number,
  page = 1,
) {
  const endpoint = mediaType === "movie" ? "/discover/movie" : "/discover/tv";
  const data = await tmdbFetch<TmdbListResponse<TmdbMedia>>(endpoint, {
    include_adult: false,
    page,
    sort_by: "popularity.desc",
    with_genres: genreId,
    "vote_count.gte": 40,
  });

  return uniqueByMedia(
    data.results.map((item) => normalizeMedia(item, mediaType)).filter(Boolean) as MediaSummary[],
  );
}

export async function getGenreList(mediaType: MediaType) {
  const data = await tmdbFetch<{ genres: { id: number; name: string }[] }>(
    `/genre/${mediaType}/list`,
  );
  return data.genres;
}

async function fetchLogoPath(type: MediaType, id: number) {
  try {
    const data = await tmdbFetch<{
      logos?: { file_path: string; iso_639_1: string | null }[];
    }>(`/${type}/${id}/images`, {
      include_image_language: "en,null",
    });

    const logo =
      data.logos?.find((item) => item.iso_639_1 === "en") ??
      data.logos?.find((item) => item.iso_639_1 === null) ??
      data.logos?.[0] ??
      null;

    return logo?.file_path ?? null;
  } catch {
    return null;
  }
}

async function fetchTrailerKey(type: MediaType, id: number) {
  try {
    const data = await tmdbFetch<{
      results?: { key: string; site: string; type: string; official?: boolean }[];
    }>(`/${type}/${id}/videos`);

    const videos = data.results ?? [];
    return (
      videos.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official)?.key ??
      videos.find((v) => v.site === "YouTube" && v.type === "Trailer")?.key ??
      videos.find((v) => v.site === "YouTube")?.key ??
      null
    );
  } catch {
    return null;
  }
}

export async function enrichWithLogos(items: MediaSummary[]) {
  const enriched = await Promise.all(
    items.map(async (item) => {
      const [logoPath, trailerKey] = await Promise.all([
        fetchLogoPath(item.mediaType, item.id),
        fetchTrailerKey(item.mediaType, item.id),
      ]);
      return {
        ...item,
        logoPath: logoPath ?? item.logoPath ?? null,
        trailerKey: trailerKey ?? item.trailerKey ?? null,
      };
    }),
  );
  return enriched;
}

function pickCertification(detail: TmdbDetail, type: MediaType) {
  if (type === "movie") {
    const us = detail.release_dates?.results?.find((item) => item.iso_3166_1 === "US");
    return us?.release_dates?.find((item) => item.certification)?.certification ?? "NR";
  }

  return detail.content_ratings?.results?.find((item) => item.iso_3166_1 === "US")?.rating ?? "NR";
}

function pickTrailer(detail: TmdbDetail) {
  const videos = detail.videos?.results ?? [];
  return (
    videos.find((video) => video.site === "YouTube" && video.type === "Trailer" && video.official)?.key ??
    videos.find((video) => video.site === "YouTube" && video.type === "Trailer")?.key ??
    null
  );
}

function normalizeCast(detail: TmdbDetail): CastMember[] {
  return (detail.credits?.cast ?? []).slice(0, 12).map((member) => ({
    id: member.id,
    name: member.name,
    character: member.character ?? "",
    profilePath: member.profile_path ?? null,
  }));
}

export async function getSeasonEpisodes(id: number, seasonNumber: number) {
  const seasonDetail = await tmdbFetch<{
    episodes?: {
      id: number;
      episode_number: number;
      season_number: number;
      name: string;
      overview?: string;
      air_date?: string;
      runtime?: number | null;
      still_path?: string | null;
    }[];
  }>(`/tv/${id}/season/${seasonNumber}`);

  return (seasonDetail.episodes ?? []).map<Episode>((episode) => ({
    id: episode.id,
    episodeNumber: episode.episode_number,
    seasonNumber: episode.season_number,
    name: episode.name,
    overview: episode.overview ?? "",
    airDate: episode.air_date ?? "",
    runtime: episode.runtime ?? null,
    stillPath: episode.still_path ?? null,
  }));
}

async function getEpisodes(id: number, detail: TmdbDetail) {
  const season = detail.seasons?.find((item) => item.season_number > 0 && item.episode_count > 0);
  if (!season) return [];

  return getSeasonEpisodes(id, season.season_number);
}

export async function getMediaDetail(type: MediaType, id: number): Promise<MediaDetail> {
  const append =
    type === "movie"
      ? "credits,videos,recommendations,images,release_dates"
      : "credits,videos,recommendations,images,content_ratings";

  const detail = await tmdbFetch<TmdbDetail>(`/${type}/${id}`, {
    append_to_response: append,
    include_image_language: "en,null",
  });

  const summary = normalizeMedia(detail, type);
  if (!summary) throw new Error("Unable to normalize TMDB media item.");

  const logo =
    detail.images?.logos?.find((item) => item.iso_639_1 === "en") ??
    detail.images?.logos?.find((item) => item.iso_639_1 === null) ??
    null;

  const recommendations = uniqueByMedia(
    (detail.recommendations?.results ?? [])
      .map((item) => normalizeMedia(item, type))
      .filter(Boolean) as MediaSummary[],
  ).slice(0, 12);

  const episodes = type === "tv" ? await getEpisodes(id, detail) : [];

  return {
    ...summary,
    runtime: detail.runtime ?? detail.episode_run_time?.[0] ?? null,
    certification: pickCertification(detail, type),
    genres: detail.genres?.map((genre) => genre.name) ?? [],
    logoPath: logo?.file_path ?? null,
    trailerKey: pickTrailer(detail),
    cast: normalizeCast(detail),
    recommendations,
    seasons:
      detail.seasons
        ?.filter((season) => season.season_number > 0 && season.episode_count > 0)
        .map((season) => ({
          id: season.id,
          name: season.name,
          seasonNumber: season.season_number,
          episodeCount: season.episode_count,
        })) ?? [],
    episodes,
  };
}
