"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Film, Play, Star } from "lucide-react";
import { useState } from "react";
import type { Episode, MediaDetail, MediaSummary } from "@/lib/media";
import { tmdbImage } from "@/lib/media";
import { getWatchProgress, watchHref } from "@/lib/streamn-storage";

function runtimeLabel(minutes: number | null) {
  if (!minutes) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (!hours) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

export function DetailSkeleton() {
  return (
    <div className='modal-entrance h-[82vh] animate-pulse overflow-hidden'>
      <div className='h-[54vh] bg-white/10' />
      <div className='space-y-4 p-8'>
        <div className='h-10 w-64 rounded bg-white/10' />
        <div className='h-4 w-3/4 rounded bg-white/10' />
        <div className='h-4 w-2/3 rounded bg-white/10' />
      </div>
    </div>
  );
}

function Episodes({
  initialEpisodes,
  mediaId,
  seasons,
}: {
  initialEpisodes: Episode[];
  mediaId: number;
  seasons: MediaDetail["seasons"];
}) {
  const [episodes, setEpisodes] = useState(initialEpisodes);
  const [selectedSeason, setSelectedSeason] = useState(
    initialEpisodes[0]?.seasonNumber ?? seasons[0]?.seasonNumber ?? 1,
  );
  const [loadingSeason, setLoadingSeason] = useState(false);

  async function changeSeason(seasonNumber: number) {
    setSelectedSeason(seasonNumber);
    setLoadingSeason(true);

    try {
      const response = await fetch(
        `/api/season?tvId=${mediaId}&season=${seasonNumber}`,
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load season.");
      setEpisodes(data.episodes ?? []);
    } finally {
      setLoadingSeason(false);
    }
  }

  return (
    <div>
      <div className='mb-4 flex items-center justify-between gap-4'>
        <h3 className='section-title mb-0'>Episodes</h3>
        <label className='season-select-wrap'>
          <span className='sr-only'>Choose season</span>
          <select
            className='season-select'
            disabled={loadingSeason}
            onChange={(event) => changeSeason(Number(event.target.value))}
            value={selectedSeason}
          >
            {seasons.map((season) => (
              <option key={season.id} value={season.seasonNumber}>
                {season.name}
              </option>
            ))}
          </select>
          <ChevronDown className='pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-white/55' />
        </label>
      </div>
      <div
        className={`episode-list overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] ${loadingSeason ? "opacity-55" : ""}`}
      >
        {episodes.slice(0, 8).map((episode) => (
          <Link
            className='grid grid-cols-[2rem_7rem_1fr] gap-4 border-b border-white/8 p-4 transition hover:bg-white/[0.05] md:grid-cols-[2.5rem_12.5rem_1fr_4rem]'
            href={`/watch/tv/${mediaId}?s=${episode.seasonNumber}&e=${episode.episodeNumber}`}
            key={episode.id}
          >
            <span className='self-center text-2xl font-bold text-white/45'>
              {episode.episodeNumber}
            </span>
            <span className='relative aspect-video overflow-hidden rounded-xl bg-white/8'>
              {episode.stillPath ? (
                <Image
                  src={tmdbImage(episode.stillPath, "w300")}
                  alt=''
                  fill
                  sizes='200px'
                  className='object-cover'
                />
              ) : null}
            </span>
            <span className='min-w-0'>
              <span className='block truncate text-base font-bold text-white'>
                {episode.name}
              </span>
              <span className='mt-1 block text-sm text-white/45'>
                {episode.airDate}
              </span>
              <span className='mt-2 line-clamp-2 text-sm leading-6 text-white/55'>
                {episode.overview}
              </span>
            </span>
            <span className='hidden self-start pt-1 text-sm font-semibold text-white/55 md:block'>
              {runtimeLabel(episode.runtime)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function MediaDetailContent({
  detail,
  onSelect,
}: {
  detail: MediaDetail;
  onSelect: (item: MediaSummary) => void;
}) {
  const firstEpisode = detail.episodes[0];
  const saved = getWatchProgress(detail.mediaType, detail.id);
  const href = watchHref(detail, {
    season: saved?.seasonNumber ?? firstEpisode?.seasonNumber ?? 1,
    episode: saved?.episodeNumber ?? firstEpisode?.episodeNumber ?? 1,
  });

  return (
    <div className='modal-entrance max-h-[90vh] overflow-y-auto bg-black text-white'>
      <section className='relative min-h-[58vh] overflow-hidden'>
        <Image
          src={tmdbImage(detail.backdropPath || detail.posterPath, "original")}
          alt=''
          fill
          sizes='100vw'
          className='object-cover'
          priority
        />
        <div className='absolute inset-0 bg-gradient-to-t from-black via-black/30 to-black/10' />
        <div className='absolute inset-0 bg-gradient-to-r from-black/75 via-transparent to-transparent' />
        <div className='detail-hero-content relative z-10 flex min-h-[58vh] max-w-3xl flex-col justify-end p-6 pt-24 md:p-10'>
          {detail.logoPath ? (
            <Image
              src={tmdbImage(detail.logoPath, "w500")}
              alt={detail.title}
              width={420}
              height={170}
              className='mb-5 h-auto max-h-24 md:max-h-36 w-auto max-w-[75%] object-contain object-left'
            />
          ) : (
            <h2 className='mb-5 max-w-2xl text-5xl font-black tracking-tight'>
              {detail.title}
            </h2>
          )}
          <div className='flex flex-wrap gap-2'>
            <span className='detail-pill text-yellow-300'>
              <Star className='size-4 fill-current' />
              {detail.voteAverage ? detail.voteAverage.toFixed(1) : "New"}/10
            </span>
            <span className='detail-pill'>{detail.year}</span>
            {runtimeLabel(detail.runtime) ? (
              <span className='detail-pill'>
                {runtimeLabel(detail.runtime)}
              </span>
            ) : null}
            <span className='detail-pill'>{detail.certification}</span>
            {detail.genres.slice(0, 3).map((genre) => (
              <span className='detail-pill' key={genre}>
                {genre}
              </span>
            ))}
          </div>
          <div className='mt-5 flex flex-wrap gap-3'>
            <Link className='primary-button' href={href}>
              <Play className='size-5 fill-current' />
              Play
            </Link>
            {detail.trailerKey ? (
              <a
                className='ghost-button'
                href={`https://www.youtube.com/watch?v=${detail.trailerKey}`}
                rel='noreferrer'
                target='_blank'
              >
                <Film className='size-5' />
                Trailer
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className='modal-body-entrance space-y-9 px-6 pb-10 pt-6 md:px-10'>
        <p className='max-w-4xl text-base leading-7 text-white/65 md:text-lg'>
          {detail.overview}
        </p>

        {detail.cast.length ? (
          <div>
            <h3 className='section-title'>Cast</h3>
            <div className='no-scrollbar flex gap-4 overflow-x-auto pb-2'>
              {detail.cast.map((member) => (
                <div className='w-28 shrink-0' key={member.id}>
                  <div className='relative h-36 overflow-hidden rounded-2xl bg-white/8'>
                    {member.profilePath ? (
                      <Image
                        src={tmdbImage(member.profilePath, "w185")}
                        alt=''
                        fill
                        sizes='112px'
                        className='object-cover'
                      />
                    ) : null}
                  </div>
                  <p className='mt-3 truncate text-sm font-bold text-white'>
                    {member.name}
                  </p>
                  <p className='truncate text-xs text-white/45'>
                    {member.character}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {detail.episodes.length ? (
          <Episodes
            initialEpisodes={detail.episodes}
            mediaId={detail.id}
            seasons={detail.seasons}
          />
        ) : null}

        {detail.recommendations.length ? (
          <div>
            <h3 className='section-title'>More Like This</h3>
            <div className='grid grid-cols-2 gap-4 md:grid-cols-4'>
              {detail.recommendations.slice(0, 8).map((item) => (
                <button
                  className='group relative aspect-[16/9] overflow-hidden rounded-2xl bg-white/8 text-left'
                  key={`${item.mediaType}-${item.id}`}
                  onClick={() => onSelect(item)}
                  type='button'
                >
                  <Image
                    src={tmdbImage(
                      item.backdropPath || item.posterPath,
                      "w780",
                    )}
                    alt=''
                    fill
                    sizes='(max-width: 768px) 50vw, 280px'
                    className='object-cover transition group-hover:scale-105'
                  />
                  <span className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black to-transparent p-3 text-sm font-bold'>
                    {item.title}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
