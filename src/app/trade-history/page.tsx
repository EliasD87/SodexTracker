import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { TradeHistoryPage } from "@/components/TradeHistoryPage";

export const metadata: Metadata = {
  title: "Trade History — SoDEX Tracker",
  description: "View complete perps position history for any SoDEX wallet — closed positions with entry, exit, PnL, leverage, and fees.",
};

export default function TradeHistory() {
  return (
    <main>
      <Navbar />
      <TradeHistoryPage />
    </main>
  );
}
