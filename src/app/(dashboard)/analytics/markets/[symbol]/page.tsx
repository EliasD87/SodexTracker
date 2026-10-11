import type { Metadata } from "next";
import { MarketView } from "@/components/analytics/MarketView";
import { marketFromSlug } from "@/lib/analyticsFormat";

type Props = { params: Promise<{ symbol: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const symbol = marketFromSlug((await params).symbol);
  return {
    title: `${symbol} — SoDEX Analytics`,
    description: `${symbol} on SoDEX: live liquidity, slippage and depth, open interest, funding, traders and volume history.`,
  };
}

export default async function Page({ params }: Props) {
  return <MarketView slug={(await params).symbol} />;
}
