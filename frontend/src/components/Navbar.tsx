"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useAuth } from "@/context/AuthContext";
import { SearchBar } from "./SearchBar";
import { shortenAddress } from "@/lib/format";

export function Navbar() {
  const { publicKey } = useWallet();
  const { isAuthenticated } = useAuth();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-bg-secondary/95 backdrop-blur" role="navigation" aria-label="Main navigation">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg whitespace-nowrap" aria-label="Home">
          <span className="text-accent-green">◆</span>
          <span>PaperTrade</span>
        </Link>

        <div className="flex-1 max-w-xl mx-4">
          <SearchBar />
        </div>

        <div className="flex items-center gap-3">
          {isAuthenticated && (
            <>
              <Link href="/portfolio" className="text-sm text-text-secondary hover:text-text-primary transition-colors" aria-label="Portfolio">
                Portfolio
              </Link>
              {publicKey && (
                <span className="text-xs text-text-muted font-mono bg-bg-tertiary px-2 py-1 rounded">
                  {shortenAddress(publicKey.toBase58())}
                </span>
              )}
            </>
          )}
          {mounted && (
            <WalletMultiButton className="!bg-accent-blue hover:!bg-accent-blue/80 !h-9 !text-sm !rounded-lg" />
          )}
        </div>
      </div>
    </nav>
  );
}
