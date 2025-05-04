import {
  commands,
  ExtensionContext,
  languages,
  workspace,
} from "vscode";
import { listNatives, toggleAutoArgs } from "./commands";
import { NativeCompletionProvider } from "./providers/completion";
import ResourceManager from "./parser/manifest";
import { StorageManager } from './utils';

export async function activate(context: ExtensionContext) {
  const storage = StorageManager.getInstance(context);
  await storage.checkAndUpdateCache();
  await ResourceManager.scanWorkspace();

  console.log("🚀 Extension is activating...");
  const completionProvider = new NativeCompletionProvider();
  const supportedLanguages = ["lua", "javascript", "typescript", "csharp"];
  const triggers = [
    ...Array.from("abcdefghijklmnopqrstuvwxyz"),
    ...Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
    "N_",
    "_",
  ];
  
  console.log("📝 Registering completion provider...");
  supportedLanguages.forEach((language) => {
    context.subscriptions.push(
      languages.registerCompletionItemProvider(
        language,
        completionProvider,
        ...triggers,
      ),
    );

    context.subscriptions.push(
      languages.registerSignatureHelpProvider(
        language,
        completionProvider,
        {
          triggerCharacters: ["(", ",", " "],
          retriggerCharacters: [" ", "\t"],
        },
      ),
    );

    context.subscriptions.push(
      languages.registerHoverProvider(
        language,
        completionProvider,
      ),
    );

    context.subscriptions.push(
      languages.registerSignatureHelpProvider(
        language,
        completionProvider,
        {
          triggerCharacters: ["(", ",", " ", '"', "'"],
          retriggerCharacters: [" ", "\t", '"', "'"],
        },
      ),
    );

    console.log(`✅ Registered providers for ${language}`);
  });

  console.log('✅ Extension "cfx-natives-vscode" is now active!');
  const manifestWatcher = workspace.createFileSystemWatcher(
    "**/{fxmanifest.lua,__resource.lua}",
  );
  manifestWatcher.onDidChange(() => ResourceManager.scanWorkspace());
  manifestWatcher.onDidCreate(() => ResourceManager.scanWorkspace());
  manifestWatcher.onDidDelete(() => ResourceManager.scanWorkspace());

  const fileWatcher = workspace.createFileSystemWatcher("**/*");
  fileWatcher.onDidCreate(async (uri) => {
    console.log(`📁 File created: ${uri.fsPath}`);
    await ResourceManager.scanWorkspace();
  });

  fileWatcher.onDidDelete(async (uri) => {
    console.log(`🗑️ File deleted: ${uri.fsPath}`);
    await ResourceManager.scanWorkspace();
  });

  workspace.onDidRenameFiles(async (event) => {
    console.log(
      "📝 Files renamed:",
      event.files.map((f) => ({
        oldUri: f.oldUri.fsPath,
        newUri: f.newUri.fsPath,
      })),
    );
    await ResourceManager.scanWorkspace();
  });

  context.subscriptions.push(manifestWatcher);
  context.subscriptions.push(fileWatcher);
  context.subscriptions.push(completionProvider);
  context.subscriptions.push(toggleAutoArgs);
  context.subscriptions.push(
    commands.registerCommand('cfx-natives-vscode.listNatives', listNatives)
  );
}

export function deactivate() {
  ResourceManager.clearAllCaches();
  console.log('🛑 Extension "cfx-natives-vscode" is now deactivated!');
}