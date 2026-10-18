import { render } from "@testing-library/react";
import { StrictMode } from "react";

import type { SavedProject } from "@/workbench/lib/project-store";
import { Workbench } from "@/workbench/workbench";

/**
 * Renders the whole workbench in StrictMode, as in development. A project
 * passed here is what the page would load from localStorage.
 */
export function renderWorkbench(project?: SavedProject) {
  if (project) localStorage.setItem("lc3sim.project", JSON.stringify(project));
  return render(
    <StrictMode>
      <Workbench />
    </StrictMode>,
  );
}
