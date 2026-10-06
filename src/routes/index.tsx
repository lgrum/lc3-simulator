import { createFileRoute, useHydrated } from "@tanstack/react-router";
import { Suspense } from "react";

import { Workbench } from "@/workbench/workbench";

export const Route = createFileRoute("/")({ component: WorkbenchPage });

/**
 * The prerendered SPA shell holds an empty Suspense boundary where this route
 * renders. When the route chunk is already loaded at hydration time, the
 * client would render the workbench there and hydration would fail, so
 * render the same empty boundary until hydration is done.
 */
function WorkbenchPage() {
  const hydrated = useHydrated();
  return <Suspense>{hydrated ? <Workbench /> : null}</Suspense>;
}
