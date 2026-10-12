import type { Metadata } from "next";
import { WealthView } from "@/components/analytics/WealthView";

export const metadata: Metadata = { title: "Wealth — SoDEX Analytics" };

export default function Page() {
  return <WealthView />;
}
