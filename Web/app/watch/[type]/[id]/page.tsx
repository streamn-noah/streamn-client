import { WatchPlayer } from "@/components/streamn/watch-player";
import { type MediaSummary, type MediaType } from "@/lib/media";
import { getMediaDetail } from "@/lib/tmdb";

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: MediaType; id: string }>;
  searchParams: Promise<{ s?: string; e?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = (await searchParams) ?? {};

  const type = resolvedParams.type;
  const id = resolvedParams.id;
  const numericId = Number(id);
  const season = Number(resolvedSearchParams.s ?? 1);
  const episode = Number(resolvedSearchParams.e ?? 1);

  const validType = type === "movie" || type === "tv";
  let detail = null;

  if (validType && Number.isFinite(numericId)) {
    try {
      detail = await getMediaDetail(type, numericId);
    } catch {
      detail = null;
    }
  }

  const item: MediaSummary = detail
    ? {
        id: detail.id,
        mediaType: detail.mediaType,
        title: detail.title,
        subtitle: detail.subtitle,
        overview: detail.overview,
        posterPath: detail.posterPath,
        backdropPath: detail.backdropPath,
        voteAverage: detail.voteAverage,
        year: detail.year,
        genreIds: detail.genreIds,
        logoPath: detail.logoPath,
        trailerKey: detail.trailerKey,
      }
    : {
        id: numericId,
        mediaType: type,
        title: "Untitled",
        subtitle: type === "movie" ? "Movie" : "Series",
        overview: "",
        posterPath: null,
        backdropPath: null,
        voteAverage: 0,
        year: "",
        genreIds: [],
      };

  return (
    <main className="h-screen w-screen bg-black text-white overflow-hidden">
      {validType && Number.isFinite(numericId) ? (
        <WatchPlayer
          episode={episode}
          item={item}
          mediaId={numericId}
          mediaType={type}
          season={season}
        />
      ) : (
        <div className="grid h-screen place-items-center text-white/60">
          This watch link is invalid.
        </div>
      )}
    </main>
  );
}
