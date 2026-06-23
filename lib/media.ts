export type MediaType = "movie" | "tv";

export type MediaSummary = {
  id: number;
  mediaType: MediaType;
  title: string;
  subtitle: string;
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  year: string;
  genreIds: number[];
};

export type CastMember = {
  id: number;
  name: string;
  character: string;
  profilePath: string | null;
};

export type Episode = {
  id: number;
  episodeNumber: number;
  seasonNumber: number;
  name: string;
  overview: string;
  airDate: string;
  runtime: number | null;
  stillPath: string | null;
};

export type Season = {
  id: number;
  name: string;
  seasonNumber: number;
  episodeCount: number;
};

export type MediaDetail = MediaSummary & {
  runtime: number | null;
  certification: string;
  genres: string[];
  logoPath: string | null;
  trailerKey: string | null;
  cast: CastMember[];
  recommendations: MediaSummary[];
  seasons: Season[];
  episodes: Episode[];
};

export type SearchResponse = {
  label: string;
  results: MediaSummary[];
};

export type SearchPlan = {
  label: string;
  searchTerms: string[];
  genreIds: number[];
  mediaType: "movie" | "tv" | "all";
};

export const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p";

export function tmdbImage(path: string | null | undefined, size = "w500") {
  if (!path) return "";
  return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

export function cinesrcUrl(type: MediaType, id: number, season = 1, episode = 1) {
  const base = `https://cinesrc.st/embed/${type}/${id}`;
  if (type === "movie") return `${base}?color=%23e50914&back=close`;
  return `${base}?s=${season}&e=${episode}&color=%23e50914&back=close`;
}
