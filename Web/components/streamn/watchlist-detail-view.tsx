"use client";

import Image from "next/image";
import { ArrowLeft, Play } from "lucide-react";
import { useRouter } from "next/navigation";
import { tmdbImage } from "@/lib/media";
import { StreamnNav } from "@/components/streamn/streamn-nav";

export type WatchlistDetailItem = {
  id: number;
  media_id: number;
  media_type: string;
  title: string;
  poster_path: string | null;
  vote_average?: number | null;
  year?: string;
};

export function WatchlistDetailView({
  title,
  description,
  ownerName,
  items,
  onPlay,
  primaryAction,
  secondaryActions,
  onItemClick,
}: {
  title: string;
  description?: string | null;
  ownerName?: string;
  items: WatchlistDetailItem[];
  onPlay?: () => void;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
  onItemClick?: (item: WatchlistDetailItem) => void;
}) {
  const router = useRouter();
  const firstItem = items[0];

  return (
    <main className="bg-black min-h-screen text-white relative flex flex-col md:pl-[72px] transition-all duration-300">
      <StreamnNav />

      {/* Hero Backdrop */}
      <div className="relative h-[40vh] min-h-[300px] w-full bg-zinc-900">
        {firstItem?.poster_path && (
          <>
            <Image
              src={tmdbImage(firstItem.poster_path, "original")}
              alt={title}
              fill
              className="object-cover opacity-50 blur-sm"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
          </>
        )}

        {/* Watchlist Details Header */}
        <div className="absolute bottom-0 left-0 w-full p-6 sm:p-10 z-10 flex flex-col justify-end">
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight text-white mb-2 drop-shadow-lg">
            {title}
          </h1>
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-white/80 font-medium text-sm drop-shadow-md">
            {ownerName && <span>Created by {ownerName}</span>}
            {ownerName && <span className="hidden sm:inline">•</span>}
            <span>{items.length} item{items.length === 1 ? "" : "s"}</span>
            {description && (
              <>
                <span className="hidden sm:inline">•</span>
                <span className="line-clamp-1">{description}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="px-6 sm:px-10 py-6 flex items-center gap-4 border-b border-white/10 sticky top-0 bg-black/80 backdrop-blur-xl z-20">
        {primaryAction || (
          <button
            onClick={onPlay}
            disabled={items.length === 0}
            className="flex items-center justify-center size-14 rounded-full bg-white hover:bg-zinc-200 text-black transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
            aria-label="Play Watchlist"
            type="button"
          >
            <Play className="size-6 ml-1" fill="currentColor" />
          </button>
        )}
        
        <div className="flex items-center gap-3">
          {secondaryActions}
        </div>
      </div>

      {/* Items Grid */}
      <div className="p-6 sm:p-10 flex-1">
        {items.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
            {items.map((item, index) => (
              <div
                key={item.id}
                className="group relative flex flex-col gap-2 cursor-pointer"
                onClick={() => onItemClick?.(item)}
              >
                <div className="relative aspect-[1/1.4] w-full overflow-hidden rounded-xl bg-zinc-900 border border-white/10 shadow-md group-hover:-translate-y-1 group-hover:ring-2 group-hover:ring-white/40 transition-all duration-300">
                  <Image
                    src={tmdbImage(item.poster_path, "w500")}
                    alt={item.title}
                    fill
                    priority={index < 8}
                    sizes="(max-width: 768px) 50vw, 20vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Play className="size-10 text-white drop-shadow-lg" fill="currentColor" />
                  </div>
                </div>
                <div className="flex flex-col px-1">
                  <h3 className="line-clamp-1 text-sm font-bold text-white group-hover:text-white/80 transition-colors">
                    {item.title}
                  </h3>
                  <div className="text-xs font-medium text-white/50">
                    {item.media_type === "movie" ? "Movie" : "Series"} {item.year ? `• ${item.year}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-20 text-center">
            <h3 className="text-xl font-bold text-white mb-2">This watchlist is empty</h3>
            <p className="text-white/50">Add some movies or shows to get started.</p>
          </div>
        )}
      </div>
    </main>
  );
}
