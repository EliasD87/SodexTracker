import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { WatchlistPage } from "@/components/WatchlistPage";

export const metadata: Metadata = {
  title: "Watchlist — SoDEX Tracker",
  description: "Save and organize wallet addresses to track on SoDEX.",
};

export default function Watchlist() {
  return (
    <main>
      <Navbar />
      <WatchlistPage />
    </main>
  );
}
