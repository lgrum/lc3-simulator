import { createFileRoute, redirect, useHydrated } from "@tanstack/react-router";
import { Suspense } from "react";

import { AdminPage } from "@/admin/admin-page";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getViewerFn } from "@/server/account.functions";
import { listGroupsFn } from "@/server/groups.functions";

// Only for admins. The server functions check the session themselves; this
// only keeps groups and anonymous users off the page.
export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    const viewer = await getViewerFn().catch(() => null);
    if (viewer?.kind !== "admin") throw redirect({ to: "/", replace: true });
    return { viewer };
  },
  loader: () => listGroupsFn(),
  component: AdminRoute,
});

function AdminRoute() {
  const { viewer } = Route.useRouteContext();
  const groups = Route.useLoaderData();
  // As on the workbench route: match the prerendered shell until hydration.
  const hydrated = useHydrated();
  return (
    <Suspense>
      {hydrated ? (
        <TooltipProvider delay={400}>
          <AdminPage viewer={viewer} groups={groups} />
        </TooltipProvider>
      ) : null}
    </Suspense>
  );
}
