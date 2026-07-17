import { StreamnNav } from "@/components/streamn/streamn-nav";
import { MediaDetailContent } from "@/components/streamn/media-detail-content";
import { type MediaType } from "@/lib/media";
import { getMediaDetail } from "@/lib/tmdb";
import { notFound } from "next/navigation";

export default async function TitlePage({
  params,
}: {
  params: Promise<{ type: MediaType; id: string }>;
}) {
  const resolvedParams = await params;
  const { type, id } = resolvedParams;
  const numericId = parseInt(id, 10);

  const validType = type === "movie" || type === "tv";
  if (!validType || !Number.isFinite(numericId)) {
    notFound();
  }

  let detail = null;
  try {
    detail = await getMediaDetail(type, numericId);
  } catch {
    detail = null;
  }

  if (!detail) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-black text-white pb-24 transition-all duration-300 relative">
      <StreamnNav />
      {/* Container for slide-up transition effect */}
      <div className="w-full animate-in slide-in-from-bottom-24 fade-in duration-500">
        <MediaDetailContent detail={detail} />
      </div>
    </main>
  );
}
