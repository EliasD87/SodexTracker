import type { Metadata } from "next";
import { Navbar } from "@/components/Navbar";
import { AccountPage } from "@/components/AccountPage";

export const metadata: Metadata = {
  title: "Account — SoDEX Tracker",
  description: "Manage your SoDEX Tracker account and synced watchlist.",
};

export const dynamic = "force-dynamic";

export default function Account() {
  return (
    <main>
      <Navbar />
      <AccountPage />
    </main>
  );
}
