import {
  HeadContent,
  Navigate,
  ScriptOnce,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

import { themeScript } from "@/lib/theme";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "LC-3 Simulator",
      },
      {
        name: "theme-color",
        content: "#2a2c2e",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg",
      },
    ],
  }),
  shellComponent: RootDocument,
  // The workbench is the only page; send any other path there.
  notFoundComponent: () => <Navigate to="/" replace />,
});

// Prerendered once at build time as the SPA shell: keep it free of
// browser-only APIs.
function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    // The theme script sets the theme class on <html> before React loads.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* After HeadContent, so the theme-color meta tag exists. */}
        <ScriptOnce>{themeScript}</ScriptOnce>
      </head>
      <body>
        {children}
        <TanStackDevtools
          config={{
            position: "bottom-right",
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  );
}
