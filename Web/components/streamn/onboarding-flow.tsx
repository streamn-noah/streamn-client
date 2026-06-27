"use client";

import Image from "next/image";
import { ArrowRight, Check, Loader2, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import type { MediaDetail, MediaSummary } from "@/lib/media";
import { tmdbImage } from "@/lib/media";
import { saveOnboardingData } from "@/lib/user-actions";
import type { TasteProfile } from "@/lib/supabase-types";

type OnboardingFlowProps = {
  genres: { id: number; name: string }[];
  popularMovies: MediaSummary[];
};

type Step = "genres" | "movies" | "done";

export function OnboardingFlow({ genres, popularMovies }: OnboardingFlowProps) {
  const router = useRouter();
  const { user, profile, loading, refreshProfile } = useAuth();
  const [step, setStep] = useState<Step>("genres");
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [selectedMovies, setSelectedMovies] = useState<
    NonNullable<TasteProfile["favoriteMovies"]>
  >([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MediaSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth");
      return;
    }
    if (profile?.onboarding_complete) {
      router.replace("/discover");
    }
  }, [loading, profile?.onboarding_complete, router, user]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(searchQuery.trim())}&mode=title`,
        );
        const payload = await response.json();
        setSearchResults(
          (payload.results ?? []).filter(
            (item: MediaSummary) => item.mediaType === "movie",
          ),
        );
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  const moviePool = useMemo(() => {
    const merged = [...searchResults, ...popularMovies];
    const seen = new Set<number>();
    return merged.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }, [popularMovies, searchResults]);

  function toggleGenre(id: number) {
    setSelectedGenres((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  async function toggleMovie(item: MediaSummary) {
    const exists = selectedMovies.some((movie) => movie.id === item.id);
    if (exists) {
      setSelectedMovies((current) =>
        current.filter((movie) => movie.id !== item.id),
      );
      return;
    }

    let genreNames: string[] = item.genreIds
      .map((id) => genres.find((genre) => genre.id === id)?.name ?? "")
      .filter(Boolean);

    try {
      const response = await fetch(
        `/api/details?type=${item.mediaType}&id=${item.id}`,
      );
      const detail = (await response.json()) as MediaDetail;
      if (response.ok) {
        genreNames = detail.genres;
      }
    } catch {
      // Keep TMDB genre ids fallback.
    }

    setSelectedMovies((current) => [
      ...current,
      {
        id: item.id,
        title: item.title,
        genres: genreNames,
        genreIds: item.genreIds,
        posterPath: item.posterPath,
      },
    ]);
  }

  async function finishOnboarding() {
    setSaving(true);

    const directors = [
      ...new Set(
        selectedMovies
          .map((movie) => movie.director)
          .filter((value): value is string => Boolean(value)),
      ),
    ];

    const taste: TasteProfile = {
      favoriteGenres: selectedGenres,
      favoriteMovies: selectedMovies,
      directors,
    };

    const ok = await saveOnboardingData(taste);
    if (ok) {
      await refreshProfile();
      setStep("done");
      window.setTimeout(() => router.replace("/discover"), 1800);
    }
    setSaving(false);
  }

  if (loading || !user) {
    return (
      <main className='onboarding-shell flex min-h-screen items-center justify-center'>
        <Loader2 className='size-8 animate-spin text-white/50' />
      </main>
    );
  }

  return (
    <main className='onboarding-shell'>
      <div className='morph-bg' />
      <div className='grain' />

      <div className='onboarding-card reveal'>
        <div className='onboarding-progress'>
          {(["genres", "movies", "done"] as const).map((value, index) => (
            <span
              className={`onboarding-progress-dot ${
                step === value ||
                (step === "movies" && value === "genres") ||
                (step === "done" && value !== "done")
                  ? "onboarding-progress-dot-active"
                  : ""
              }`}
              key={value}
              style={{ opacity: index <= (step === "genres" ? 0 : step === "movies" ? 1 : 2) ? 1 : 0.35 }}
            />
          ))}
        </div>

        {step === "genres" ? (
          <>
            <Sparkles className='size-8 text-red-400' />
            <h1 className='onboarding-title'>What genres do you love?</h1>
            <p className='onboarding-subtitle'>Pick at least 3 to personalize your feed.</p>
            <div className='genre-chip-row onboarding-genre-grid'>
              {genres.map((genre) => (
                <button
                  className={`prompt-chip ${selectedGenres.includes(genre.id) ? "prompt-chip-active" : ""}`}
                  key={genre.id}
                  onClick={() => toggleGenre(genre.id)}
                  type='button'
                >
                  {genre.name}
                </button>
              ))}
            </div>
            <button
              className='auth-cta-button mt-6'
              disabled={selectedGenres.length < 3}
              onClick={() => setStep("movies")}
              type='button'
            >
              Continue
              <ArrowRight className='size-5' />
            </button>
          </>
        ) : null}

        {step === "movies" ? (
          <>
            <h1 className='onboarding-title'>Pick your favorite movies</h1>
            <p className='onboarding-subtitle'>
              Search TMDB or tap a popular pick. Choose at least 1.
            </p>
            <div className='onboarding-search-wrap'>
              <Search className='onboarding-search-icon' />
              <input
                className='auth-input auth-input-icon-pad'
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder='Search movies...'
                value={searchQuery}
              />
            </div>
            {searching ? (
              <p className='text-sm text-white/45'>Searching...</p>
            ) : null}
            <div className='onboarding-movie-grid'>
              {moviePool.slice(0, 12).map((item) => {
                const picked = selectedMovies.some((movie) => movie.id === item.id);
                return (
                  <button
                    className={`onboarding-movie-card ${picked ? "onboarding-movie-card-active" : ""}`}
                    key={item.id}
                    onClick={() => toggleMovie(item)}
                    type='button'
                  >
                    <Image
                      src={tmdbImage(item.posterPath, "w342")}
                      alt={item.title}
                      fill
                      sizes='120px'
                      className='object-cover'
                    />
                    {picked ? (
                      <span className='onboarding-movie-check'>
                        <Check className='size-4' />
                      </span>
                    ) : null}
                    <span className='onboarding-movie-label'>{item.title}</span>
                  </button>
                );
              })}
            </div>
            <div className='mt-6 flex flex-wrap gap-3'>
              <button
                className='ghost-button'
                onClick={() => setStep("genres")}
                type='button'
              >
                Back
              </button>
              <button
                className='auth-cta-button'
                disabled={selectedMovies.length < 1 || saving}
                onClick={finishOnboarding}
                type='button'
              >
                {saving ? (
                  <Loader2 className='size-5 animate-spin' />
                ) : (
                  <>
                    Finish setup
                    <ArrowRight className='size-5' />
                  </>
                )}
              </button>
            </div>
          </>
        ) : null}

        {step === "done" ? (
          <div className='onboarding-done'>
            <Check className='size-12 text-green-400' />
            <h1 className='onboarding-title'>You&apos;re all set!</h1>
            <p className='onboarding-subtitle'>
              {selectedGenres.length} genres · {selectedMovies.length} favorite
              {selectedMovies.length === 1 ? "" : "s"} saved. Heading to Discover...
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
