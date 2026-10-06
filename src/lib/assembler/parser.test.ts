import { describe, expect, it } from "vite-plus/test";

import { Lexer } from "./lexer";
import { parse, ParserError } from "./parser";

function parseSource(source: string) {
  return parse(Lexer.tokenize(source));
}

describe("assembler parser", () => {
  it("parses labels, directives, strings, and signed numbers", () => {
    expect(
      parseSource(
        '.orig x3000\nVALUE .fill xFFFF\nCOUNT: .blkw #3\nTEXT .stringz "Hi"\n.end\n',
      ),
    ).toEqual({
      statements: [
        {
          line: 1,
          label: null,
          kind: {
            type: "directive",
            directive: {
              type: "orig",
              operand: { type: "immediate", value: 0x3000 },
            },
          },
        },
        {
          line: 2,
          label: "VALUE",
          kind: {
            type: "directive",
            directive: {
              type: "fill",
              operand: { type: "immediate", value: -1 },
            },
          },
        },
        {
          line: 3,
          label: "COUNT",
          kind: {
            type: "directive",
            directive: {
              type: "blkw",
              operand: { type: "immediate", value: 3 },
            },
          },
        },
        {
          line: 4,
          label: "TEXT",
          kind: {
            type: "directive",
            directive: { type: "stringz", value: "Hi" },
          },
        },
        {
          line: 5,
          label: null,
          kind: { type: "directive", directive: { type: "end" } },
        },
      ],
    });
  });

  it("parses the instruction variants", () => {
    const instructions = [
      "ADD R0, R1, R2",
      "AND R3, R4, #-5",
      "BR TARGET",
      "BRN TARGET",
      "BRZ TARGET",
      "BRP TARGET",
      "BRNZ TARGET",
      "BRZP TARGET",
      "BRNP TARGET",
      "BRNZP TARGET",
      "JMP R0",
      "JSR TARGET",
      "JSRR R7",
      "LD R0, TARGET",
      "LDI R1, TARGET",
      "LDR R2, R3, #4",
      "LEA R4, TARGET",
      "NOT R5, R6",
      "RET",
      "RTI",
      "ST R0, TARGET",
      "STI R1, TARGET",
      "STR R2, R3, #-1",
      "TRAP x25",
      "HALT",
    ];
    const statements = parseSource(`${instructions.join("\n")}\n`).statements;
    expect(statements).toHaveLength(instructions.length);
    expect(statements.map((statement) => statement.kind.type)).toEqual(
      instructions.map(() => "instruction"),
    );
    expect(
      statements.map((statement) =>
        statement.kind.type === "instruction"
          ? statement.kind.instruction.type
          : null,
      ),
    ).toEqual([
      "add",
      "and",
      "br",
      "br",
      "br",
      "br",
      "br",
      "br",
      "br",
      "br",
      "jmp",
      "jsr",
      "jsrr",
      "ld",
      "ldi",
      "ldr",
      "lea",
      "not",
      "ret",
      "rti",
      "st",
      "sti",
      "str",
      "trap",
      "trap",
    ]);
    expect(statements[0]?.kind).toEqual({
      type: "instruction",
      instruction: {
        type: "add",
        dr: 0,
        sr1: 1,
        sr2_or_imm5: { type: "register", register: 2 },
      },
    });
    expect(statements[1]?.kind).toEqual({
      type: "instruction",
      instruction: {
        type: "and",
        dr: 3,
        sr1: 4,
        sr2_or_imm5: { type: "immediate", value: -5 },
      },
    });
    expect(
      statements
        .slice(2, 10)
        .map((statement) =>
          statement.kind.type === "instruction"
            ? statement.kind.instruction
            : null,
        ),
    ).toEqual(
      [
        [true, true, true],
        [true, false, false],
        [false, true, false],
        [false, false, true],
        [true, true, false],
        [false, true, true],
        [true, false, true],
        [true, true, true],
      ].map(([n, z, p]) => ({
        type: "br",
        n,
        z,
        p,
        pc_offset_9: { type: "label", label: "TARGET" },
      })),
    );
    expect(statements.at(-1)?.kind).toEqual({
      type: "instruction",
      instruction: {
        type: "trap",
        trapvect_8: { type: "immediate", value: 0x25 },
      },
    });
  });

  it("reserves trap names for trap routines", () => {
    expect(() => parseSource("HALT ADD R0, R0, #1\n")).toThrow(
      "All statements must end with a new line character",
    );
    expect(() => parseSource("BR HALT\n")).toThrow("Expected 'pc_offset_9'");
    expect(() => parseSource("HALT: .FILL #1\n")).toThrow(
      "All statements must end with a new line character",
    );
    expect(parseSource("HALT\n").statements[0]?.kind).toEqual({
      type: "instruction",
      instruction: {
        type: "trap",
        trapvect_8: { type: "immediate", value: 0x25 },
      },
    });
  });

  it("reports missing newlines and invalid operands", () => {
    expect(() => parseSource("RET")).toThrow(ParserError);
    expect(() => parseSource("ADD R0, R1, R8\n")).toThrow(
      "Expected register or immediate",
    );
    expect(() => parseSource(".FILL #32768\n")).toThrow(
      "Invalid 16-bit number",
    );
    expect(() => parseSource(".STRINGZ #2\n")).toThrow(
      "Expected string literal",
    );
  });

  it("emits EOF after comments and rejects a sign without digits", () => {
    expect(Lexer.tokenize("RET\n; trailing comment").at(-1)?.type).toBe("eof");
    expect(() => Lexer.tokenize(".FILL #-\n")).toThrow(
      "Invalid decimal literal",
    );
  });
});
