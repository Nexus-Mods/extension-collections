import { types } from 'vortex-api';
import { IModPackGamebryo } from '../util/gameSupport/gamebryo';

export interface IModPackInfo {
  author: string;
  author_url: string;
  name: string;
  version: string;
  description: string;
  game_id: string;
}

export type UpdatePolicy = 'exact' | 'latest';

export type SourceType = 'browse' | 'manual' | 'direct' | 'nexus';

export interface IModPackSourceInfo {
  type: SourceType;
  md5?: string;
  url?: string;
  instructions?: string;
  mod_id?: string;
  file_id?: string;
  // determines which file to get if there is an update compared to what's in the mod pack
  update_policy?: UpdatePolicy;
  file_size?: number;
  version?: string;
  logical_filename?: string;
  file_expression?: string;
}

export interface IModPackMod {
  name: string;
  version: string;
  optional: boolean;
  game_id: string;
  source: IModPackSourceInfo;
  // hashes?: types.IFileListItem[];
  hashes?: any;
  // installer-specific data to replicate the choices the author made
  choices?: any;
}

export type RuleType = 'before' | 'after' | 'requires' | 'conflicts' | 'recommends' | 'provides';

export interface IModPackModRule {
  source: types.IModReference;
  type: RuleType;
  reference: types.IModReference;
}

export interface IModPack extends Partial<IModPackGamebryo> {
  info: IModPackInfo;
  mods: IModPackMod[];
  modRules: IModPackModRule[];
}

export interface IModPackAttributes {
  freshInstall?: { [modId: string]: boolean };
}
