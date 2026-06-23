import Link from "next/link";
import { ArrowLeft, Shuffle } from "lucide-react";
import { cinesrcUrl, type MediaType } from "@/lib/media";

export default async function WatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: MediaType; id: string }>;
  searchParams: Promise<{ s?: string; e?: string }>;
}) {
  const { type, id } = await params;
  const { s, e } = await searchParams;
  const numericId = Number(id);
  const season = Number(s ?? 1);
  const episode = Number(e ?? 1);

  const validType = type === "movie" || type === "tv";
  const src = validType && Number.isFinite(numericId) ? cinesrcUrl(type, numericId, season, episode) : "";

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="flex h-screen flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-black/80 px-4 backdrop-blur md:px-6">
          <Link className="ghost-button h-10 px-4" href="/">
            <ArrowLeft className="size-5" />
            Back
          </Link>
          <div className="text-sm font-semibold text-white/45">Powered by CineSrc</div>
          <Link className="ghost-button h-10 px-4" href="/">
            <Shuffle className="size-5" />
            New pick
          </Link>
        </header>
        {src ? (
          <iframe
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            className="min-h-0 flex-1"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-presentation"
            src={src}
            title="Streamn player"
          />
        ) : (
          <div className="grid flex-1 place-items-center text-white/60">This watch link is invalid.</div>
        )}
      </div>
    </main>
  );
}
