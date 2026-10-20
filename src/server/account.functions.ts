import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getViewer, signIn, signOut } from "./session.server";

/** Who is logged in, or null. */
export const getViewerFn = createServerFn({ method: "GET" }).handler(() =>
  getViewer(),
);

/** Logs in; returns why it failed, or null. */
export const signInFn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      username: z.string().max(64),
      password: z.string().max(128),
    }),
  )
  .handler(({ data }) => signIn(data.username, data.password));

export const signOutFn = createServerFn({ method: "POST" }).handler(() =>
  signOut(),
);
