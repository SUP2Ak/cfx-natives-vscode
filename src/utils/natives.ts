//import * as path from "path";
import { OrganizedNatives, CacheFunction } from "../types";
import { StorageManager } from './storage';

export const loadNatives: CacheFunction = async (
  game: "gta5" | "rdr3",
): Promise<OrganizedNatives> => {
  try {
    if (!loadNatives.cache) {
      loadNatives.cache = new Map<string, OrganizedNatives>();
    }

    if (loadNatives.cache.has(game)) {
      return loadNatives.cache.get(game)!;
    }

    const storage = StorageManager.getInstance();
    const gameNatives = await storage.getNatives(game);

    const result = {
      client: gameNatives.client || [],
      server: gameNatives.server || [],
      shared: gameNatives.shared || [],
    };

    loadNatives.cache.set(game, result);
    return result;
  } catch (error) {
    console.error(`Error loading natives for ${game}:`, error);
    return { client: [], server: [], shared: [] };
  }
};

export async function initializeNatives(): Promise<void> {
  const storage = StorageManager.getInstance();
  await storage.checkAndUpdateCache();
}
