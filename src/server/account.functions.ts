import { createServerFn } from "@tanstack/react-start";

import { getViewer } from "./session.server";

/** Who is logged in, or null. */
export const getViewerFn = createServerFn({ method: "GET" }).handler(() =>
  getViewer(),
);
