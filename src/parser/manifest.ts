import * as fs from "fs";
import * as path from "path";
import { RelativePattern, Uri, workspace } from "vscode";
import { FxManifest, ResourceInfo } from "../types";

/**
 * TODO:
 * - Make a better parser for manifest, with special features for csharp,
 *  like write first line of .cs a comment to know if it's a client/server or shared file,
 *  maybe comment like //@client or //@server or //@shared
 * 
 * - Clear some values useless, better reScan...
 */

export default class ResourceManager {
  private static resources: Map<string, ResourceInfo> = new Map();
  private static gameCache: Map<string, string[]> = new Map();
  private static scriptTypeCache = new Map<string, string>();

  static clearAllCaches() {
    this.resources.clear();
    this.gameCache.clear();
    this.scriptTypeCache.clear();
  }

  static async scanWorkspace() {
    this.clearAllCaches();
    const workspaceFolders = workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    for (const folder of workspaceFolders) {
      const manifestFiles = await workspace.findFiles(
        new RelativePattern(folder, "**/fxmanifest.lua"),
      );

      const resourceFiles = await workspace.findFiles(
        new RelativePattern(folder, "**/__resource.lua"),
      );

      //console.log(manifestFiles);
      const allManifests = [...manifestFiles, ...resourceFiles];

      console.log("allManifests", allManifests);
      for (const manifestUri of allManifests) {
        await this.parseResource(manifestUri);
      }
    }
  }

  private static async parseResource(manifestUri: Uri): Promise<void> {
    try {
      const manifest = await this.parseManifest(manifestUri.fsPath);
      if (!manifest) {
        console.error(`Manifest not found at ${manifestUri.fsPath}`);
        return;
      }

      const resourcePath = path.dirname(manifestUri.fsPath);
      console.log("Resource path:", resourcePath);
      const resourceInfo: ResourceInfo = {
        path: resourcePath,
        manifest: manifest || { path: manifestUri.fsPath },
        clientFiles: new Set(),
        serverFiles: new Set(),
        sharedFiles: new Set(),
      };

      // console.log(resourceInfo);
      await this.parseScriptPaths(resourceInfo);
      this.resources.set(resourcePath, resourceInfo);
    } catch (error) {
      console.error(`Error parsing resource at ${manifestUri.fsPath}:`, error);
    }
  }

  private static async parseScriptPaths(resourceInfo: ResourceInfo) {
    const { manifest, path: resourcePath } = resourceInfo;

    const parseGlob = async (patterns: string[], fileSet: Set<string>) => {
      for (const pattern of patterns) {
        const files = await workspace.findFiles(
          new RelativePattern(resourcePath, pattern),
        );
        files.forEach((file) => fileSet.add(file.fsPath));
      }
    };

    if (manifest.client_scripts) {
      await parseGlob(manifest.client_scripts, resourceInfo.clientFiles);
    }
    if (manifest.server_scripts) {
      await parseGlob(manifest.server_scripts, resourceInfo.serverFiles);
    }
    if (manifest.shared_scripts) {
      await parseGlob(manifest.shared_scripts, resourceInfo.sharedFiles);
    }
  }

  static clearResourceCache(resourcePath: string) {
    this.resources.delete(resourcePath);

    this.scriptTypeCache.forEach((_, filePath) => {
      if (filePath.startsWith(resourcePath)) {
        this.scriptTypeCache.delete(filePath);
      }
    });
  }

  static getResourcePathFromFile(filePath: string): string | undefined {
    let currentPath = filePath;
    while (currentPath !== path.dirname(currentPath)) {
      currentPath = path.dirname(currentPath);
      if (this.resources.has(currentPath)) {
        return currentPath;
      }
    }
    return undefined;
  }

  static async reScanResource(manifestPath: string) {
    try {
      const resourcePath = path.dirname(manifestPath);
      //console.log("Rescanning resource:", resourcePath);

      const manifest = await this.parseManifest(manifestPath);
      if (manifest) {
        //console.log("Found manifest:", manifest);

        const resource: ResourceInfo = {
          path: resourcePath,
          manifest,
          clientFiles: new Set(),
          serverFiles: new Set(),
          sharedFiles: new Set(),
        };

        await this.scanScripts(resource);
        this.resources.set(resourcePath, resource);
        this.clearResourceCache(resourcePath);
        //console.log("Updated resource:", resource);
      }
    } catch (error) {
      console.error(`Error rescanning resource at ${manifestPath}:`, error);
    }
  }

  private static async parseManifest(
    manifestPath: string,
  ): Promise<FxManifest | undefined> {
    try {
      const content = await fs.promises.readFile(manifestPath, "utf8");
      console.log("Reading manifest:", manifestPath);

      const manifest: FxManifest = {
        path: manifestPath,
        client_scripts: [],
        server_scripts: [],
        shared_scripts: [],
        games: [],
      };

      const fullContent = content.replace(/\r\n/g, "\n");
      const findScripts = (type: string) => {
        const regex = new RegExp(`${type}s?\\s*{([^}]*)}`, "g");
        const singleRegex = new RegExp(`${type}s?\\s+['"]([^'"]+)['"]`, "g");

        let match;
        const scripts: string[] = [];
        while ((match = regex.exec(fullContent)) !== null) {
          const blockContent = match[1];
          const blockScripts = blockContent
            .split(",")
            .map((s) => s.trim())
            .map((s) => s.replace(/['"]/g, ""))
            .filter((s) => s.length > 0);
          scripts.push(...blockScripts);
        }

        while ((match = singleRegex.exec(fullContent)) !== null) {
          scripts.push(match[1]);
        }

        return scripts;
      };

      const gameMatch = fullContent.match(/game\s+['"]([^'"]+)['"]/);
      if (gameMatch) {
        manifest.game = gameMatch[1];
      }

      manifest.client_scripts = findScripts("client_script");
      manifest.server_scripts = findScripts("server_script");
      manifest.shared_scripts = findScripts("shared_script");

      //console.log("Parsed manifest?:", manifest);
      return manifest;
    } catch (error) {
      console.error(`Error parsing manifest at ${manifestPath}:`, error);
      return undefined;
    }
  }

  private static async scanScripts(resource: ResourceInfo) {
    const basePath = resource.path;
    const manifest = resource.manifest;
    // console.log('Scanning scripts for resource (basePath):', basePath);

    const resolvePaths = (scripts: string[]) => {
      return scripts.map((script) => {
        // if (path.isAbsolute(script)) return script;
        return path.join(basePath, script);
      });
    };

    if (manifest.client_scripts) {
      const clientPaths = resolvePaths(manifest.client_scripts);
      for (const scriptPath of clientPaths) {
        if (fs.existsSync(scriptPath)) {
          resource.clientFiles.add(scriptPath);
        }
      }
    }

    if (manifest.server_scripts) {
      const serverPaths = resolvePaths(manifest.server_scripts);
      for (const scriptPath of serverPaths) {
        if (fs.existsSync(scriptPath)) {
          resource.serverFiles.add(scriptPath);
        }
      }
    }

    if (manifest.shared_scripts) {
      const sharedPaths = resolvePaths(manifest.shared_scripts);
      for (const scriptPath of sharedPaths) {
        if (fs.existsSync(scriptPath)) {
          resource.sharedFiles.add(scriptPath);
        }
      }
    }
  }

  static getScriptType(filePath: string): string {
    const cached = this.scriptTypeCache.get(filePath);
    if (cached) {
      return cached;
    }

    const type = this.calculateScriptType(filePath);
    this.scriptTypeCache.set(filePath, type);
    return type;
  }

  private static calculateScriptType(filePath: string): string {
    for (const resource of this.resources.values()) {
      if (resource.clientFiles.has(filePath)) {
        return "client";
      }
      if (resource.serverFiles.has(filePath)) {
        return "server";
      }
      if (resource.sharedFiles.has(filePath)) {
        return "shared";
      }
    }
    return "undefined";
  }

  static getGameSupport(filePath: string): string[] {
    if (this.gameCache.has(filePath)) {
      return this.gameCache.get(filePath)!;
    }

    for (const [_, resource] of this.resources) {
      if (this.isFileInResource(filePath, resource)) {
        const games = resource.manifest.game || resource.manifest.games;
        const result = Array.isArray(games)
          ? games
          : games
          ? [games]
          : ["gta5"];
        this.gameCache.set(filePath, result);
        return result;
      }
    }

    const defaultGame = ["gta5"];
    this.gameCache.set(filePath, defaultGame);
    return defaultGame;
  }

  private static isFileInResource(
    filePath: string,
    resource: ResourceInfo,
  ): boolean {
    return filePath.startsWith(resource.path);
  }

  // private static async parseManifestContent(
  //   content: string,
  //   manifestUri: Uri,
  // ): Promise<FxManifest> {
  //   const manifest: FxManifest = { path: manifestUri.fsPath };

  //   const lines = content.split('\n');
  //   let inClientBlock = false;
  //   let inServerBlock = false;
  //   let inSharedBlock = false;

  //   for (let i = 0; i < lines.length; i++) {
  //     let line = lines[i].trim();

  //     // Ignorer les lignes vides et les commentaires
  //     if (!line || line.startsWith('--')) continue;

  //     // Détecter le type de jeu
  //     if (line.startsWith('game')) {
  //       const match = line.match(/['"]([^'"]*)['"]/);
  //       if (match) manifest.game = match[1];
  //       continue;
  //     }

  //     // Gérer les blocs de scripts
  //     if (line.startsWith('client_script')) {
  //       if (line.includes('{')) {
  //         inClientBlock = true;
  //         // Extraire les scripts de la première ligne s'il y en a
  //         line = line.split('{')[1]?.trim() || '';
  //       } else {
  //         // Script unique
  //         const script = line.match(/['"]([^'"]*)['"]/)?.[1];
  //         if (script) manifest.client_scripts = manifest.client_scripts || []
  //       }
  //     }
  //     else if (line.startsWith('server_script')) {
  //       if (line.includes('{')) {
  //         inServerBlock = true;
  //         line = line.split('{')[1]?.trim() || '';
  //       } else {
  //         const script = line.match(/['"]([^'"]*)['"]/)?.[1];
  //         if (script) manifest.server_scripts = manifest.server_scripts || []
  //       }
  //     }
  //     else if (line.includes('shared_script')) {
  //       if (line.includes('{')) {
  //         inSharedBlock = true;
  //         line = line.split('{')[1]?.trim() || '';
  //       } else {
  //         const script = line.match(/['"]([^'"]*)['"]/)?.[1];
  //         if (script) manifest.shared_scripts = manifest.shared_scripts || []
  //       }
  //     }

  //     if (line.includes('}')) {
  //       const beforeBrace = line.split('}')[0].trim();
  //       if (beforeBrace) {
  //         const scripts = this.parseScriptLine(beforeBrace);
  //         if (inClientBlock) manifest.client_scripts = manifest.client_scripts || []
  //         if (inServerBlock) manifest.server_scripts = manifest.server_scripts || []
  //         if (inSharedBlock) manifest.shared_scripts = manifest.shared_scripts || []
  //       }
  //       inClientBlock = false;
  //       inServerBlock = false;
  //       inSharedBlock = false;
  //       continue;
  //     }

  //     if (inClientBlock || inServerBlock || inSharedBlock) {
  //       const scripts = this.parseScriptLine(line);
  //       if (inClientBlock) manifest.client_scripts = manifest.client_scripts || []
  //       if (inServerBlock) manifest.server_scripts = manifest.server_scripts || []
  //       if (inSharedBlock) manifest.shared_scripts = manifest.shared_scripts || []
  //     }
  //   }

  //   console.log('Parsed manifest,,,,:', manifest); // Debug
  //   return manifest;
  // }
}
