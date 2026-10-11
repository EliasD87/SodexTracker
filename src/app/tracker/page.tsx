import type { Metadata } from "next";
import { Suspense } from "react";
import { Navbar } from "@/components/Navbar";
import { TrackerView } from "@/components/wallet/TrackerView";

export const metadata: Metadata = {
  title: "Tracker — SoDEX Tracker",
  description: "Look inside any SoDEX wallet: net worth, open positions and liquidation levels, trading record, Wealth and staking, deposits and withdrawals.",
};

export default function Tracker() {
  return (
    <>
      <Navbar />
      {/* TrackerView reads ?address=, which needs a Suspense boundary. */}
      <Suspense fallback={null}>
        <TrackerView />
      </Suspense>
    </>
  );
}
