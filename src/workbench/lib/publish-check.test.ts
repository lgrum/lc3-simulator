import { describe, expect, it } from "vite-plus/test";

import type { Viewer } from "@/server/access";

import { checkModule } from "./publish-check";

const group7: Viewer = { kind: "group", userId: "g7", group: 7, name: "G7" };
const prof: Viewer = {
  kind: "admin",
  userId: "a1",
  username: "prof",
  name: "Prof",
};

const TRIG = `
        .EXTERNAL HELPERS-HALF
SIN     LD R5, PTR
        JSRR R5
        RET
PTR     .FILL HELPERS-HALF
        .END
`;

/** A server where only these modules are published. */
function publishing(...names: Array<string>) {
  const asked: Array<Array<string>> = [];
  const published = (wanted: Array<string>) => {
    asked.push(wanted);
    return Promise.resolve(
      names.filter((name) =>
        wanted.some((want) => want.toLowerCase() === name.toLowerCase()),
      ),
    );
  };
  return { asked, published };
}

describe("checkModule", () => {
  it("makes the server's checks first", async () => {
    const { published } = publishing();
    expect(await checkModule(group7, "my-trig", TRIG, published)).toEqual({
      kind: "name",
    });
  });

  it("refuses assembly errors, with the line", async () => {
    const { published } = publishing();
    expect(
      await checkModule(group7, "bad", "ADD R1, R2\n", published),
    ).toMatchObject({ kind: "assembly", line: 1 });
  });

  it("leaves a group's imports for the admin's build", async () => {
    const { asked, published } = publishing();
    expect(await checkModule(group7, "trig", TRIG, published)).toBeNull();
    expect(asked).toEqual([]);
  });

  it("refuses an admin's imports that aren't published", async () => {
    const { asked, published } = publishing();
    expect(await checkModule(prof, "main", TRIG, published)).toEqual({
      kind: "import",
      module: "HELPERS",
      line: 2,
    });
    expect(asked).toEqual([["HELPERS"]]);
  });

  it("accepts an admin's imports of published modules, ignoring case", async () => {
    const source = `
        .EXTERNAL G7_TRIG-SIN
        LD R5, PTR
        JSRR R5
        HALT
PTR     .FILL G7_TRIG-SIN
`;
    const { published } = publishing("g7_trig");
    expect(await checkModule(prof, "main", source, published)).toBeNull();
  });

  it("asks nothing when there are no imports", async () => {
    const { asked, published } = publishing();
    expect(await checkModule(prof, "calc", "RET\n", published)).toBeNull();
    expect(asked).toEqual([]);
  });
});
