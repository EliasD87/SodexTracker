import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { TradeHistoryPage } from "@/components/TradeHistoryPage";

export const metadata: Metadata = {
  title: "Trade History — SoDEX Tracker",
  description: "View complete perps and spot trade history for any SoDEX wallet — fills, fees, volume, and full CSV export.",
};

export default function TradeHistory() {
  return (
    <main>
      <Navbar />
      <TradeHistoryPage />
    </main>
  );
}
