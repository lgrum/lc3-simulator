import { CircleXIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Diagnostic, Severity } from "@/lib/assembler/types";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

import { EmptyHint } from "../debug/shared";
import { useAssembly, useWorkbench } from "../workbench-provider";

const SEVERITIES: Record<
  Severity,
  { icon: LucideIcon; label: () => string; rank: number; className: string }
> = {
  error: {
    icon: CircleXIcon,
    label: m.severity_error,
    rank: 0,
    className: "text-error",
  },
  warning: {
    icon: TriangleAlertIcon,
    label: m.severity_warning,
    rank: 1,
    className: "text-lamp",
  },
  info: {
    icon: InfoIcon,
    label: m.severity_info,
    rank: 2,
    className: "text-silk-2",
  },
};

/** Errors first, then warnings, then notes; each group in build order. */
export function sortProblems(
  diagnostics: ReadonlyArray<Diagnostic>,
): Array<Diagnostic> {
  return diagnostics
    .map((diagnostic, index) => ({ diagnostic, index }))
    .sort(
      (a, b) =>
        SEVERITIES[a.diagnostic.severity].rank -
          SEVERITIES[b.diagnostic.severity].rank || a.index - b.index,
    )
    .map(({ diagnostic }) => diagnostic);
}

function Where({ file, line }: { file: string | null; line?: number }) {
  if (file === null)
    return <span className="text-silk-2">{m.problem_whole_program()}</span>;
  return (
    <span className="font-mono text-silk-hi">
      {line === undefined ? file : m.location_file_line({ file, line })}
    </span>
  );
}

/** Every diagnostic of the last assemble; clicking one opens its line. */
export function ProblemsView() {
  const { tabs } = useWorkbench();
  const { diagnostics } = useAssembly();
  if (diagnostics.length === 0)
    return <EmptyHint>{m.problems_empty()}</EmptyHint>;

  return (
    <ul aria-label={m.problems()} className="h-full overflow-y-auto">
      {sortProblems(diagnostics).map((diagnostic, i) => {
        const {
          icon: Icon,
          label,
          className,
        } = SEVERITIES[diagnostic.severity];
        const { file } = diagnostic;
        const line = diagnostic.position?.line;
        const body = (
          <>
            <Icon
              aria-hidden
              className={cn("mt-0.5 size-3.5 flex-none", className)}
            />
            <span className="sr-only">{label()}</span>
            <span className="min-w-0 flex-1">{diagnostic.text}</span>
            <Where file={file} line={line} />
          </>
        );
        const rowClass =
          "flex w-full items-start gap-2.5 border-t border-screen-line px-4 py-1.5 text-left text-xs text-silk first:border-t-0";
        return (
          <li key={i}>
            {file === null ? (
              <div className={rowClass}>{body}</div>
            ) : (
              <button
                type="button"
                onClick={() => tabs.reveal(file, line ?? 1)}
                className={cn(
                  rowClass,
                  "outline-none hover:bg-tint/5 focus-visible:ring-2 focus-visible:ring-phosphor/70 focus-visible:ring-inset",
                )}
              >
                {body}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
