import {
  commands,
  ExtensionContext,
  languages,
  workspace,
  Uri,
} from "vscode";
import { listNatives, toggleAutoArgs } from "./commands";
import { NativeCompletionProvider } from "./providers/completion";
import { StorageManager } from './utils';
import ResourceManager from "./parser/manifest";
import setPlugin from './plugin/setPlugin';
import moveFile from './plugin/moveFile';

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
    commands.registerCommand('cfxNatives.listNatives', listNatives)
  );

  // Configurer et activer le plugin Lua
  try {
    const sourceUri = Uri.joinPath(context.extensionUri, 'plugin');
    const storageUri = context.globalStorageUri;
    
    console.log('Source URI:', sourceUri.fsPath);
    console.log('Storage URI:', storageUri.fsPath);
    
    // Copier le plugin.lua vers le dossier de stockage
    await moveFile('plugin.lua', sourceUri, storageUri);
    
    // Activer le plugin en passant le contexte
    await setPlugin(true, context);

    console.log('Plugin Lua activé avec succès');
  } catch (error) {
    console.error('Erreur lors de l\'activation du plugin Lua:', error);
  }
}

export function deactivate() {
  ResourceManager.clearAllCaches();
  console.log('🛑 Extension "cfx-natives-vscode" is now deactivated!');

  // Désactiver le plugin lors de la désactivation de l'extension
  setPlugin(false, null).catch((error: any) => {
    console.error('Erreur lors de la désactivation du plugin Lua:', error);
  });
}