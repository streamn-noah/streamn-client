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

export type Video = {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
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
  videos: Video[];
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

export function adjustDominantColor(color: string, fallback = '#1a1a1a'): string {
  if (!color || color === 'transparent') return fallback;
  
  let r = 0, g = 0, b = 0;
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length >= 6) {
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }
  } else if (color.startsWith('rgb')) {
    const match = color.match(/\d+/g);
    if (match && match.length >= 3) {
      r = parseInt(match[0], 10);
      g = parseInt(match[1], 10);
      b = parseInt(match[2], 10);
    }
  } else {
    return fallback;
  }

  const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
  if (luminance > 140) {
    return fallback;
  }
  
  return color;
}
