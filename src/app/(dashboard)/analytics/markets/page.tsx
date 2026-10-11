import type { Metadata } from "next";
import { MarketsView } from "@/components/analytics/MarketsView";

export const metadata: Metadata = {
  title: "Markets — SoDEX Analytics",
  description: "Every SoDEX market's activity profile: volume, traders, trades per trader, turnover, open interest, funding and estimated fees.",
};

export default function Page() {
  return <MarketsView />;
}
