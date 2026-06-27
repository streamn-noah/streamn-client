"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookMarked, Compass, Home, Search, User } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useEffect, useState } from "react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";

const desktopLinks = [
  { href: "/discover", label: "Home" },
  { href: "/", label: "Search" },
  { href: "/discover?tab=movies", label: "Movies" },
  { href: "/discover?tab=shows", label: "Series" },
  { href: "/library", label: "My List" },
] as const;

const mobileLinks = [
  { href: "/discover", label: "Home", Icon: Home },
  { href: "/", label: "Search", Icon: Search },
] as const;

type Genre = { id: number; name: string };

export function StreamnNav() {
  const pathname = usePathname();
  const { user, profile } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [movieGenres, setMovieGenres] = useState<Genre[]>([]);
  const [tvGenres, setTvGenres] = useState<Genre[]>([]);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
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
      .catch(() => {});
  }, []);

  const [searchParams, setSearchParamsState] = useState("");

  useEffect(() => {
    // capture current search params client-side for active-link matching
    setSearchParamsState(window.location.search);
  }, [pathname]);

  const isActive = (href: string) => {
    const [hrefPath, hrefQuery] = href.split("?");
    const currentQuery = searchParams.startsWith("?") ? searchParams.slice(1) : searchParams;

    // Exact path match required first
    if (pathname !== hrefPath) return false;

    // If href has query params, all of them must match
    if (hrefQuery) {
      const hrefParams = new URLSearchParams(hrefQuery);
      const currentParams = new URLSearchParams(currentQuery);
      for (const [key, value] of hrefParams.entries()) {
        if (currentParams.get(key) !== value) return false;
      }
    } else {
      // href has no query params — only active if current URL also has no relevant query
      // For /discover base (Home), it should only be active when no tab param is set
      if (hrefPath === "/discover" && new URLSearchParams(currentQuery).has("tab")) return false;
    }

    return true;
  };

  return (
    <>
      {/* Desktop Nav */}
      <nav
        className={`hidden md:flex fixed top-0 left-0 right-0 z-50 items-center px-10 py-4 transition-all duration-300 ${
          scrolled ? "bg-black/90 backdrop-blur-md shadow-lg" : "bg-gradient-to-b from-black/80 to-transparent"
        }`}
        aria-label="Main navigation"
      >
        <Link href="/discover" className="mr-8 text-2xl font-bold tracking-tighter text-[#e50914]">
          Streamn
        </Link>

        <div className="flex-1 flex items-center gap-1 text-sm font-medium">
          {desktopLinks.slice(0, 4).map(({ href, label }) => (
            <Link
              key={label}
              href={href}
              className={`px-3 py-2 transition-colors hover:text-white/80 ${
                isActive(href) ? "text-white font-bold" : "text-white/60"
              }`}
            >
              {label}
            </Link>
          ))}

          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger className="bg-transparent text-white/60 hover:text-white/80 hover:bg-transparent data-[state=open]:bg-transparent focus:bg-transparent h-auto p-0 px-3 py-2 text-sm font-medium">
                  Genres
                </NavigationMenuTrigger>
                <NavigationMenuContent>
                  <div className="grid grid-cols-2 w-[400px] gap-2 p-4 bg-black/95 backdrop-blur-xl border border-white/10 rounded-lg">
                    <div>
                      <div className="text-white/40 text-xs font-bold uppercase mb-2 px-2">Movies</div>
                      {movieGenres.slice(0, 10).map((g) => (
                        <NavigationMenuLink asChild key={`m-${g.id}`}>
                          <Link
                            href={`/discover?tab=genre&type=movie&genre=${g.id}`}
                            className="block px-2 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-md"
                          >
                            {g.name}
                          </Link>
                        </NavigationMenuLink>
                      ))}
                    </div>
                    <div>
                      <div className="text-white/40 text-xs font-bold uppercase mb-2 px-2">Series</div>
                      {tvGenres.slice(0, 10).map((g) => (
                        <NavigationMenuLink asChild key={`t-${g.id}`}>
                          <Link
                            href={`/discover?tab=genre&type=tv&genre=${g.id}`}
                            className="block px-2 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-md"
                          >
                            {g.name}
                          </Link>
                        </NavigationMenuLink>
                      ))}
                    </div>
                  </div>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>

          <Link
            href="/library"
            className={`px-3 py-2 transition-colors hover:text-white/80 ${
              isActive("/library") ? "text-white font-bold" : "text-white/60"
            }`}
          >
            My List
          </Link>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <Link href="/library" className="w-8 h-8 rounded-full overflow-hidden ring-1 ring-white/20">
              {profile?.avatar_url ? (
                <img alt="" src={profile.avatar_url} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-[#e5091440] flex items-center justify-center font-bold text-white text-sm">
                  {(profile?.display_name ?? user.email ?? "?")[0]?.toUpperCase()}
                </div>
              )}
            </Link>
          ) : (
            <Link href="/auth" className="text-sm font-bold text-white bg-[#e50914] px-4 py-1.5 rounded hover:bg-[#b80710] transition-colors">
              Sign In
            </Link>
          )}
        </div>
      </nav>

      {/* Mobile Nav */}
      <nav className="md:hidden streamn-nav" aria-label="Mobile navigation">
        {mobileLinks.map(({ href, label, Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={label}
              href={href}
              className={`streamn-nav-link ${active ? "streamn-nav-link-active" : ""}`}
            >
              <Icon className="size-4" strokeWidth={active ? 2.4 : 2} />
              <span className="text-[10px]">{label}</span>
            </Link>
          );
        })}

        {user ? (
          <Link
            className={`streamn-nav-link ${isActive("/library") ? "streamn-nav-link-active" : ""}`}
            href="/library"
          >
            <div className="size-4 rounded-full overflow-hidden ring-1 ring-white/20 relative">
              {profile?.avatar_url ? (
                <img alt="" src={profile.avatar_url} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#e50914] to-purple-600 flex items-center justify-center font-bold text-white text-[8px]">
                  {(profile?.display_name ?? user.email ?? "?")[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <span className="text-[10px]">Library</span>
          </Link>
        ) : (
          <Link className={`streamn-nav-link ${isActive("/auth") ? "streamn-nav-link-active" : ""}`} href="/auth">
            <User className="size-4" strokeWidth={isActive("/auth") ? 2.4 : 2} />
            <span className="text-[10px]">Sign in</span>
          </Link>
        )}
      </nav>
    </>
  );
}
