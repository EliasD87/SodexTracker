import { Navbar } from "@/components/Navbar";
import { Hero } from "@/components/Hero";
import { VolumeChart } from "@/components/VolumeChart";
import { StatsTicker } from "@/components/StatsTicker";
import { TopPairs } from "@/components/TopPairs";
import { TopTraders } from "@/components/TopTraders";
import { LandingDataProvider } from "@/components/LandingDataProvider";

export default function Home() {
  return (
    <LandingDataProvider>
      <main>
        <Navbar />
        <Hero />
        <VolumeChart />
        <StatsTicker />
        <TopPairs />
        <TopTraders />
      </main>
    </LandingDataProvider>
  );
}
