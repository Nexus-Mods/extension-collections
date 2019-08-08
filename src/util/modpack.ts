import { IModPack, IModPackInfo, IModPackMod,
         IModPackModRule, IModPackModSource } from '../types/IModPack';

import { createHash } from 'crypto';
import * as path from 'path';
import turbowalk, { IEntry } from 'turbowalk';
import { fs, types, util } from 'vortex-api';

function deduceSource(mod: types.IMod): IModPackModSource {
  const res: IModPackModSource = {};

  if (util.getSafe(mod.attributes, ['source'], undefined) === 'nexus') {
    const modId = util.getSafe(mod, ['attributes', 'modId'], undefined);
    const fileId = util.getSafe(mod, ['attributes', 'fileId'], undefined);

    if ((modId !== undefined) && (fileId !== undefined)) {
      res.nexus = {
        update_policy: 'exact',
        mod_id: modId,
        file_id: fileId,
      };
    }
  }

  const md5 = util.getSafe(mod.attributes, ['fileMD5'], undefined);
  if (md5 !== undefined) {
    res.md5 = {
      hash: md5,
    };
  }
  return res;
}

export function initModPackMod(input: types.IMod): IModPackMod {
  return {
    name: util.renderModName(input),
    version: util.getSafe(input, ['attributes', 'version'], ''),
    optional: false,
    game_id: util.getSafe(input, ['attributes', 'downloadGame'], undefined),
    source: deduceSource(input),
  };
}

export function generateModPack(info: IModPackInfo,
                                mods: IModPackMod[],
                                modRules: IModPackModRule[]): IModPack {
  return {
    info,
    mods,
    modRules,
  };
}

async function calcMD5(filePath: string): Promise<string> {
  const buf = await fs.readFileAsync(filePath);
  return createHash('md5')
    .update(buf)
    .digest('hex');
}

async function rulesToModPackMods(rules: types.IModRule[],
                                  mods: { [modId: string]: types.IMod },
                                  stagingPath: string,
                                  gameId: string,
                                  onProgress: (percent: number, text: string) => void)
                                  : Promise<IModPackMod[]> {
  rules = rules.filter(rule => mods[rule.reference.id]);
  const total = rules.length;

  const result: IModPackMod[] = await Promise.all(rules.map(async (rule, idx) => {
    const mod = mods[rule.reference.id];

    let entries: IEntry[] = [];
    await turbowalk(path.join(stagingPath, mod.installationPath), input => {
      entries = [].concat(entries, input);
    }, {});

    onProgress(undefined, util.renderModName(mod, { version: false }));

    const hashes = await Promise.all(entries
      .filter(iter => !iter.isDirectory)
      .map(async iter => ({ path: iter.filePath, md5: await calcMD5(iter.filePath) })));

    onProgress(Math.floor((idx / total) * 100), undefined);

    return {
      name: util.renderModName(mod),
      version: util.getSafe(mod.attributes, ['version'], '1.0.0'),
      optional: false,
      game_id: util.getSafe(mod, ['attributes', 'downloadGame'], gameId),
      source: deduceSource(mod),
      hashes,
    };
  }));

  return result.filter(mod => (mod !== undefined) && (Object.keys(mod.source).length > 0));
}

export function makeBiDirRule(mod: types.IMod, rule: types.IModRule): IModPackModRule {
  return {
    type: rule.type,
    reference: rule.reference,
    source: (util as any).makeModReference(mod),
  };
}

function extractModRules(rules: types.IModRule[],
                         mods: { [modId: string]: types.IMod }): IModPackModRule[] {
  return rules.reduce((prev: IModPackModRule[], rule: types.IModRule) => {
    const mod = mods[rule.reference.id];
    if (mod === undefined) {
      return prev;
    }

    return [].concat(prev, (mod.rules || []).map((input: types.IModRule): IModPackModRule =>
      makeBiDirRule(mod, input)));
  }, []);
}

export function modPackModToRule(mod: IModPackMod): types.IModRule {
  return {
    type: 'requires',
    reference: {
      fileMD5: mod.source.md5.hash,
    },
  };
}

export async function modToPack(gameId: string,
                                stagingPath: string,
                                mod: types.IMod,
                                mods: { [modId: string]: types.IMod },
                                onProgress: (percent?: number, text?: string) => void)
                                : Promise<IModPack> {
  return {
    info: {
      author: util.getSafe(mod.attributes, ['author'], 'Anonymous'),
      author_url: util.getSafe(mod.attributes, ['author_url'], ''),
      name: util.renderModName(mod),
      version: util.getSafe(mod.attributes, ['version'], '1.0.0'),
      description: util.getSafe(mod.attributes, ['description'], ''),
      game_id: gameId,
    },
    mods: await rulesToModPackMods(mod.rules, mods, stagingPath, gameId, onProgress),
    modRules: extractModRules(mod.rules, mods),
  };
}
