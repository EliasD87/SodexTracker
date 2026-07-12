import { TradingPage } from "@/components/TradingPage";

export default async function TradePairPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  return <TradingPage initialSymbol={decodeURIComponent(symbol).toUpperCase()} />;
}
