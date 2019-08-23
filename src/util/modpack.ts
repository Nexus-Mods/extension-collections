import { IFileListItem, IModPack, IModPackAttributes, IModPackInfo, IModPackMod,
         IModPackModRule, IModPackModSource } from '../types/IModPack';

import { createHash } from 'crypto';
import * as _ from 'lodash';
import * as path from 'path';
import turbowalk, { IEntry } from 'turbowalk';
import { actions, fs, types, util } from 'vortex-api';

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

/*
async function calculateHashes(entries: IEntry[], req: NodeRequireFunction)
                               : Promise<Array<{ path: string, md5: string }>> {
  const fsWorker = req('fs');
  const { createHash } = req('crypto');

  const calcMD5 = async (filePath: string) => new Promise<string>((resolve, reject) => {
    fsWorker.readFile(filePath, (err, data) => {
      if (err !== null) {
        return reject(err);
      }
      resolve(createHash('md5')
        .update(data)
        .digest('hex'));
    });
  });

  return Promise.all(entries.map(async iter => ({
    path: iter.filePath,
    md5: await calcMD5(iter.filePath),
  })));
}
*/

async function rulesToModPackMods(rules: types.IModRule[],
                                  mods: { [modId: string]: types.IMod },
                                  stagingPath: string,
                                  gameId: string,
                                  modpackInfo: IModPackAttributes,
                                  onProgress: (percent: number, text: string) => void)
                                  : Promise<IModPackMod[]> {
  rules = rules.filter(rule => mods[rule.reference.id]);
  let total = rules.length;

  let finished = 0;

  const result: IModPackMod[] = await Promise.all(rules.map(async (rule, idx) => {
    const mod = mods[rule.reference.id];

    const modName = util.renderModName(mod, { version: false });

    let hashes: IFileListItem[];

    let entries: IEntry[] = [];
    if (!util.getSafe(modpackInfo, ['freshInstall', mod.id], true)) {
      await turbowalk(path.join(stagingPath, mod.installationPath), input => {
        entries = [].concat(entries, input);
      }, {});

      onProgress(undefined, modName);

      /* use multiple threads to calculate hashes. This causes electron to crash,
         no clue why. The electron docs claim node.js are supposed to work but I think
         that may not be true for crypto

      const hashes = await
        util.runThreaded(calculateHashes, __dirname, entries.filter(iter => !iter.isDirectory));
      */
      ++finished;
    } else {
      --total;
    }

    onProgress(Math.floor((finished / total) * 100), modName);

    return {
      name: modName,
      version: util.getSafe(mod.attributes, ['version'], '1.0.0'),
      optional: rule.type === 'recommends',
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
                                modpack: types.IMod,
                                mods: { [modId: string]: types.IMod },
                                onProgress: (percent?: number, text?: string) => void)
                                : Promise<IModPack> {
  return {
    info: {
      author: util.getSafe(modpack.attributes, ['author'], 'Anonymous'),
      author_url: util.getSafe(modpack.attributes, ['author_url'], ''),
      name: util.renderModName(modpack),
      version: util.getSafe(modpack.attributes, ['version'], '1.0.0'),
      description: util.getSafe(modpack.attributes, ['description'], ''),
      game_id: gameId,
    },
    mods: await rulesToModPackMods(modpack.rules, mods, stagingPath, gameId,
                                   util.getSafe(modpack.attributes, ['modpack'], {}),
                                   onProgress),
    modRules: extractModRules(modpack.rules, mods),
  };
}

function createRulesFromProfile(profile: types.IProfile,
                                mods: {[modId: string]: types.IMod}): types.IModRule[] {
  return Object.keys(profile.modState)
    .filter(modId => profile.modState[modId].enabled
                  && (mods[modId] !== undefined)
                  && (mods[modId].attributes['generated'] !== true))
    .map(modId => ({
      type: 'requires',
      reference: {
        id: modId,
      },
    }) as any);
}

export function makeModpackId(profileId: string): string {
  return `vortex_modpack_${profileId}`;
}

function createModpack(api: types.IExtensionApi, gameId: string,
                       id: string, name: string,
                       rules: types.IModRule[]) {
  const state: types.IState = api.store.getState();

  const mod: types.IMod = {
    id,
    type: 'modpack',
    state: 'installed',
    attributes: {
      name,
      version: '1.0.0',
      installTime: new Date(),
      author: util.getSafe(state, ['persistent', 'nexus', 'userInfo', 'name'], 'Anonymous'),
    },
    installationPath: id,
    rules,
  };

  api.events.emit('create-mod', gameId, mod, (error: Error) => {
    if (error !== null) {
      api.showErrorNotification('Failed to create mod pack', error);
    }
  });
}

function updateModpack(api: types.IExtensionApi, gameId: string,
                       mod: types.IMod, newRules: types.IModRule[]) {
  mod.rules.forEach(rule => {
    if (newRules.find(iter => _.isEqual(rule, iter) === undefined)) {
      api.store.dispatch(actions.removeModRule(gameId, mod.id, rule));
    }
  });
}

export function createModpackFromProfile(api: types.IExtensionApi,
                                         profileId: string)
                                         : { id: string, name: string } {
  const state: types.IState = api.store.getState();
  const profile = state.persistent.profiles[profileId];

  const id = makeModpackId(profileId);
  const name = `Modpack: ${profile.name}`;
  const rules = createRulesFromProfile(profile, state.persistent.mods[profile.gameId]);

  const mod: types.IMod = state.persistent.mods[profile.gameId][id];

  if (mod === undefined) {
    createModpack(api, profile.gameId, id, name, rules);
  } else {
    updateModpack(api, profile.gameId, mod, rules);
  }

  return { id, name };
}
