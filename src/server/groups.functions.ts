import { createServerFn } from "@tanstack/react-start";

import {
  createGroupInput,
  groupIdInput,
  renameGroupInput,
  resetGroupPasswordInput,
} from "./groups";
import {
  createGroup,
  deleteGroup,
  listGroups,
  renameGroup,
  resetGroupPassword,
} from "./groups.server";
import { requireViewer } from "./session.server";

// Group management, for admins only. Each function checks the session itself:
// server functions are endpoints anyone can call.

export const listGroupsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    await requireViewer("admin");
    return listGroups();
  },
);

export const createGroupFn = createServerFn({ method: "POST" })
  .validator(createGroupInput)
  .handler(async ({ data }) => {
    await requireViewer("admin");
    return createGroup(data);
  });

export const renameGroupFn = createServerFn({ method: "POST" })
  .validator(renameGroupInput)
  .handler(async ({ data }) => {
    await requireViewer("admin");
    await renameGroup(data.userId, data.name);
  });

export const resetGroupPasswordFn = createServerFn({ method: "POST" })
  .validator(resetGroupPasswordInput)
  .handler(async ({ data }) => {
    await requireViewer("admin");
    return resetGroupPassword(data.userId, data.password);
  });

export const deleteGroupFn = createServerFn({ method: "POST" })
  .validator(groupIdInput)
  .handler(async ({ data }) => {
    await requireViewer("admin");
    await deleteGroup(data.userId);
  });
