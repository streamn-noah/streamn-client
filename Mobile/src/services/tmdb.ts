import {
  type CastMember,
  type Episode,
  type MediaDetail,
  type MediaSummary,
  type MediaType,
  type SearchPlan,
} from "./media";

import { getAdultContentEnabled } from "./storage";

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
  videos?: { results?: { key: string; site: string; type: string; name?: string; official?: boolean }[] };
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
  const bearer = process.env.EXPO_PUBLIC_TMDB_BEARER_TOKEN || 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI5ZWM3M2E0ODFhMzJjMDZmMWIwZjI5NTY5YzYwOGRhYyIsIm5iZiI6MTU4NTUwMzI0Mi4yODcwMDAyLCJzdWIiOiI1ZTgwZGMwYTJhMjEwYzAwMTcyYTNhZmUiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.oYZDf3JrrQXcQt-YKFp9JbESIfMglvgnS-ae_POA2vY';
  const key = process.env.EXPO_PUBLIC_TMDB_API_KEY || '9ec73a481a32c06f1b0f29569c608dac';

  return { bearer, key };
}

async function tmdbFetch<T>(path: string, params: Record<string, string | number | boolean> = {}) {
  const { bearer, key } = getAuth();
  const url = new URL(`${TMDB_BASE_URL}${path}`);

  let includeAdult = params.include_adult;
  if (includeAdult === undefined) {
    try {
      includeAdult = await getAdultContentEnabled();
    } catch {
      includeAdult = false;
    }
  }

  const finalParams = { language: "en-US", include_adult: includeAdult, ...params };

  Object.entries(finalParams).forEach(([paramKey, value]) => {
    url.searchParams.set(paramKey, String(value));
  });

  if (!bearer && key) url.searchParams.set("api_key", key);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url.toString(), {
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : undefined,
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

  // Filter out unreleased titles with missing release dates or release dates in the future
  const today = new Date().toISOString().slice(0, 10);
  if (!date || date > today) return null;

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

export async function getAnime(page = 1) {
  const data = await tmdbFetch<TmdbListResponse<TmdbMedia>>("/discover/tv", {
    include_adult: false,
    page,
    sort_by: "popularity.desc",
    with_genres: "16",
    with_original_language: "ja",
    "vote_count.gte": 60,
  });

  return uniqueByMedia(
    data.results.map((item) => normalizeMedia(item, "tv")).filter(Boolean) as MediaSummary[],
  );
}

export async function getTrendingAnime(timeWindow: "day" | "week" = "day") {
  const discoverData = await tmdbFetch<TmdbListResponse<TmdbMedia>>(`/discover/tv`, {
    include_adult: false,
    page: 1,
    sort_by: "popularity.desc",
    with_genres: "16",
    with_original_language: "ja",
    "vote_average.gte": 6,
    "first_air_date.gte": new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // last 30 days
  });

  return uniqueByMedia(
    discoverData.results.map((item) => normalizeMedia(item, "tv")).filter(Boolean) as MediaSummary[],
  );
}

export async function getTopRatedAnime(page = 1) {
  const data = await tmdbFetch<TmdbListResponse<TmdbMedia>>("/discover/tv", {
    include_adult: false,
    page,
    sort_by: "vote_average.desc",
    with_genres: "16",
    with_original_language: "ja",
    "vote_count.gte": 200,
  });

  return uniqueByMedia(
    data.results.map((item) => normalizeMedia(item, "tv")).filter(Boolean) as MediaSummary[],
  );
}

export async function getTopRatedAnimeMovies(page = 1) {
  const data = await tmdbFetch<TmdbListResponse<TmdbMedia>>("/discover/movie", {
    include_adult: false,
    page,
    sort_by: "vote_average.desc",
    with_genres: "16",
    with_original_language: "ja",
    "vote_count.gte": 200,
  });

  return uniqueByMedia(
    data.results.map((item) => normalizeMedia(item, "movie")).filter(Boolean) as MediaSummary[],
  );
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

export async function discoverByOriginCountry(
  mediaType: MediaType,
  country: string,
  page = 1,
) {
  const endpoint = mediaType === "movie" ? "/discover/movie" : "/discover/tv";
  const data = await tmdbFetch<TmdbListResponse<TmdbMedia>>(endpoint, {
    include_adult: false,
    page,
    sort_by: "popularity.desc",
    with_origin_country: country,
    "vote_count.gte": 10,
  });

  return uniqueByMedia(
    data.results.map((item) => normalizeMedia(item, mediaType)).filter(Boolean) as MediaSummary[],
  );
}

export async function fetchLogoPath(type: MediaType, id: number) {
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

export async function fetchTrailerKey(type: MediaType, id: number) {
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

export async function getMediaDetail(mediaType: MediaType, id: number): Promise<MediaDetail | null> {
  const path = mediaType === "movie" ? `/movie/${id}` : `/tv/${id}`;
  const params: Record<string, string> = {
    append_to_response: "images,videos,credits,recommendations,release_dates,content_ratings"
  };

  try {
    const data = await tmdbFetch<TmdbDetail>(path, params);

    const title = mediaType === "movie" ? data.title ?? data.original_title : data.name ?? data.original_name;
    const date = mediaType === "movie" ? data.release_date : data.first_air_date;

    if (!title) return null;

    const logo =
      data.images?.logos?.find((item) => item.iso_639_1 === "en") ??
      data.images?.logos?.find((item) => item.iso_639_1 === null) ??
      data.images?.logos?.[0] ??
      null;

    const trailerKey =
      data.videos?.results?.find((v) => v.site === "YouTube" && v.type === "Trailer" && v.official)?.key ??
      data.videos?.results?.find((v) => v.site === "YouTube" && v.type === "Trailer")?.key ??
      data.videos?.results?.find((v) => v.site === "YouTube")?.key ??
      null;

    let certification = "NR";
    if (mediaType === "movie") {
      const usRelease = data.release_dates?.results?.find((r) => r.iso_3166_1 === "US");
      if (usRelease?.release_dates?.[0]?.certification) {
        certification = usRelease.release_dates[0].certification;
      }
    } else {
      const usRating = data.content_ratings?.results?.find((r) => r.iso_3166_1 === "US");
      if (usRating?.rating) {
        certification = usRating.rating;
      }
    }

    const runtime = mediaType === "movie" ? data.runtime : data.episode_run_time?.[0] ?? null;

    const recommendations = (data.recommendations?.results ?? [])
      .map((item) => normalizeMedia(item, mediaType))
      .filter(Boolean) as MediaSummary[];

    return {
      id: data.id,
      mediaType,
      title,
      subtitle: mediaType === "movie" ? "Movie" : "Series",
      overview: data.overview ?? "",
      posterPath: data.poster_path ?? null,
      backdropPath: data.backdrop_path ?? null,
      logoPath: logo?.file_path ?? null,
      trailerKey,
      voteAverage: data.vote_average ?? 0,
      year: date ? date.slice(0, 4) : "",
      runtime: runtime ?? null,
      certification,
      genres: data.genres?.map((g) => g.name) ?? [],
      genreIds: data.genres?.map((g: any) => g.id) ?? [],
      cast: data.credits?.cast?.slice(0, 10).map((c: any) => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profilePath: c.profile_path || null,
      })) ?? [],
      recommendations,
      seasons: data.seasons?.map(s => ({
        id: s.id,
        name: s.name,
        seasonNumber: s.season_number,
        episodeCount: s.episode_count,
      })) ?? [],
      videos: (data.videos?.results ?? []).filter(v => v.site === "YouTube").map(v => ({
        id: v.key,
        key: v.key,
        name: v.name || v.type,
        site: v.site,
        type: v.type,
      })),
      episodes: [] 
    };
  } catch (error) {
    console.error("getMediaDetail error", error);
    return null;
  }
}

export async function getSeasonEpisodes(tvId: number, seasonNumber: number): Promise<Episode[]> {
  try {
    const data = await tmdbFetch<{ episodes: any[] }>(`/tv/${tvId}/season/${seasonNumber}`);
    const today = new Date().toISOString().slice(0, 10);
    return (data.episodes ?? [])
      .filter((ep) => ep.air_date && ep.air_date <= today)
      .map((ep) => ({
        id: ep.id,
        name: ep.name,
        overview: ep.overview,
        airDate: ep.air_date,
        episodeNumber: ep.episode_number,
        seasonNumber: ep.season_number,
        runtime: ep.runtime,
        stillPath: ep.still_path,
      }));
  } catch {
    return [];
  }
}

export async function getPersonCredits(personId: number): Promise<MediaSummary[]> {
  try {
    const data = await tmdbFetch<{ cast: TmdbMedia[] }>(`/person/${personId}/combined_credits`);
    return uniqueByMedia(
      (data.cast ?? [])
        .map((item) => normalizeMedia(item))
        .filter(Boolean) as MediaSummary[]
    );
  } catch (error) {
    console.error("getPersonCredits error", error);
    return [];
  }
}
