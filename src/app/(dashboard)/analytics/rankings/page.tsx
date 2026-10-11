import type { Metadata } from "next";
import { RankingsView } from "@/components/analytics/RankingsView";

export const metadata: Metadata = { title: "Rankings — SoDEX Analytics" };

export default function Page() {
  return <RankingsView />;
}
