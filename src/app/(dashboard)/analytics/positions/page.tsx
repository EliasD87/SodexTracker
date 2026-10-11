import type { Metadata } from "next";
import { PositionsView } from "@/components/analytics/PositionsView";

export const metadata: Metadata = { title: "Positions — SoDEX Analytics" };

export default function Page() {
  return <PositionsView />;
}
