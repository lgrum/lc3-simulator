import {
  HighlightStyle,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import type { StreamParser } from "@codemirror/language";
import { tags } from "@lezer/highlight";

import { isOpcode, isTrapRoutine, parseRegister } from "@/lib/assembler/lexer";

/** Which words are instructions. Supplied by the assembler for an ISA. */
export type AsmVocabulary = {
  isInstruction: (word: string) => boolean;
  isRegister: (word: string) => boolean;
};

export const LC3_VOCABULARY: AsmVocabulary = {
  isInstruction: (word) => isOpcode(word) || isTrapRoutine(word),
  isRegister: (word) => parseRegister(word) !== null,
};

const NUMBER = /^(#-?\d+|[xX][0-9a-fA-F]+|-?\d+)(?![\w])/;
const IDENTIFIER = /^[A-Za-z_][\w]*/;

/** Token names map onto @lezer/highlight tags through StreamLanguage. */
function asmParser(vocabulary: AsmVocabulary): StreamParser<null> {
  return {
    name: "lc3-asm",
    startState: () => null,
    token(stream) {
      if (stream.eatSpace()) return null;
      if (stream.peek() === ";") {
        stream.skipToEnd();
        return "comment";
      }
      if (stream.peek() === '"') {
        stream.next();
        while (!stream.eol() && stream.next() !== '"');
        return "string";
      }
      if (stream.match(/^\.[A-Za-z]+/)) return "meta";
      if (stream.match(NUMBER)) return "number";
      const atLineStart = stream.sol();
      const word = stream.match(IDENTIFIER);
      if (Array.isArray(word)) {
        const [text] = word;
        if (vocabulary.isRegister(text)) return "atom";
        if (vocabulary.isInstruction(text)) return "keyword";
        if (atLineStart) {
          stream.eat(":");
          return "labelName";
        }
        return "variableName";
      }
      stream.next();
      return null;
    },
    languageData: { commentTokens: { line: ";" } },
  };
}

const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--syntax-opcode)" },
  { tag: tags.atom, color: "var(--syntax-register)" },
  { tag: tags.meta, color: "var(--syntax-directive)" },
  { tag: tags.number, color: "var(--syntax-number)" },
  { tag: tags.string, color: "var(--syntax-string)" },
  { tag: tags.comment, color: "var(--syntax-comment)", fontStyle: "italic" },
  { tag: tags.labelName, color: "var(--syntax-label)", fontWeight: "500" },
]);

export function asmLanguage(vocabulary: AsmVocabulary = LC3_VOCABULARY) {
  return [
    StreamLanguage.define(asmParser(vocabulary)),
    syntaxHighlighting(highlightStyle),
  ];
}
