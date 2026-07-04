"use client";

import dynamic from "next/dynamic";
import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { StatsTicker } from "@/components/StatsTicker";
import { LandingDataProvider } from "@/components/LandingDataProvider";

const VolumeChart = dynamic(() => import("@/components/VolumeChart").then((m) => m.VolumeChart), { ssr: false });
const TopPairs = dynamic(() => import("@/components/TopPairs").then((m) => m.TopPairs), { ssr: false });
const TopTraders = dynamic(() => import("@/components/TopTraders").then((m) => m.TopTraders), { ssr: false });

export default function Home() {
  return (
    <main>
      <Navbar />
      <LandingDataProvider>
        <Hero />
        <StatsTicker />
        <VolumeChart />
        <TopPairs />
        <TopTraders />
      </LandingDataProvider>
    </main>
  );
}
