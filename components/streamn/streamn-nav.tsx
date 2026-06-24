"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Home } from "lucide-react";

const links = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/discover", label: "Discover", Icon: Compass },
] as const;

export function StreamnNav() {
  const pathname = usePathname();

  return (
    <nav className='streamn-nav' aria-label='Main navigation'>
      {links.map(({ href, label, Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

        return (
          <Link
            className={`streamn-nav-link ${active ? "streamn-nav-link-active" : ""}`}
            href={href}
            key={href}
          >
            <Icon className='size-5' strokeWidth={active ? 2.4 : 2} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
