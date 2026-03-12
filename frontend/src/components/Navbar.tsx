"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SearchBar } from "./SearchBar";

const NAV_ITEMS = [
  { href: "/", label: "Trenches", icon: "M13 10V3L4 14h7v7l9-11h-7z" },
  { href: "/trending", label: "Trending", icon: "M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" },
  { href: "/portfolio", label: "Portfolio", icon: "M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 013 6v3" },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-bg-secondary/90 backdrop-blur-xl" role="navigation" aria-label="Main navigation">
      <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-1 px-3 lg:px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-sm whitespace-nowrap mr-5 group" aria-label="Home">
          <div className="relative">
            <div className="h-7 w-7 rounded-lg bg-accent-green/10 border border-accent-green/20 flex items-center justify-center group-hover:shadow-glow-sm transition-all">
              <svg className="w-4 h-4 text-accent-green" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>
          </div>
          <span className="text-text-primary tracking-tight">Paper<span className="text-accent-green">Trade</span></span>
        </Link>

        {/* Nav Tabs */}
        <div className="flex items-center gap-0.5 mr-4">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-accent-green/10 text-accent-green shadow-glow-sm"
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={isActive ? 2.5 : 2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Search */}
        <div className="flex-1 max-w-lg">
          <SearchBar />
        </div>
      </div>
    </nav>
  );
}
