import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { PortfolioPage } from "@/components/PortfolioPage";

export const metadata: Metadata = {
  title: "Portfolio — SoDEX Tracker",
  description: "Your saved trading portfolio on SoDEX — PnL, volume, rank, holdings, and trade history. Address saved for quick access.",
};

export default function Portfolio() {
  return (
    <main>
      <Navbar />
      <PortfolioPage />
    </main>
  );
}
