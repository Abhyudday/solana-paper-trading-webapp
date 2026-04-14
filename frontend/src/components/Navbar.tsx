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
    <nav className="sticky top-0 z-50 border-b border-white/10 bg-black/40 backdrop-blur" role="navigation" aria-label="Main navigation">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-3 sm:px-4 lg:px-6">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 sm:gap-3 font-bold text-sm whitespace-nowrap mr-5 group" aria-label="Home">
          <span className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg border border-[#39FF14]/25 bg-[#39FF14]/10 flex items-center justify-center shrink-0 group-hover:shadow-neon transition-all">
            <svg className="w-4 h-4 text-[#39FF14]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </span>
          <span className="text-white font-bold tracking-wider">Paper<span className="text-[#39FF14]">Trade</span></span>
          <span className="text-[11px] px-2 py-0.5 rounded-md bg-white/10 text-white/70 hidden sm:inline">SIM</span>
        </Link>

        {/* Nav Tabs */}
        <nav className="hidden lg:flex items-center gap-6 overflow-x-auto hide-scrollbar pr-2 mr-4">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm font-semibold transition whitespace-nowrap ${
                  isActive ? "text-white" : "text-white/70 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Mobile Nav */}
        <div className="flex lg:hidden items-center gap-1 mr-2">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`h-9 px-3 rounded-lg border text-xs font-semibold whitespace-nowrap flex items-center transition-all ${
                  isActive
                    ? "border-emerald-300/40 bg-emerald-400/15 text-emerald-100"
                    : "border-white/10 bg-white/5 text-white/70"
                }`}
              >
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
