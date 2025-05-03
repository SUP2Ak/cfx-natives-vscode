import { Lang, Native } from "../types";

const LangExtensions: Record<string, Lang[]> = {
  "lua": [Lang.LUA],
  "js": [Lang.JS, Lang.TS],
  "javascript": [Lang.JS, Lang.TS],
  "typescript": [Lang.JS, Lang.TS],
  "cs": [Lang.CSHARP],
  "csharp": [Lang.CSHARP]
};

export function normalizeLang(lang: string): Lang[] {
  return LangExtensions[lang.toLowerCase()] || [];
}

export const getLanguageSignature = (
  native: Native,
  language: Lang,
): string => {
  switch (language) {
    case Lang.LUA:
      return `function ${native.name}(${
        native.params.map((p) => `${p.name}: ${p.type}`).join(", ")
      })\n  -> ${native.return_type}`;

    case Lang.TS:
    case Lang.JS:
      return `function ${native.name}(${
        native.params.map((p) => `${p.name}: ${p.type}`).join(", ")
      }): ${native.return_type}`;

    case Lang.CSHARP:
      return `${native.return_type} ${native.name}(${
        native.params.map((p) => `${p.type} ${p.name}`).join(", ")
      })`;

    default:
      return `[function] ${native.name}(${
        native.params.map((p) => `${p.name}: ${p.type}`).join(", ")
      })\n  -> ${native.return_type}`;
  }
};
