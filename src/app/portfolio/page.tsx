import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { PortfolioView } from "@/components/wallet/PortfolioView";

export const metadata: Metadata = {
  title: "Portfolio — SoDEX Tracker",
  description: "Your SoDEX wallets in one place: what they're worth together across trading, Wealth and staking, and each one in full.",
};

export default function Portfolio() {
  return (
    <>
      <Navbar />
      <PortfolioView />
    </>
  );
}
