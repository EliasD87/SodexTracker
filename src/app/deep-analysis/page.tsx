import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { DeepAnalysisView } from "@/components/deep/DeepAnalysisView";

export const metadata: Metadata = {
  title: "Deep analysis — SoDEX Tracker",
  description: "SoDEX as pictures: a market heatmap, a buy and sell pressure clock, whale positioning, liquidation zones and the money river.",
};

export default function Page() {
  return (
    <>
      <Navbar />
      <DeepAnalysisView />
    </>
  );
}
