import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { SoPointsEditor } from "@/components/SoPointsEditor";

export const metadata: Metadata = {
  title: "SoPoints Card Studio — SoDEX Tracker",
  description: "Design and export a share-ready SoPoints achievement card — pick a Bronze, Silver, Gold, or Diamond tier, edit every label, and use a custom colour or your own background image.",
};

export default function SoPoints() {
  return (
    <main>
      <Navbar />
      <SoPointsEditor />
    </main>
  );
}
