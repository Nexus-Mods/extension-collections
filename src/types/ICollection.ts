import { types } from 'vortex-api';
import { ICollectionGamebryo } from '../util/gameSupport/gamebryo';

export interface ICollectionInfo {
  author: string;
  authorUrl: string;
  name: string;
  description: string;
  domainName: string;
}

export type UpdatePolicy = 'exact' | 'latest' | 'prefer';

export type SourceType = 'browse' | 'manual' | 'direct' | 'nexus' | 'bundle';

export interface ICollectionSourceInfo {
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

export interface ICollectionModDetails {
  type?: string;
}

export interface ICollectionMod {
  name: string;
  version: string;
  optional: boolean;
  domainName: string;
  source: ICollectionSourceInfo;
  // hashes?: types.IFileListItem[];
  hashes?: any;
  // installer-specific data to replicate the choices the author made
  choices?: any;
  instructions?: string;
  author?: string;
  details?: ICollectionModDetails;
}

export type RuleType = 'before' | 'after' | 'requires' | 'conflicts' | 'recommends' | 'provides';

export interface ICollectionModRule {
  source: types.IModReference;
  type: RuleType;
  reference: types.IModReference;
}

export interface ICollection extends Partial<ICollectionGamebryo> {
  info: ICollectionInfo;
  mods: ICollectionMod[];
  modRules: ICollectionModRule[];
}

export interface ICollectionAttributes {
  freshInstall?: { [modId: string]: boolean };
  instructions?: { [modId: string]: string };
  source?: { [modId: string]: { type: SourceType } };
  installMode?: { [modId: string]: string };
}

export interface ICollectionModRuleEx extends ICollectionModRule {
  sourceName: string;
  referenceName: string;
}
