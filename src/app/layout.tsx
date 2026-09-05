import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PortfolioProvider } from "@/components/PortfolioProvider";
import { Analytics } from "@vercel/analytics/next";

/* Inter is the workhorse both design systems specify. The CSS variable names
   are historical — renaming them would churn 116 call sites for no visual
   gain, so only what they load changes. */
const sans = Inter({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/* Dovetail asks for JetBrains Mono outright; Dub names it as an accepted
   substitute for Geist Mono. One family satisfies both. */
const mono = JetBrains_Mono({
  variable: "--font-space-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "SoDEX Tracker — Real-Time DEX Analytics",
  description:
    "Track address performance, market volume, leaderboards, pairs, and trading activity on SoDEX in real time.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable}`}
    >
      <body className="min-h-screen">
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme')||'dark';document.documentElement.classList.toggle('dark',t==='dark')})()`,
          }}
        />
        <ThemeProvider><PortfolioProvider>{children}</PortfolioProvider></ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
