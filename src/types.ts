export interface Example {
  lang: string;
  code: string;
}

export interface Arguments {
  name: string;
  type: string;
  description?: string;
}

export interface Native {
  cname?: string;
  name: string;
  hash: string;
  params: Arguments[];
  return_type: string;
  description: string;
  namespace: string;
  apiset: string;
  game_support: string;
  docs_url: string;
  is_rpc?: boolean;
  examples?: Example[];
}

export interface FxManifest {
  path: string;
  [key: string]: string | string[] | undefined;
  client_scripts?: string[];
  server_scripts?: string[];
  shared_scripts?: string[];
  games?: "gta5" | "rdr3" | string[];
}

export interface OrganizedNatives {
  client: Native[];
  server: Native[];
  shared: Native[];
}

export interface ResourceInfo {
  path: string;
  manifest: FxManifest;
  clientFiles: Set<string>;
  serverFiles: Set<string>;
  sharedFiles: Set<string>;
}

export const enum Lang {
  LUA = "lua",
  JS = "javascript",
  TS = "typescript",
  CSHARP = "csharp",
}

export interface CacheFunction extends Function {
  cache?: Map<string, OrganizedNatives>;
}
