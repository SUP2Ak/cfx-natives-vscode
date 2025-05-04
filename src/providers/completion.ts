import * as fs from "fs";
import * as path from "path";
import {
  CompletionItem,
  CompletionItemKind,
  CompletionItemProvider,
  DecorationRangeBehavior,
  Hover,
  HoverProvider,
  MarkdownString,
  ParameterInformation,
  Position,
  Range,
  SignatureHelp,
  SignatureHelpProvider,
  SignatureInformation,
  SnippetString,
  TextDocument,
  TextEditorDecorationType,
  ThemeColor,
  window,
  workspace,
  FileSystemWatcher,
} from "vscode";
import { NativeParser, ResourceManager } from "../parser";
import { loadNatives } from "../utils/natives";
import { normalizeLang } from "../enum";
import { Arguments, Lang, Native } from "../types";

export class NativeCompletionProvider
  implements CompletionItemProvider, SignatureHelpProvider, HoverProvider {
  private lastSignatureHelp?: SignatureHelp;
  private parameterDecoration?: TextEditorDecorationType;
  private currentParameterTimeout?: NodeJS.Timeout;
  private fileWatcher: FileSystemWatcher;
  private manifestWatcher: FileSystemWatcher;

  constructor() {
    this.parameterDecoration = window.createTextEditorDecorationType({
      before: {
        margin: "1em 0 0 0",
        color: new ThemeColor("editorCodeLens.foreground"),
      },
      isWholeLine: true,
      rangeBehavior: DecorationRangeBehavior.ClosedOpen,
    });

    this.manifestWatcher = workspace.createFileSystemWatcher("**/{fxmanifest.lua,__resource.lua}");    
    this.fileWatcher = workspace.createFileSystemWatcher("**/*.{lua,js,ts}", true, false, true);
    
    this.manifestWatcher.onDidChange(async (uri) => {
      await ResourceManager.reScanResource(uri.fsPath);
    });

    this.manifestWatcher.onDidCreate(async (uri) => {
      await ResourceManager.reScanResource(uri.fsPath);
    });

    this.manifestWatcher.onDidDelete(async (uri) => {
      const resourcePath = path.dirname(uri.fsPath);
      ResourceManager.clearResourceCache(resourcePath);
    });

    this.fileWatcher.onDidCreate(async (uri) => {
      const filePath = uri.fsPath;
      if (filePath.endsWith('fxmanifest.lua') || filePath.endsWith('__resource.lua')) {
        return;
      }

      const resourcePath = ResourceManager.getResourcePathFromFile(filePath);
      if (resourcePath) {
        const manifestPath = path.join(resourcePath, 'fxmanifest.lua');
        if (fs.existsSync(manifestPath)) {
          await ResourceManager.reScanResource(manifestPath);
        }
      }
    });

    this.fileWatcher.onDidDelete(async (uri) => {
      const filePath = uri.fsPath;
      if (filePath.endsWith('fxmanifest.lua') || filePath.endsWith('__resource.lua')) {
        return;
      }

      const resourcePath = ResourceManager.getResourcePathFromFile(filePath);
      if (resourcePath) {
        const manifestPath = path.join(resourcePath, 'fxmanifest.lua');
        if (fs.existsSync(manifestPath)) {
          await ResourceManager.reScanResource(manifestPath);
        }
      }
    });
  }

  private parseDescription(description: string): MarkdownString {
    const md = new MarkdownString();
    const multipleBackticksRegex = /```(?:(\w+)\n)?([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;

    while ((match = multipleBackticksRegex.exec(description)) !== null) {
      if (match.index > lastIndex) {
        md.appendText(
          description.substring(lastIndex, match.index).trim() + "\n\n",
        );
      }

      const [_, language, code] = match;
      md.appendCodeblock(code.trim(), language || "");
      md.appendText("\n");

      lastIndex = match.index + match[0].length;
    }

    const remainingText = description.substring(lastIndex);
    const singleBackticksRegex = /`([^`]+)`/g;
    lastIndex = 0;

    while ((match = singleBackticksRegex.exec(remainingText)) !== null) {
      if (match.index > lastIndex) {
        md.appendText(remainingText.substring(lastIndex, match.index));
      }

      md.appendCodeblock(match[1].trim(), "");
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < remainingText.length) {
      md.appendText(remainingText.substring(lastIndex));
    }

    return md;
  }

  private getExampleForLanguage(
    examples: Array<{ lang: string; code: string }>,
    documentLang: string,
  ): string | undefined {
    const normalizedDocLang = normalizeLang(documentLang);

    return examples.find((example) => {
      const exampleLangs = normalizeLang(example.lang);
      return exampleLangs.some((lang) => normalizedDocLang.includes(lang));
    })?.code;
  }

  async provideCompletionItems(
    document: TextDocument,
    position: Position,
  ): Promise<CompletionItem[] | undefined> {
    const filePath = document.uri.fsPath;
    
    if (filePath.endsWith('fxmanifest.lua') || filePath.endsWith('__resource.lua')) {
      return undefined;
    }

    const scriptType = ResourceManager.getScriptType(filePath);
    
    if (scriptType === "undefined") {
      const resourcePath = ResourceManager.getResourcePathFromFile(filePath);
      if (resourcePath) {
        const manifestPath = path.join(resourcePath, 'fxmanifest.lua');
        if (fs.existsSync(manifestPath)) {
          await ResourceManager.reScanResource(manifestPath);
        }
      }
    }

    try {
      if (this.isInsideFunction(document, position)) {
        return undefined;
      }

      const games = ResourceManager.getGameSupport(filePath);
      let availableNatives: Native[] = [];

      for (const game of games) {
        const natives = await loadNatives(game as "gta5" | "rdr3");

        switch (scriptType) {
          case "client":
            availableNatives.push(...natives.client, ...natives.shared);
            break;
          case "server":
            availableNatives.push(...natives.server, ...natives.shared);
            break;
          case "shared":
            availableNatives.push(
              ...natives.client,
              ...natives.server,
              ...natives.shared,
            );
            break;
          default:
            availableNatives.push(
              ...natives.client,
              ...natives.server,
              ...natives.shared,
            );
        }
      }

      availableNatives = Array.from(new Set(availableNatives));
      const workspaceRoot = workspace.getWorkspaceFolder(document.uri)?.uri;
      if (!workspaceRoot) {
        return [];
      }

      const linePrefix = document.lineAt(position).text.substring(0, position.character);
      const words = linePrefix.trim().split(/\s+/);
      const searchText = words[words.length - 1].toUpperCase();
      const config = workspace.getConfiguration("cfx-natives");
      const insertParentheses = config.get("insertParentheses", false);

      return availableNatives
        .filter((native) => {
          const nativeName = native.name.toUpperCase();
          const nativeWords = nativeName.split("_");
          if (words.length === 1) {
            return nativeName.startsWith(searchText);
          }
          return nativeWords.some((word) => word.startsWith(searchText));
        })
        .sort((a, b) => {
          const aName = a.name.toUpperCase();
          const bName = b.name.toUpperCase();
          const aScore = this.getMatchScore(aName, searchText);
          const bScore = this.getMatchScore(bName, searchText);
          return bScore - aScore;
        })
        .map((native) => {
          const item = new CompletionItem(native.name, CompletionItemKind.Function);
          item.detail = "function";
          
          const md = new MarkdownString();
          const signature = NativeParser.parseNativeSignature(native, document.languageId as Lang);
          md.appendCodeblock(signature, document.languageId);
          md.appendMarkdown(
            `\`\`${native.namespace}\`\` | \`\`${native.apiset}\`\` ${
              native.is_rpc ? "| \`\`RPC\`\`" : ""
            } | \`\`${native.game_support}\`\` \n\n [Native Documentation](${native.docs_url}) \n\n ${
              native.description ? this.parseDescription(native.description).value : ""
            }`
          );

          if (native.examples && native.examples.length > 0) {
            const example = this.getExampleForLanguage(native.examples, document.languageId);
            if (example) {
              md.appendText("\n\nExamples:\n\n");
              md.appendCodeblock(example, document.languageId);
            }
          }

          item.documentation = md;

          if (insertParentheses) {
            const params = native.params.map((param, index) => {
              if (document.languageId === 'csharp') {
                const type = NativeParser.parseType(param.type, document.languageId as Lang, true);
                return `\${${index + 1}:${type} ${param.name}}`;
              }
              return `\${${index + 1}:${param.name}}`;
            });
            item.insertText = new SnippetString(`${native.name}(${params.join(", ")})`);
          } else {
            item.insertText = native.name;
          }

          return item;
        });
    } catch (error) {
      console.error("Error in completion provider:", error);
      return [];
    }
  }

  private getMatchScore(nativeName: string, searchText: string): number {
    let score = 0;
    const words = nativeName.split("_");

    for (const word of words) {
      if (word.startsWith(searchText)) {
        score += 100;
      }
    }

    let consecutiveMatches = 0;
    let lastMatchIndex = -1;
    for (let i = 0; i < searchText.length; i++) {
      const char = searchText[i];
      const index = nativeName.indexOf(char, lastMatchIndex + 1);

      if (index > -1) {
        if (index === lastMatchIndex + 1) {
          consecutiveMatches++;
          score += consecutiveMatches * 10;
        } else {
          consecutiveMatches = 0;
          score += 1;
        }
        lastMatchIndex = index;
      }
    }

    return score;
  }

  async provideSignatureHelp(
    document: TextDocument,
    position: Position,
    //token: CancellationToken,
    //context: SignatureHelpContext,
  ): Promise<SignatureHelp | undefined> {
    try {
      const line = document.lineAt(position.line).text;
      const functionMatch = line.substring(0, position.character).match(
        /([A-Z_]+)\s*\(([^()]*)$/,
      );
      if (!functionMatch) {
        return undefined;
      }

      const [_, functionName, args = ""] = functionMatch;
      const currentParameter = args.split(",").length - 1;

      const natives = await loadNatives("gta5");
      const allNatives = [
        ...natives.client,
        ...natives.server,
        ...natives.shared,
      ];

      const native = allNatives.find((n) => n.name === functionName);
      if (!native) {
        return undefined;
      }

      const signatureHelp = new SignatureHelp();
      const paramsString = native.params.map(
        (param: Arguments, index: number) => {
          const type = NativeParser.parseType(param.type, document.languageId as Lang, true);
          if (index === currentParameter) {
            return `${param.name}: ${type}`;
          }
          return `${param.name}: ${type}`;
        },
      ).join(", ");

      const returnType = NativeParser.parseType(native.return_type, document.languageId as Lang, false);
      const signature = new SignatureInformation(
        `${native.name}(${paramsString}) -> ${returnType}`,
      );

      signatureHelp.signatures = [signature];
      signatureHelp.activeSignature = 0;
      signatureHelp.activeParameter = currentParameter;
      (signatureHelp as any).preferredAbove = true;

      if (this.currentParameterTimeout) {
        clearTimeout(this.currentParameterTimeout);
      }

      // const editor = window.activeTextEditor;
      // if (editor && native.params[currentParameter]) {
      //   const param = native.params[currentParameter];
      //   const type = NativeParser.parseType(param.type, document.languageId as Lang, true);
      //   const decorationText = `current: ${param.name} (${type})`;

      //   editor.setDecorations(this.parameterDecoration!, [{
      //     range: new Range(
      //       position.line,
      //       0,
      //       position.line,
      //       0,
      //     ),
      //     renderOptions: {
      //       before: {
      //         contentText: decorationText,
      //       },
      //     },
      //   }]);

      //   this.currentParameterTimeout = setTimeout(() => {
      //     editor.setDecorations(this.parameterDecoration!, []);
      //   }, 3000);
      // }

      signature.parameters = native.params.map((param: Arguments) => {
        return new ParameterInformation(param.name);
      });

      return signatureHelp;
    } catch (error) {
      console.error("Error in signature help provider:", error);
      return undefined;
    }
  }

  retriggerSignatureHelp() {
    if (this.lastSignatureHelp) {
      return this.lastSignatureHelp;
    }
    return undefined;
  }

  async provideHover(
    document: TextDocument,
    position: Position,
  ): Promise<Hover | undefined> {
    try {
      const range = document.getWordRangeAtPosition(position, /[A-Z_]+/);
      if (!range) {
        return undefined;
      }

      const word = document.getText(range);

      const natives = await loadNatives("gta5");
      const allNatives = [
        ...natives.client,
        ...natives.server,
        ...natives.shared,
      ];

      const native = allNatives.find((n) => n.name === word);
      if (!native) {
        return undefined;
      }

      const md = new MarkdownString();
      md.appendText("\n\nfunction\n\n");
      const signature = NativeParser.parseNativeSignature(
        native,
        document.languageId as Lang,
      );
      md.appendCodeblock(signature, document.languageId);
      md.appendMarkdown(
        `\n\n [Native Documentation](${native.docs_url}) \n\n\`\` ${native.namespace} \`\` | \`\`${native.apiset}\`\` ${
          native.is_rpc ? "| \`\`RPC\`\`" : ""
        } | \`\`${native.game_support}\`\` \n\n ${
          native.description
            ? this.parseDescription(native.description).value
            : ""
        }`,
      );

      if (native.examples && native.examples.length > 0) {
        const example = this.getExampleForLanguage(
          native.examples,
          document.languageId,
        );
        if (example) {
          md.appendText("\n\nExamples:\n\n");
          md.appendCodeblock(example, document.languageId);
        }
      }

      return new Hover(md, range);
    } catch (error) {
      console.error("Error in hover provider:", error);
      return undefined;
    }
  }

  private isInsideFunction(
    document: TextDocument,
    position: Position,
  ): boolean {
    const text = document.getText(
      new Range(0, 0, position.line + 1, position.character),
    );
    return /[A-Z_]+\s*\([^)]*$/s.test(text);
  }

  dispose() {
    if (this.parameterDecoration) {
      this.parameterDecoration.dispose();
    }
    if (this.currentParameterTimeout) {
      clearTimeout(this.currentParameterTimeout);
    }
    this.fileWatcher.dispose();
    this.manifestWatcher.dispose();
  }
}
