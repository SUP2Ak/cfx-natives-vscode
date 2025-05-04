import { ExtensionContext, extensions, Uri } from 'vscode';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'fs/promises';
import * as https from 'https';

interface Metadata {
  'natives.gta5': string;
  'natives.rdr3': string;
  'global': string;
}

export const EXTENSION_ID = "sup2ak.cfx-natives-vscode";
export const extension = extensions.getExtension(EXTENSION_ID)!;

export class StorageManager {
  private static instance: StorageManager;
  private readonly GITHUB_RAW_URL = "https://raw.githubusercontent.com/SUP2Ak/cfx-natives-data/main";
  private globalStoragePath: string;

  private constructor(context: ExtensionContext) {
    if (os.platform() === 'win32') {
      this.globalStoragePath = path.join(os.homedir(), 'AppData', 'Roaming', 'cfx-natives-vscode');
    } else if (os.platform() === 'darwin') {
      this.globalStoragePath = path.join(os.homedir(), 'Library', 'Application Support', 'cfx-natives-vscode');
    } else {
      this.globalStoragePath = path.join(os.homedir(), '.config', 'cfx-natives-vscode');
    }
  }

  static getInstance(context?: ExtensionContext): StorageManager {
    if (!StorageManager.instance && context) {
      StorageManager.instance = new StorageManager(context);
    }
    return StorageManager.instance;
  }

  private async ensureStorageExists(): Promise<void> {
    try {
      await fs.mkdir(this.globalStoragePath, { recursive: true });
    } catch (error) {
      console.error('Error creating storage directory:', error);
    }
  }

  private async fetchJson<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      https.get(url, {
        headers: { 'User-Agent': 'VSCode-Extension' }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', reject);
    });
  }

  private async readLocalJson<T>(filename: string): Promise<T | null> {
    try {
      const filePath = path.join(this.globalStoragePath, filename);
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private async saveJson(filename: string, data: any): Promise<void> {
    await this.ensureStorageExists();
    const filePath = path.join(this.globalStoragePath, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  async checkAndUpdateCache(): Promise<void> {
    try {
      await this.ensureStorageExists();
      
      const metadata = await this.fetchJson<Metadata>(`${this.GITHUB_RAW_URL}/metadata.json`);
      const currentMetadata = await this.readLocalJson<Metadata>('metadata.json');

      const updates: Promise<void>[] = [];

      if (!currentMetadata?.['natives.gta5'] || currentMetadata['natives.gta5'] !== metadata['natives.gta5']) {
        updates.push(this.updateFile('natives.gta5.json'));
      }
      if (!currentMetadata?.['natives.rdr3'] || currentMetadata['natives.rdr3'] !== metadata['natives.rdr3']) {
        updates.push(this.updateFile('natives.rdr3.json'));
      }
      if (!currentMetadata?.['global'] || currentMetadata['global'] !== metadata['global']) {
        updates.push(this.updateFile('global.json'));
      }

      if (updates.length > 0) {
        await Promise.all(updates);
        await this.saveJson('metadata.json', metadata);
      }
    } catch (error) {
      console.error('Error updating cache:', error);
    }
  }

  private async updateFile(filename: string): Promise<void> {
    try {
      console.log(`Updating ${filename}`);
      const data = await this.fetchJson(`${this.GITHUB_RAW_URL}/${filename}`);
      await this.saveJson(filename, data);
    } catch (error) {
      console.error(`Error updating ${filename}:`, error);
    }
  }

  async getNatives(game: 'gta5' | 'rdr3'): Promise<any> {
    const filename = `natives.${game}.json`;
    const natives = await this.readLocalJson(filename);
    if (natives) {
      return natives;
    }

    const sourceUri = Uri.joinPath(extension.extensionUri, 'assets', filename);
    const data = await fs.readFile(sourceUri.fsPath, 'utf8');
    return JSON.parse(data);
  }

  async getGlobalFunctions(): Promise<any> {
    const filename = 'global.json';
    const globals = await this.readLocalJson(filename);
    if (globals) {
      return globals;
    }

    const sourceUri = Uri.joinPath(extension.extensionUri, 'assets', filename);
    const data = await fs.readFile(sourceUri.fsPath, 'utf8');
    return JSON.parse(data);
  }
}
