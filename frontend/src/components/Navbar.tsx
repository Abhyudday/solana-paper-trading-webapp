"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useAuth } from "@/context/AuthContext";
import { SearchBar } from "./SearchBar";
import { shortenAddress } from "@/lib/format";

const NAV_ITEMS = [
  { href: "/", label: "Trenches" },
  { href: "/trending", label: "Trending" },
  { href: "/portfolio", label: "Portfolio", auth: true },
];

export function Navbar() {
  const pathname = usePathname();
  const { publicKey } = useWallet();
  const { isAuthenticated } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-bg-secondary/95 backdrop-blur" role="navigation" aria-label="Main navigation">
      <div className="mx-auto flex h-11 max-w-[1440px] items-center gap-0 px-3">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-1.5 font-bold text-sm whitespace-nowrap mr-4" aria-label="Home">
          <span className="text-accent-green text-lg">◆</span>
          <span>PaperTrade</span>
        </Link>

        {/* Nav Tabs */}
        <div className="flex items-center gap-0.5 mr-3">
          {NAV_ITEMS.filter(item => !item.auth || isAuthenticated).map((item) => {
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-bg-tertiary text-text-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/50"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        {/* Search */}
        <div className="flex-1 max-w-md">
          <SearchBar />
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 ml-auto">
          {isAuthenticated && publicKey && (
            <span className="text-[10px] text-text-muted font-mono bg-bg-tertiary px-2 py-1 rounded">
              {shortenAddress(publicKey.toBase58())}
            </span>
          )}
          {mounted && (
            <WalletMultiButton className="!bg-accent-green/90 hover:!bg-accent-green !text-black !h-7 !text-xs !rounded !font-semibold !px-3" />
          )}
        </div>
      </div>
    </nav>
  );
}
