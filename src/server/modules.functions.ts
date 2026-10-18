import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { findGroup } from "./groups.server";
import { fetchBuildInput, publishInput } from "./modules";
import {
  fetchBuildModules,
  getVersionSource,
  listModulesOf,
  listVersions,
  publishModule,
} from "./modules.server";
import { requireViewer } from "./session.server";

// Published modules. Each function checks the session itself: server
// functions are endpoints anyone can call.

/** The viewer's own modules with their latest version numbers. */
export const listMyModulesFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const viewer = await requireViewer();
    return listModulesOf(viewer.userId);
  },
);

/** The latest source of each module an admin's build needs. */
export const fetchBuildModulesFn = createServerFn({ method: "POST" })
  .validator(fetchBuildInput)
  .handler(async ({ data }) => {
    const viewer = await requireViewer("admin");
    return fetchBuildModules(viewer, data.names);
  });

/** A group's modules, for admins. Other admins' modules never show. */
export const listGroupModulesFn = createServerFn({ method: "GET" })
  .validator(z.object({ userId: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireViewer("admin");
    const group = await findGroup(data.userId);
    return listModulesOf(group.userId);
  });

/** A module's versions: the owner's, or a group's for admins. */
export const listVersionsFn = createServerFn({ method: "GET" })
  .validator(z.object({ moduleId: z.number().int() }))
  .handler(async ({ data }) => {
    const viewer = await requireViewer();
    return listVersions(viewer, data.moduleId);
  });

/** One version's source: the owner's, or a group's for admins. */
export const getVersionSourceFn = createServerFn({ method: "GET" })
  .validator(z.object({ versionId: z.number().int() }))
  .handler(async ({ data }) => {
    const viewer = await requireViewer();
    return getVersionSource(viewer, data.versionId);
  });

/** Validates a module and stores it as a new version of the viewer's own. */
export const publishModuleFn = createServerFn({ method: "POST" })
  .validator(publishInput)
  .handler(async ({ data }) => {
    const viewer = await requireViewer();
    return publishModule(viewer, data.name, data.source);
  });
