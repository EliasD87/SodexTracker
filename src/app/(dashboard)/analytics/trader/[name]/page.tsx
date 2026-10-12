import type { Metadata } from "next";
import { TraderView } from "@/components/analytics/TraderView";
import { nicknameOf, traderName } from "@/lib/traderNames";

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params;
  const raw = decodeURIComponent(name);
  return { title: `${traderName(nicknameOf(raw) ?? raw)} — SoDEX Analytics` };
}

export default async function Page({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const raw = decodeURIComponent(name);
  // Links carry the shown name (amber-falcon); older ones the nickname. The data is keyed by nickname.
  return <TraderView name={nicknameOf(raw) ?? raw} />;
}
