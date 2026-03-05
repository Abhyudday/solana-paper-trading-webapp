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
      <body className="min-h-screen bg-bg-primary text-text-primary antialiased">
        <Providers>
          <Navbar />
          <main className="mx-auto max-w-[1600px] px-3 lg:px-4">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
