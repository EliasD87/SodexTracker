"use client";

import dynamic from "next/dynamic";
import { Deferred, OverviewView } from "@/components/analytics/OverviewView";

const AnnouncementCard = dynamic(() => import("@/components/AnnouncementCard").then((m) => m.AnnouncementCard), { ssr: false });

/**
 * The home page: Overview, the first tab of the dashboard. The shared layout
 * draws the header and tabs; SoDEX's latest announcement closes the page,
 * loaded (with its banner image) only once it nears the screen.
 */
export default function Home() {
  return (
    <>
      <OverviewView />
      <Deferred span="mt-3 sm:mt-4" height={240}>
        <AnnouncementCard embedded />
      </Deferred>
    </>
  );
}
