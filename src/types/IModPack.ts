import { types } from 'vortex-api';

export interface IModPackInfo {
  author: string;
  author_url: string;
  name: string;
  version: string;
  description: string;
  game_id: string;
}

export type UpdatePolicy = 'exact' | 'latest';

export interface ISourceNexus {
  mod_id: number;
  file_id: number;
  update_policy: UpdatePolicy;
}

export interface ISourceMD5 {
  hash: string;
}

export interface ISourceManual {

}

export interface ISourceDirect {
  url: string;
}

export interface ISourceBrowse {
  url: string;
}

export interface IModPackModSource {
  nexus?: ISourceNexus;
  md5?: ISourceMD5;
  direct_download?: ISourceDirect;
  browse?: ISourceBrowse;
}

export interface IModPackMod {
  name: string;
  version: string;
  optional: boolean;
  game_id: string;
  source: IModPackModSource;
  // hashes?: types.IFileListItem[];
  hashes?: any;
}

export type RuleType = 'before' | 'after' | 'requires' | 'conflicts' | 'recommends' | 'provides';

export interface IModPackModRule {
  source: types.IModReference;
  type: RuleType;
  reference: types.IModReference;
}

export interface IModPack {
  info: IModPackInfo;
  mods: IModPackMod[];
  modRules: IModPackModRule[];
}

export interface IModPackAttributes {
  freshInstall?: { [modId: string]: boolean };
}