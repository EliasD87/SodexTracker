import type { Metadata } from "next";
import { MoneyFlowView } from "@/components/analytics/MoneyFlowView";

export const metadata: Metadata = { title: "Money flow — SoDEX Analytics" };

export default function Page() {
  return <MoneyFlowView />;
}
