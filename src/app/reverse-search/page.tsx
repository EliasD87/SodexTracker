import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { ReverseSearchPage } from "@/components/ReverseSearchPage";

export const metadata: Metadata = {
  title: "Reverse Search — SoDEX Tracker",
  description: "Find wallet addresses by their first or last characters.",
};

export default function ReverseSearch() {
  return (
    <main>
      <Navbar />
      <ReverseSearchPage />
    </main>
  );
}
