import * as path from "path";
import { RelativePattern, Uri, workspace } from "vscode";
import { FxManifest, ResourceInfo } from "../types";

export default class ResourceManager {
  private static resources: Map<string, ResourceInfo> = new Map();
  private static fileTypeCache: Map<
    string,
    "client" | "server" | "shared" | undefined
  > = new Map();
  private static gameCache: Map<string, string[]> = new Map();

  static async scanWorkspace() {
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

      console.log(manifestFiles);
      const allManifests = [...manifestFiles, ...resourceFiles];

      console.log(allManifests);
      for (const manifestUri of allManifests) {
        await this.parseResource(manifestUri);
      }
    }
  }

  private static async parseResource(manifestUri: Uri): Promise<void> {
    try {
      const manifestContent = await workspace.fs.readFile(manifestUri);
      const manifest = await this.parseManifestContent(
        manifestContent.toString(),
        manifestUri,
      );

      const resourcePath = path.dirname(manifestUri.fsPath);
      const resourceInfo: ResourceInfo = {
        path: resourcePath,
        manifest,
        clientFiles: new Set(),
        serverFiles: new Set(),
        sharedFiles: new Set(),
      };

      console.log(resourceInfo);

      // Parse script paths
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

  static getScriptType(
    filePath: string,
  ): "client" | "server" | "shared" | undefined {
    if (this.fileTypeCache.has(filePath)) {
      return this.fileTypeCache.get(filePath);
    }

    const type = this.determineScriptType(filePath);
    this.fileTypeCache.set(filePath, type);
    return type;
  }

  private static determineScriptType(filePath: string) {
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
    return undefined;
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

  private static async parseManifestContent(
    content: string,
    manifestUri: Uri,
  ): Promise<FxManifest> {
    const manifest: FxManifest = { path: manifestUri.fsPath };

    const patterns = {
      client_scripts: /client_scripts\s*{([^}]*)}/,
      server_scripts: /server_scripts\s*{([^}]*)}/,
      shared_scripts: /shared_scripts\s*{([^}]*)}/,
      game: /game\s*['"]([^'"]*)['"]/,
      games: /games\s*{([^}]*)}/,
    };

    for (const [key, pattern] of Object.entries(patterns)) {
      const match = content.match(pattern);
      if (match) {
        manifest[key] = key === "game"
          ? match[1]
          : this.parseScriptList(match[1]);
      }
    }

    return manifest;
  }

  private static parseScriptList(scripts: string): string[] {
    return scripts
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => s.replace(/['"]/g, ""));
  }
}
