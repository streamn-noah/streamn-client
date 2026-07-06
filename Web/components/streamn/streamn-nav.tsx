"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense, useRef } from "react";
import { DefaultAvatarFace } from "@/components/streamn/default-avatar";
import {
  RiHome5Line,
  RiHome5Fill,
  RiSearch2Line,
  RiSearch2Fill,
  RiTv2Line,
  RiTv2Fill,
  RiFilmLine,
  RiFilmFill,
  RiGridLine,
  RiGridFill,
  RiUser3Line,
  RiUser3Fill,
  RiArrowRightSLine,
  RiArrowDownSLine,
} from "@remixicon/react";
import { useAuth } from "@/components/providers/auth-provider";

type Genre = { id: number; name: string };

function StreamnNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, profile } = useAuth();
  const [movieGenres, setMovieGenres] = useState<Genre[]>([]);
  const [tvGenres, setTvGenres] = useState<Genre[]>([]);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const categoriesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/genres")
      .then((res) => res.json())
      .then((data) => {
        if (data.movieGenres) setMovieGenres(data.movieGenres);
        if (data.tvGenres) setTvGenres(data.tvGenres);
      })
      .catch(() => { });
  }, []);

  // Close categories flyout on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        categoriesRef.current &&
        !categoriesRef.current.contains(e.target as Node)
      ) {
        setCategoriesOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const isActive = (href: string) => {
    const [hrefPath, hrefQuery] = href.split("?");
    const currentQuery = searchParams.toString();

    if (pathname !== hrefPath) return false;

    if (hrefQuery) {
      const hrefParams = new URLSearchParams(hrefQuery);
      const currentParams = new URLSearchParams(currentQuery);
      for (const [key, value] of hrefParams.entries()) {
        if (currentParams.get(key) !== value) return false;
      }
      return true;
    } else {
      if (hrefPath === "/discover" && new URLSearchParams(currentQuery).has("tab")) {
        return false;
      }
      return true;
    }
  };

  const filteredMovies = movieGenres.filter((g) =>
    g.name.toLowerCase().includes(categorySearch.toLowerCase())
  );
  const filteredTv = tvGenres.filter((g) =>
    g.name.toLowerCase().includes(categorySearch.toLowerCase())
  );

  return (
    <>
      {/* Desktop Sidebar Navigation */}
      <aside
        className="hidden md:flex fixed top-0 left-0 bottom-0 z-50 flex-col py-6 px-4 w-[72px] hover:w-[240px] transition-all duration-300 ease-in-out group bg-gradient-to-r from-black via-black/85 to-transparent select-none overflow-visible"
        aria-label="Sidebar navigation"
      >
        {/* Top Logo */}
        <div className="flex items-center gap-3 px-2 mb-8 text-white cursor-pointer shrink-0">
          <div className="w-10 h-10 flex items-center justify-center shrink-0">
            <svg
              viewBox="0 0 24 24"
              className="w-7 h-7 fill-white text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]"
            >
              <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
            </svg>
          </div>
          <span className="text-xl font-extrabold tracking-tight text-white opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap">
            Streamn
          </span>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 flex flex-col gap-3">
          {/* Home */}
          <Link
            href="/discover"
            className="flex items-center gap-4 px-3 py-2.5 transition-colors group/item"
          >
            {isActive("/discover") ? (
              <RiHome5Fill className="w-6 h-6 shrink-0 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
            ) : (
              <RiHome5Line className="w-6 h-6 shrink-0 text-white/60 group-hover/item:text-white transition-colors" />
            )}
            <span
              className={`font-semibold text-sm whitespace-nowrap opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 delay-[40ms] ${isActive("/discover") ? "text-white font-bold" : "text-white/60 group-hover/item:text-white"
                }`}
            >
              Home
            </span>
          </Link>

          {/* Search */}
          <Link
            href="/search"
            className="flex items-center gap-4 px-3 py-2.5 transition-colors group/item"
          >
            {isActive("/") ? (
              <RiSearch2Fill className="w-6 h-6 shrink-0 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
            ) : (
              <RiSearch2Line className="w-6 h-6 shrink-0 text-white/60 group-hover/item:text-white transition-colors" />
            )}
            <span
              className={`font-semibold text-sm whitespace-nowrap opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 delay-[80ms] ${isActive("/") ? "text-white font-bold" : "text-white/60 group-hover/item:text-white"
                }`}
            >
              Search
            </span>
          </Link>

          {/* Series */}
          <Link
            href="/discover?tab=shows"
            className="flex items-center gap-4 px-3 py-2.5 transition-colors group/item"
          >
            {isActive("/discover?tab=shows") ? (
              <RiTv2Fill className="w-6 h-6 shrink-0 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
            ) : (
              <RiTv2Line className="w-6 h-6 shrink-0 text-white/60 group-hover/item:text-white transition-colors" />
            )}
            <span
              className={`font-semibold text-sm whitespace-nowrap opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 delay-[120ms] ${isActive("/discover?tab=shows") ? "text-white font-bold" : "text-white/60 group-hover/item:text-white"
                }`}
            >
              Series
            </span>
          </Link>

          {/* Movies */}
          <Link
            href="/discover?tab=movies"
            className="flex items-center gap-4 px-3 py-2.5 transition-colors group/item"
          >
            {isActive("/discover?tab=movies") ? (
              <RiFilmFill className="w-6 h-6 shrink-0 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
            ) : (
              <RiFilmLine className="w-6 h-6 shrink-0 text-white/60 group-hover/item:text-white transition-colors" />
            )}
            <span
              className={`font-semibold text-sm whitespace-nowrap opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 delay-[160ms] ${isActive("/discover?tab=movies") ? "text-white font-bold" : "text-white/60 group-hover/item:text-white"
                }`}
            >
              Movies
            </span>
          </Link>

          {/* Floating Flyout Categories Section */}
          <div className="relative" ref={categoriesRef}>
            <button
              onClick={() => setCategoriesOpen(!categoriesOpen)}
              className="w-full flex items-center justify-between px-3 py-2.5 transition-colors group/item"
              type="button"
            >
              <div className="flex items-center gap-4">
                {categoriesOpen || isActive("/discover?tab=genre") ? (
                  <RiGridFill className="w-6 h-6 shrink-0 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]" />
                ) : (
                  <RiGridLine className="w-6 h-6 shrink-0 text-white/60 group-hover/item:text-white transition-colors" />
                )}
                <span className="font-semibold text-sm whitespace-nowrap text-white/60 group-hover/item:text-white opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 delay-[200ms]">
                  Categories
                </span>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                {categoriesOpen ? (
                  <RiArrowDownSLine className="w-4 h-4 text-white/60" />
                ) : (
                  <RiArrowRightSLine className="w-4 h-4 text-white/60" />
                )}
              </div>
            </button>

            {/* Flyout Panel floating to the right of sidebar */}
            {categoriesOpen && (
              <div className="fixed left-[76px] group-hover:left-[244px] top-32 z-50 w-64 bg-black/95 backdrop-blur-2xl border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col gap-2 transition-all duration-300">
                <input
                  type="text"
                  placeholder="Filter categories..."
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  className="w-full bg-white/10 text-xs text-white placeholder-white/40 rounded-lg px-3 py-2 outline-none border border-white/10 mb-1"
                />
                <div className="max-h-64 overflow-y-auto no-scrollbar flex flex-col gap-1 pr-1">
                  <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider px-1">
                    Movies
                  </div>
                  {filteredMovies.slice(0, 12).map((g) => (
                    <Link
                      key={`m-${g.id}`}
                      href={`/discover?tab=genre&type=movie&genre=${g.id}`}
                      onClick={() => setCategoriesOpen(false)}
                      className="block text-xs font-semibold leading-normal px-2.5 py-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors truncate shrink-0"
                    >
                      {g.name}
                    </Link>
                  ))}

                  <div className="text-[10px] font-bold text-white/40 uppercase tracking-wider px-1 mt-3 mb-1">
                    Series
                  </div>
                  {filteredTv.slice(0, 12).map((g) => (
                    <Link
                      key={`t-${g.id}`}
                      href={`/discover?tab=genre&type=tv&genre=${g.id}`}
                      onClick={() => setCategoriesOpen(false)}
                      className="block text-xs font-semibold leading-normal px-2.5 py-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors truncate shrink-0"
                    >
                      {g.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* User Profile Avatar at Bottom (Acts as My Space / Library Link) */}
        <div className="pt-4 shrink-0">
          {user ? (
            <Link
              href="/library"
              className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/10 transition-colors group/user"
            >
              <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center">
                {profile?.avatar_url ? (
                  <img
                    alt=""
                    src={profile.avatar_url}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <DefaultAvatarFace className="size-8" />
                )}
              </div>
              <span className="text-xs font-semibold text-white/80 group-hover/user:text-white opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap truncate max-w-[130px]">
                {profile?.display_name ?? user.email?.split("@")[0]}
              </span>
            </Link>
          ) : (
            <Link
              href="/auth"
              className="flex items-center gap-3 px-2 py-2 text-white/70 hover:text-white transition-colors"
            >
              <RiUser3Line className="w-6 h-6 shrink-0" />
              <span className="text-xs font-bold text-white opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap">
                Sign In
              </span>
            </Link>
          )}
        </div>
      </aside>

      {/* Mobile Traditional Bottom Tab Bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black/95 border-t border-white/10 flex items-center justify-around py-2 px-1 shadow-2xl"
        aria-label="Mobile navigation"
      >
        <Link
          href="/discover"
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${isActive("/discover") ? "text-white font-bold scale-105" : "text-white/50"
            }`}
        >
          {isActive("/discover") ? (
            <RiHome5Fill className="w-5 h-5 drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]" />
          ) : (
            <RiHome5Line className="w-5 h-5" />
          )}
          <span className="text-[10px]">Home</span>
        </Link>

        <Link
          href="/"
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${isActive("/") ? "text-white font-bold scale-105" : "text-white/50"
            }`}
        >
          {isActive("/search") ? (
            <RiSearch2Fill className="w-5 h-5 drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]" />
          ) : (
            <RiSearch2Line className="w-5 h-5" />
          )}
          <span className="text-[10px]">Search</span>
        </Link>

        <Link
          href="/discover?tab=shows"
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${isActive("/discover?tab=shows") ? "text-white font-bold scale-105" : "text-white/50"
            }`}
        >
          {isActive("/discover?tab=shows") ? (
            <RiTv2Fill className="w-5 h-5 drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]" />
          ) : (
            <RiTv2Line className="w-5 h-5" />
          )}
          <span className="text-[10px]">Series</span>
        </Link>

        <Link
          href="/discover?tab=movies"
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${isActive("/discover?tab=movies") ? "text-white font-bold scale-105" : "text-white/50"
            }`}
        >
          {isActive("/discover?tab=movies") ? (
            <RiFilmFill className="w-5 h-5 drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]" />
          ) : (
            <RiFilmLine className="w-5 h-5" />
          )}
          <span className="text-[10px]">Movies</span>
        </Link>

        <Link
          href="/library"
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all ${isActive("/library") ? "text-white font-bold scale-105" : "text-white/50"
            }`}
        >
          {isActive("/library") ? (
            <RiUser3Fill className="w-5 h-5 drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]" />
          ) : (
            <RiUser3Line className="w-5 h-5" />
          )}
          <span className="text-[10px]">My Space</span>
        </Link>
      </nav>
    </>
  );
}

export function StreamnNav() {
  return (
    <Suspense fallback={null}>
      <StreamnNavInner />
    </Suspense>
  );
}
