import { createFileRoute } from "@tanstack/react-router";

import { Workbench } from "@/workbench/workbench";

export const Route = createFileRoute("/")({ component: Workbench });
