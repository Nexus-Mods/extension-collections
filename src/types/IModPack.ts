import { types } from 'vortex-api';
import { IModPackGamebryo } from '../util/gameSupport/gamebryo';

export interface IModPackInfo {
  author: string;
  authorUrl: string;
  name: string;
  description: string;
  domainName: string;
}

export type UpdatePolicy = 'exact' | 'latest' | 'prefer';

export type SourceType = 'browse' | 'manual' | 'direct' | 'nexus';

export interface IModPackSourceInfo {
  type: SourceType;
  url?: string;
  // textual download/installation instructions (used with source 'manual' and 'browse')
  instructions?: string;
  // numerical mod id (used with source 'nexus')
  modId?: number;
  // numerical file id (used with source 'nexus')
  fileId?: number;
  // determines which file to get if there is an update compared to what's in the mod pack
  // Not supported with every source type
  updatePolicy?: UpdatePolicy;

  md5?: string;
  fileSize?: number;
  logicalFilename?: string;
  fileExpression?: string;
}

export interface IModPackModDetails {
  type?: string;
}

export interface IModPackMod {
  name: string;
  version: string;
  optional: boolean;
  domainName: string;
  source: IModPackSourceInfo;
  // hashes?: types.IFileListItem[];
  hashes?: any;
  // installer-specific data to replicate the choices the author made
  choices?: any;
  author?: string;
  details?: IModPackModDetails;
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
