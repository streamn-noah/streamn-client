import { DiscoverApp } from "@/components/streamn/discover-app";
import {
  enrichWithLogos,
  fetchWatchProvidersFromTmdb,
  getGenreList,
  getLatest,
  getTopRated,
  getTrending,
  getAnime,
  getTrendingAnime,
  getTopRatedAnime,
  getTopRatedAnimeMovies,
  discoverByGenre,
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
    providersList,
    animeTv,
    trendingAnime,
    topRatedAnime,
    topRatedAnimeMovies,
    actionMovies,
    comedyMovies,
    scifiMovies,
    horrorMovies,
    romanceMovies,
    crimeMovies,
  ] = await Promise.all([
    getTrending("all", "week").catch(() => []),
    getTrending("movie", "week").catch(() => []),
    getTrending("tv", "week").catch(() => []),
    getTrending("movie", "day").catch(() => []),
    getTrending("tv", "day").catch(() => []),
    getLatest("movie").catch(() => []),
    getLatest("tv").catch(() => []),
    getTopRated("movie").catch(() => []),
    getTopRated("tv").catch(() => []),
    getGenreList("movie").catch(() => [] as { id: number; name: string }[]),
    getGenreList("tv").catch(() => [] as { id: number; name: string }[]),
    fetchWatchProvidersFromTmdb().catch(() => []),
    getAnime().catch(() => []),
    getTrendingAnime("week").catch(() => []),
    getTopRatedAnime().catch(() => []),
    getTopRatedAnimeMovies().catch(() => []),
    discoverByGenre("movie", 28).catch(() => []),
    discoverByGenre("movie", 35).catch(() => []),
    discoverByGenre("movie", 878).catch(() => []),
    discoverByGenre("movie", 27).catch(() => []),
    discoverByGenre("movie", 10749).catch(() => []),
    discoverByGenre("movie", 80).catch(() => []),
  ]);

  const bannerSource = trendingWeek
    .filter((item: any) => item.backdropPath)
    .slice(0, 8);
  const bannerItems = await enrichWithLogos(bannerSource).catch(() => []);

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
        providers: providersList.map((provider: any) => ({
          name: provider.name,
          slug: provider.slug,
          logoPath: provider.logoPath,
        })),
        movieGenres: movieGenres ?? [],
        tvGenres: tvGenres ?? [],
        animeTv,
        trendingAnime,
        topRatedAnime,
        topRatedAnimeMovies,
        actionMovies,
        comedyMovies,
        scifiMovies,
        horrorMovies,
        romanceMovies,
        crimeMovies,
      }}
    />
  );
}
