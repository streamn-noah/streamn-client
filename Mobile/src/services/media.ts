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

export function getItemFallbackColor(item?: MediaSummary): string {
  if (!item) return '#1e293b';

  if (item.genreIds && item.genreIds.length > 0) {
    const primaryGenre = item.genreIds[0];
    switch (primaryGenre) {
      case 28: return '#1c2e42'; // Action: Dark Navy Blue
      case 12: return '#1d3330'; // Adventure: Dark Forest Teal
      case 16: return '#291d38'; // Animation: Dark Purple
      case 35: return '#332918'; // Comedy: Dark Warm Amber
      case 80: return '#2c1e28'; // Crime: Dark Burgundy
      case 99: return '#222830'; // Documentary: Dark Slate
      case 18: return '#242038'; // Drama: Deep Indigo
      case 10751: return '#1f3138'; // Family: Dark Ocean Cyan
      case 14: return '#291b33'; // Fantasy: Deep Violet
      case 27: return '#33181c'; // Horror: Crimson Dark Red
      case 878: return '#182f38'; // Sci-Fi: Dark Slate Cyan
      case 53: return '#281a24'; // Thriller: Deep Plum
      default: break;
    }
  }

  const palette = [
    '#1e293b',
    '#261c33',
    '#17302b',
    '#301b24',
    '#2e2417',
    '#1b2d3d',
    '#281d33',
  ];
  let hash = 0;
  const str = item.title || `${item.id}`;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % palette.length;
  return palette[index];
}

export function adjustDominantColor(color: string, fallback = '#161e27'): string {
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

  r = Math.floor(r * 0.45);
  g = Math.floor(g * 0.45);
  b = Math.floor(b * 0.45);

  return `rgb(${r}, ${g}, ${b})`;
}
