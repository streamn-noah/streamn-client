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
  logoPath?: string | null;
  trailerKey?: string | null;
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

export function cinesrcUrl(
  type: MediaType,
  id: number,
  season = 1,
  episode = 1,
  startSeconds?: number,
  controls = true
) {
  const params = new URLSearchParams({
    color: "#e50914",
    back: "close",
    autoplay: "true",
    muted: "true",
    controls: controls ? "true" : "false",
    prioritize: "true",
  });

  if (type === "tv") {
    params.set("s", String(season));
    params.set("e", String(episode));
  }

  if (startSeconds && startSeconds >= 30) {
    params.set("t", String(Math.floor(startSeconds)));
    params.set("continueprompt", "false");
  }

  const query = params.toString().replace(/#/g, "%23");
  return `https://cinesrc.st/embed/${type}/${id}?${query}`;
}

export function cinesrcPreviewUrl(
  type: MediaType,
  id: number,
  season = 1,
  episode = 1,
  startSeconds?: number,
) {
  const params = new URLSearchParams({
    color: "#e50914",
    back: "close",
    autoplay: "true",
    muted: "true",
    controls: "false",
  });

  if (type === "tv") {
    params.set("s", String(season));
    params.set("e", String(episode));
  }

  if (startSeconds && startSeconds >= 30) {
    params.set("t", String(Math.floor(startSeconds)));
    params.set("continueprompt", "false");
  }

  const query = params.toString().replace(/#/g, "%23");
  return `https://cinesrc.st/embed/${type}/${id}?${query}`;
}

export function vidlinkUrl(
  type: MediaType,
  id: number,
  season = 1,
  episode = 1,
  startSeconds?: number,
) {
  const params = new URLSearchParams({
    primaryColor: "e50914",
    secondaryColor: "222222",
    iconColor: "ffffff",
    icons: "vid",
    autoplay: "true",
  });

  const query = params.toString();
  if (type === "movie") {
    return `https://vidlink.pro/movie/${id}?${query}`;
  }
  return `https://vidlink.pro/tv/${id}/${season}/${episode}?${query}`;
}

