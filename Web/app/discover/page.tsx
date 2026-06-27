import { DiscoverApp } from "@/components/streamn/discover-app";
import {
  enrichWithLogos,
  getGenreList,
  getLatest,
  getTopRated,
  getTrending,
  watchProviders,
} from "@/lib/tmdb";

export default async function DiscoverPage() {
  const [
    trendingWeek,
    trendingMovies,
    trendingTv,
    trendingMoviesToday,
    trendingTvToday,
    latestMovies,
    latestTv,
    topRatedMovies,
    topRatedTv,
    movieGenres,
    tvGenres,
  ] = await Promise.all([
    getTrending("all", "week"),
    getTrending("movie", "week"),
    getTrending("tv", "week"),
    getTrending("movie", "day"),
    getTrending("tv", "day"),
    getLatest("movie"),
    getLatest("tv"),
    getTopRated("movie"),
    getTopRated("tv"),
    getGenreList("movie"),
    getGenreList("tv"),
  ]);

  const bannerSource = trendingWeek
    .filter((item) => item.backdropPath)
    .slice(0, 5);
  const bannerItems = await enrichWithLogos(bannerSource);

  return (
    <DiscoverApp
      data={{
        bannerItems,
        trendingWeek,
        trendingMovies,
        trendingTv,
        trendingMoviesToday,
        trendingTvToday,
        latestMovies,
        latestTv,
        topRatedMovies,
        topRatedTv,
        providers: watchProviders.map((provider) => ({
          name: provider.name,
          slug: provider.slug,
        })),
        movieGenres,
        tvGenres,
      }}
    />
  );
}
