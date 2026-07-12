import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { AccruedFundingPage } from "@/components/AccruedFundingPage";

export const metadata: Metadata = {
  title: "Accrued Funding — SoDEX Tracker",
  description: "Track estimated funding payments on open perpetual positions for any SoDEX wallet.",
};

export default function AccruedFunding() {
  return (
    <main>
      <Navbar />
      <AccruedFundingPage />
    </main>
  );
}
