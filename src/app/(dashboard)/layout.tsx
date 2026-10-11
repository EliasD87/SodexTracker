import { Suspense } from "react";
import { AnalyticsShell } from "@/components/analytics/AnalyticsShell";

/**
 * Overview (the home page) and every analytics tab share this layout, so the
 * navbar, header and tabs stay mounted while only the view below changes.
 * The shell reads ?w= from the URL, which needs a Suspense boundary.
 */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <AnalyticsShell>{children}</AnalyticsShell>
    </Suspense>
  );
}
