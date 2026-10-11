"use client";

import dynamic from "next/dynamic";
import { OverviewView } from "@/components/analytics/OverviewView";

const AnnouncementCard = dynamic(() => import("@/components/AnnouncementCard").then((m) => m.AnnouncementCard), { ssr: false });

/**
 * The home page: Overview, the first tab of the dashboard. The shared layout
 * draws the header and tabs; SoDEX's latest announcement closes the page.
 */
export default function Home() {
  return (
    <>
      <OverviewView />
      <AnnouncementCard embedded />
    </>
  );
}
