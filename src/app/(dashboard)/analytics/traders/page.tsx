import type { Metadata } from "next";
import { TradersView } from "@/components/analytics/TradersView";

export const metadata: Metadata = {
  title: "Traders — SoDEX Analytics",
  description: "How many people use SoDEX, how fast it is growing, and who trades there.",
};

export default function Page() {
  return <TradersView />;
}
