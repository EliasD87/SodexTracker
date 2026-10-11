import { redirect } from "next/navigation";

/** Overview moved to the home page (Markets); keep old links and the window working. */
export default async function Page({ searchParams }: { searchParams: Promise<{ w?: string }> }) {
  const { w } = await searchParams;
  redirect(w ? `/?w=${encodeURIComponent(w)}` : "/");
}
