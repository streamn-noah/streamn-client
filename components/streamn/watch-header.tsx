"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Shuffle } from "lucide-react";
import {
  advanceRouletteQueue,
  getRouletteQueue,
  watchHref,
} from "@/lib/streamn-storage";
import type { MediaType } from "@/lib/media";

export function WatchHeader({
  mediaType,
  mediaId,
  title,
}: {
  mediaType: MediaType;
  mediaId: number;
  title?: string;
}) {
  const router = useRouter();

  function handleReshuffle() {
    const next = advanceRouletteQueue();
    if (next) {
      router.push(watchHref(next));
      return;
    }

    router.push("/");
  }

  const queue = getRouletteQueue();
  const hasQueue = Boolean(queue?.items.length && queue.index < queue.items.length - 1);

  return (
    <header className='flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-black/80 px-4 backdrop-blur md:px-6'>
      <Link className='ghost-button h-10 px-4' href='/'>
        <ArrowLeft className='size-5' />
        Back
      </Link>
      <div className='truncate px-3 text-sm font-semibold text-white/45'>
        {title ?? (hasQueue ? "Roulette queue" : "Powered by CineSrc")}
      </div>
      <button
        className='ghost-button h-10 px-4'
        onClick={handleReshuffle}
        type='button'
      >
        <Shuffle className='size-5' />
        {hasQueue ? "Next pick" : "New pick"}
      </button>
    </header>
  );
}
