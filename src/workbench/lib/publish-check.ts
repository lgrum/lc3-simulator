import { assembleModule } from "@/lib/assembler/assemble-source";
import type { Viewer } from "@/server/access";
import { checkStored } from "@/server/modules";
import type { PublishProblem } from "@/server/modules";

/**
 * Checks a module before it is published: what the server checks (its name
 * and size), then its assembly, and for admins whether every import names a
 * published module they can see. `published` answers which of the given
 * names exist, in one request.
 *
 * It runs in the browser: the Worker has 10 ms of CPU per request, too little
 * to assemble a long source. A group's imports are checked when an admin
 * builds.
 */
export async function checkModule(
  viewer: Viewer,
  name: string,
  source: string,
  published: (names: Array<string>) => Promise<Array<string>>,
): Promise<PublishProblem | null> {
  const stored = checkStored(viewer, name, source);
  if (stored) return stored;
  const assembled = assembleModule(source, {
    file: `${name}.asm`,
    entry: false,
  });
  if (!assembled.ok)
    return {
      kind: "assembly",
      line: assembled.error.position?.line ?? null,
      text: assembled.error.text,
    };
  if (viewer.kind === "group") return null;
  const externals = [...assembled.module.externals.values()];
  if (externals.length === 0) return null;
  const found = new Set(
    (await published(externals.map((external) => external.module))).map(
      (module) => module.toLowerCase(),
    ),
  );
  const missing = externals.find(
    (external) => !found.has(external.module.toLowerCase()),
  );
  return missing
    ? { kind: "import", module: missing.module, line: missing.line }
    : null;
}
