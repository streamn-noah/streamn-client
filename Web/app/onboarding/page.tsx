import { getGenreList, getTrending } from "@/lib/tmdb";
import { OnboardingFlow } from "@/components/streamn/onboarding-flow";

export default async function OnboardingPage() {
  const [movieGenres, tvGenres, trending] = await Promise.all([
    getGenreList("movie"),
    getGenreList("tv"),
    getTrending("movie"),
  ]);

  const genreMap = new Map<number, { id: number; name: string }>();
  for (const genre of [...movieGenres, ...tvGenres]) {
    genreMap.set(genre.id, genre);
  }

  return (
    <OnboardingFlow
      genres={Array.from(genreMap.values())}
      popularMovies={trending.filter((item) => item.mediaType === "movie").slice(0, 16)}
    />
  );
}
