import { UploadIcon } from "lucide-react";

import { moduleName } from "@/lib/assembler/linker";
import { m } from "@/paraglide/messages";
import type { PublishProblem } from "@/server/modules";

import { baseName } from "../lib/file-names";
import { useAskDialog } from "../ui/ask-dialog";
import { HintedKey } from "../ui/key";
import {
  useAccount,
  useEditorTabs,
  useProject,
  useWorkbench,
} from "../workbench-provider";

export function publishProblemText(
  file: string,
  problem: PublishProblem,
): string {
  switch (problem.kind) {
    case "name":
      return m.publish_bad_name({ file });
    case "reserved":
      return m.publish_reserved_name({ file });
    case "too-large":
      return m.publish_too_large({ file });
    case "assembly":
      return problem.line === null
        ? problem.text
        : m.publish_assembly_error({
            line: problem.line,
            message: problem.text,
          });
    case "import":
      return m.publish_missing_import({
        line: problem.line,
        module: problem.module,
      });
  }
}

/**
 * Publishes the open file as a new version of the viewer's module of the
 * same name. Only logged-in groups and admins see it.
 */
export function PublishButton() {
  const workbench = useWorkbench();
  const { viewer } = useAccount();
  const { files, entry } = useProject();
  const { chosen } = useEditorTabs();
  const { ask, dialog } = useAskDialog();
  if (!viewer) return null;

  // The open tab, or the entry file before any tab was picked; the OS and
  // other read-only files can't be published.
  const file = chosen ? chosen.file : entry;
  const text = files.get(file);

  const publish = async () => {
    if (text === undefined) return;
    const name = baseName(file);
    const module = moduleName(file);
    const yes = await ask({
      title: m.publish_confirm({ file: name, module }),
      description:
        viewer.kind === "group"
          ? m.publish_confirm_group()
          : m.publish_confirm_admin(),
      confirm: m.publish(),
    });
    if (!yes) return;
    let result;
    try {
      result = await workbench.modules.publish(module, text);
    } catch (error) {
      await ask({
        title: m.publish_failed({ file: name }),
        description: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    if (!result.ok) {
      await ask({
        title: m.publish_failed({ file: name }),
        description: publishProblemText(name, result.problem),
      });
      return;
    }
    workbench.account.notePublished();
    await ask({
      title: m.publish_done({ module: result.module, version: result.version }),
    });
  };

  return (
    <>
      <HintedKey
        hint={
          text === undefined
            ? m.publish_hint_read_only()
            : m.publish_hint({ file: baseName(file) })
        }
        disabled={text === undefined}
        onClick={() => void publish()}
      >
        <UploadIcon aria-hidden />
        {m.publish()}
      </HintedKey>
      {dialog}
    </>
  );
}
