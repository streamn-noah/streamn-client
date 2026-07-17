"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense, useRef } from "react";
import { DefaultAvatarFace } from "@/components/streamn/default-avatar";
import {
  Home,
  Search,
  Tv,
  Film,
  LayoutGrid,
  User,
  ChevronRight,
  ChevronDown,
  Rocket,
  ChevronLeft
} from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import streamnLogo from "@/assets/images/Vector.svg";
import Image from "next/image";

type Genre = { id: number; name: string };

function StreamnNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, profile, setAuthModalOpen } = useAuth();
  const [movieGenres, setMovieGenres] = useState<Genre[]>([]);
  const [tvGenres, setTvGenres] = useState<Genre[]>([]);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const categoriesRef = useRef<HTMLDivElement>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && document.referrer.includes(window.location.host)) {
      setCanGoBack(true);
    }
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
    const currentQuery = searchParams?.toString() || "";

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

  const currentTab = searchParams?.get("tab");
  const navTitle = pathname === "/search" ? "Search" : currentTab === "shows" ? "Series" : currentTab === "movies" ? "Movies" : "Home";

  return (
    <>
      {/* Desktop Sidebar Navigation */}
      <aside
        className="hidden md:flex fixed top-0 left-0 bottom-0 z-50 flex-col py-6 px-4 w-[72px] hover:w-[240px] transition-all duration-300 ease-in-out group bg-gradient-to-r from-black via-black/85 to-transparent select-none overflow-visible"
        aria-label="Sidebar navigation"
      >
        {/* Top Logo */}
        <Link href="/" className="flex items-center gap-3 px-2 mb-8 text-white cursor-pointer shrink-0">
          <div className="w-10 h-10 flex items-center justify-center shrink-0">
            <Image src={streamnLogo} alt="Streamn Logo" className="w-7 h-7 object-contain transition-all duration-300" />
          </div>
          <span className="text-xl font-extrabold tracking-tight text-white opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap">
            Streamn
          </span>
        </Link>

        {/* Navigation Links */}
        <div className="flex-1 flex flex-col gap-3">
          {/* Home */}
          <Link
            href="/discover"
            className="flex items-center gap-4 px-3 py-2.5 transition-colors group/item"
          >
            {isActive("/discover") ? (
              <Home className="w-6 h-6 shrink-0 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]" fill="currentColor" />
            ) : (
              <Home className="w-6 h-6 shrink-0 text-white/60 group-hover/item:text-white transition-colors" />
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
              <Search className="w-6 h-6 shrink-0 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]" strokeWidth={3} />
            ) : (
              <Search className="w-6 h-6 shrink-0 text-white/60 group-hover/item:text-white transition-colors" />
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
              <Tv className="w-6 h-6 shrink-0 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]" fill="currentColor" />
            ) : (
              <Tv className="w-6 h-6 shrink-0 text-white/60 group-hover/item:text-white transition-colors" />
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
              <Film className="w-6 h-6 shrink-0 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]" fill="currentColor" />
            ) : (
              <Film className="w-6 h-6 shrink-0 text-white/60 group-hover/item:text-white transition-colors" />
            )}
            <span
              className={`font-semibold text-sm whitespace-nowrap opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 delay-[160ms] ${isActive("/discover?tab=movies") ? "text-white font-bold" : "text-white/60 group-hover/item:text-white"
                }`}
            >
              Movies
            </span>
          </Link>

          {/* Anime */}
          <Link
            href="/discover?tab=anime"
            className="flex items-center gap-4 px-3 py-2.5 transition-colors group/item"
          >
            {isActive("/discover?tab=anime") ? (
              <Rocket className="w-6 h-6 shrink-0 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]" fill="currentColor" />
            ) : (
              <Rocket className="w-6 h-6 shrink-0 text-white/60 group-hover/item:text-white transition-colors" />
            )}
            <span
              className={`font-semibold text-sm whitespace-nowrap opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 delay-[180ms] ${isActive("/discover?tab=anime") ? "text-white font-bold" : "text-white/60 group-hover/item:text-white"
                }`}
            >
              Anime
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
                  <LayoutGrid className="w-6 h-6 shrink-0 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.7)]" fill="currentColor" />
                ) : (
                  <LayoutGrid className="w-6 h-6 shrink-0 text-white/60 group-hover/item:text-white transition-colors" />
                )}
                <span className="font-semibold text-sm whitespace-nowrap text-white/60 group-hover/item:text-white opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 delay-[200ms]">
                  Categories
                </span>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                {categoriesOpen ? (
                  <ChevronDown className="w-4 h-4 text-white/60" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-white/60" />
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
            <button
              onClick={() => setAuthModalOpen(true)}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/10 transition-colors group/user"
            >
              <div className="w-8 h-8 bg-white/20 rounded-full overflow-hidden shrink-0 flex items-center justify-center">
                <User className="size-4 text-white" />
              </div>
              <span className="text-xs font-bold text-white/80 group-hover/user:text-white opacity-0 group-hover:opacity-100 transition-all duration-300 whitespace-nowrap truncate max-w-[130px]">
                Sign In
              </span>
            </button>
          )}
        </div>
      </aside>

      {/* Mobile Top Navbar */}
      <nav
        className={`md:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between py-3 px-4 transition-all duration-300 ${
          isScrolled ? "bg-black/80 backdrop-blur-xl border-b border-white/10" : "bg-gradient-to-b from-black/80 to-transparent"
        }`}
        aria-label="Mobile navigation"
      >
        <div className="flex items-center gap-2">
          {pathname?.startsWith("/title/") && canGoBack ? (
            <button onClick={() => window.history.back()} className="flex items-center justify-center size-10 rounded-full bg-white/20 text-white backdrop-blur-md transition hover:bg-white/30">
              <ChevronLeft className="size-6" />
            </button>
          ) : (
            <Link href="/" className="flex items-center gap-2">
              <Image src={streamnLogo} alt="Streamn Logo" className="w-6 h-6 object-contain" />
              <span className="text-xl font-extrabold tracking-tight text-white">
                {navTitle}
              </span>
            </Link>
          )}
        </div>
        
        <div className="flex items-center gap-4 text-white">
          <Link href="/search">
            <Search className="w-6 h-6" />
          </Link>
          {user ? (
            <Link href="/library" className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center">
              {profile?.avatar_url ? (
                <img alt="" src={profile.avatar_url} className="w-full h-full object-cover" />
              ) : (
                <DefaultAvatarFace className="size-7" />
              )}
            </Link>
          ) : (
            <button onClick={() => setAuthModalOpen(true)} className="w-7 h-7 bg-white/20 rounded-full flex items-center justify-center">
              <User className="w-4 h-4 text-white" />
            </button>
          )}
        </div>
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
