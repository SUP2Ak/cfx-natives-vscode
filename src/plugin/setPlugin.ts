import { ExtensionContext, Uri, workspace } from "vscode";
import getLuaConfig from "./getConfigLua";
import getSettingsScope from "./getSettingsScope";
import * as path from "node:path";
import { extensions } from "vscode";
import { StorageManager } from '../utils/storage';

export const id = "sup2ak.cfx-natives-vscode";
export const extension = extensions.getExtension(id)!;

export default async function setPlugin(
  enable: boolean,
  context: ExtensionContext | null,
) {
  const config = workspace.getConfiguration();
  const settingsScope = getSettingsScope();

  if (context) {
    const pluginPath = Uri.joinPath(context.globalStorageUri, "plugin.lua").fsPath;
    const storage = StorageManager.getInstance(context);

    if (enable) {
      // Configuration du Lua Language Server
      await config.update("Lua.runtime.plugin", pluginPath, settingsScope);
      await config.update("Lua.runtime.version", "Lua 5.4", settingsScope);
      
      // Désactiver les diagnostics pour l'opérateur de navigation sécurisée et les globals non définis
      await config.update("Lua.diagnostics.disable", [
        "undefined-field",
        "undefined-global"
      ], settingsScope);
      
      // Activer le support des opérateurs non standard
      const nonstandardSymbol: string[] = config.get("Lua.runtime.nonstandardSymbol") || [];
      ["/**/", "`", "+=", "-=", "*=", "/=", "<<=", ">>=", "&=", "|=", "^=", "?.", "?["].forEach((item) => {
        if (!nonstandardSymbol.includes(item)) {
          nonstandardSymbol.push(item);
        }
      });

      await config.update("Lua.runtime.nonstandardSymbol", nonstandardSymbol, settingsScope);

      // Configuration supplémentaire pour le safe navigation
      // await config.update("Lua.runtime.special", {
      //   "?.": "function",
      //   "?[": "function"
      // }, settingsScope);

      // Configuration pour les natives
      const globals: string[] = [];
      try {
        // S'assurer que le cache est à jour
        await storage.checkAndUpdateCache();

        // Ajouter quelques natives communes par défaut
        const commonNatives = [
          //"GetEntityCoords",
          "SetEntityCoords",
          "CreateObject",
          "DeleteEntity",
          "DoesEntityExist",
          "NetworkGetEntityOwner",
          "GetPlayerPed",
          "PlayerId",
          "GetPlayerServerId",
          // Ajoutez d'autres natives communes ici
        ];

        commonNatives.forEach(native => {
          globals.push(native);
        });

        try {
          // Essayer de charger les natives depuis le storage
          const gtaNatives = await storage.getNatives('gta5');
          console.log('gtaNatives', gtaNatives);
          if (gtaNatives) {
            Object.keys(gtaNatives).forEach(nativeName => {
              console.log('nativeName', nativeName);
              globals.push(nativeName);
            });
          }
        } catch (error) {
          console.warn("Impossible de charger les natives GTA V:", error);
        }

        // Mettre à jour la configuration Lua avec les globals
        await config.update("Lua.diagnostics.globals", globals, settingsScope);
        console.log('Natives configurées avec succès');
      } catch (error) {
        console.error("Erreur lors de la configuration des natives:", error);
      }

      // Disable diagnostics for files/directories
      const ignoreDir: string[] = config.get("Lua.workspace.ignoreDir") || [];
      [".vscode", ".git", ".github", "node_modules", "\\[cfx\\]"].forEach((item) => {
        if (!ignoreDir.includes(item)) {
          ignoreDir.push(item);
        }
      });

      await config.update("Lua.workspace.ignoreDir", ignoreDir, settingsScope);
    } else {
      if (config.get("Lua.runtime.plugin") === pluginPath) {
        await config.update("Lua.runtime.plugin", undefined, settingsScope);
      }
    }
  }
}
