import type { Metadata } from "next";
import { Suspense } from "react";
import { Navbar } from "@/components/Navbar";
import { TrackerPage } from "@/components/TrackerPage";

export const metadata: Metadata = {
  title: "Tracker — SoDEX Tracker",
  description: "Search any wallet address and reveal its complete trading portfolio on SoDEX — PnL, volume, rank, markets, and trade history.",
};

export default function Tracker() {
  return (
    <main>
      <Navbar />
      <Suspense fallback={null}>
        <TrackerPage />
      </Suspense>
    </main>
  );
}
