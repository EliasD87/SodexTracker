import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { LeaderboardPage } from "@/components/LeaderboardPage";

export const metadata: Metadata = {
  title: "Leaderboard — SoDEX Tracker",
  description: "Top traders on SoDEX ranked by PnL and volume across 24H, 7D, 30D, and all-time windows.",
};

export default function Leaderboard() {
  return (
    <main>
      <Navbar />
      <LeaderboardPage />
    </main>
  );
}
