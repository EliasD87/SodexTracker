import type { Metadata } from "next";
import { FundingView } from "@/components/analytics/FundingView";

export const metadata: Metadata = {
  title: "Funding & risk — SoDEX Analytics",
  description: "SoDEX funding by market, open interest against TVL, turnover, and who is paying to hold their positions.",
};

export default function Page() {
  return <FundingView />;
}
