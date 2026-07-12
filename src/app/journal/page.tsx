import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { JournalPage } from "@/components/JournalPage";

export const metadata: Metadata = {
  title: "Journal — SoDEX Tracker",
  description: "Log and annotate your daily trades with notes, moods, and tags.",
};

export default function Journal() {
  return (
    <main>
      <Navbar />
      <JournalPage />
    </main>
  );
}
