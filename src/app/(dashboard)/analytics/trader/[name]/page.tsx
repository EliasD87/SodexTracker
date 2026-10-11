import type { Metadata } from "next";
import { TraderView } from "@/components/analytics/TraderView";

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params;
  return { title: `${decodeURIComponent(name)} — SoDEX Analytics` };
}

export default async function Page({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  return <TraderView name={decodeURIComponent(name)} />;
}
