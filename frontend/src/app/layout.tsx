import type { Metadata } from "next";
import { Providers } from "@/context/Providers";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Solana Paper Trading",
  description: "Practice trading Solana tokens with zero risk",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-bg-primary text-text-primary antialiased relative overflow-x-hidden">
        {/* Prydex-style background layers */}
        <div className="fixed inset-0 bg-grid-pattern opacity-50 pointer-events-none" />
        <div className="fixed inset-0 bg-vignette pointer-events-none" />
        <div className="fixed -top-56 left-1/2 -translate-x-1/2 h-[520px] w-[900px] rounded-full bg-[#39FF14]/[0.04] blur-3xl pointer-events-none" />

        <Providers>
          <div className="relative z-10">
            <Navbar />
            <main className="mx-auto max-w-[1600px] px-3 sm:px-4 lg:px-6">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
