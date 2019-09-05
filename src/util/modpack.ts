import { IModPack, IModPackAttributes, IModPackInfo, IModPackMod,
         IModPackModRule, IModPackSourceInfo } from '../types/IModPack';

import { createHash } from 'crypto';
import * as _ from 'lodash';
import * as path from 'path';
import turbowalk, { IEntry } from 'turbowalk';
import { actions, log, selectors, types, util } from 'vortex-api';
import { fileMD5 } from 'vortexmt';
import findModByRef from './findModByRef';

const fileMD5Async = (fileName: string) => new Promise((resolve, reject) => {
  fileMD5(fileName, (err: Error, result: string) => (err !== null) ? reject(err) : resolve(result));
});

function sanitizeExpression(fileName: string): string {
  // drop extension and anything like ".1" or " (1)" at the end which probaby
  // indicates duplicate downloads (either in our own format or common browser
  // style)
  return path.basename(fileName, path.extname(fileName))
    .replace(/\.\d+$/, '')
    .replace(/ \(\d+\)$/, '');
}

function deduceSource(mod: types.IMod,
                      sourceInfo: IModPackSourceInfo,
                      versionMatcher: string)
                      : IModPackSourceInfo {
  const res: IModPackSourceInfo = (sourceInfo !== undefined)
    ? {...sourceInfo}
    : { type: 'nexus' };

  if (res.type === 'nexus') {
    if (util.getSafe(mod.attributes, ['source'], undefined) !== 'nexus') {
      throw new Error(`"${mod.id}" doesn't have Nexus as it's source`);
    }
    const modId = util.getSafe(mod, ['attributes', 'modId'], undefined);
    const fileId = util.getSafe(mod, ['attributes', 'fileId'], undefined);
    if ((modId === undefined) || (fileId === undefined)) {
      throw new Error(`"${mod.id}" is missing mod id or file id`);
    }

    res.mod_id = modId;
    res.file_id = fileId;
  }

  const assign = (obj: any, key: string, value: any) => {
    if (obj[key] === undefined) {
      obj[key] = value;
    }
  };

  assign(res, 'md5', util.getSafe(mod.attributes, ['fileMD5'], undefined));
  assign(res, 'file_size', util.getSafe(mod.attributes, ['fileSize'], undefined));
  assign(res, 'logical_filename', util.getSafe(mod.attributes, ['logicalFileName'], undefined));
  if (sourceInfo !== undefined) {
    assign(res, 'update_policy', sourceInfo.update_policy);
  }

  if ((res.md5 === undefined)
      && (res.logical_filename === undefined)
      && (res.file_expression === undefined)) {
    assign(res, 'file_expression',
      sanitizeExpression(util.getSafe(mod.attributes, ['fileName'], undefined)));
  }

  return res;
}

/*
export function initModPackMod(input: types.IMod): IModPackMod {
  return {
    name: util.renderModName(input),
    version: util.getSafe(input, ['attributes', 'version'], ''),
    optional: false,
    game_id: util.getSafe(input, ['attributes', 'downloadGame'], undefined),
    source: deduceSource(input),
  };
}
*/

export function generateModPack(info: IModPackInfo,
                                mods: IModPackMod[],
                                modRules: IModPackModRule[]): IModPack {
  return {
    info,
    mods,
    modRules,
  };
}

async function rulesToModPackMods(rules: types.IModRule[],
                                  mods: { [modId: string]: types.IMod },
                                  stagingPath: string,
                                  gameId: string,
                                  modpackInfo: IModPackAttributes,
                                  onProgress: (percent: number, text: string) => void,
                                  onError: (message: string, replace: any) => void)
                                  : Promise<IModPackMod[]> {
  rules = rules.filter(rule => mods[rule.reference.id] !== undefined);
  let total = rules.length;

  let finished = 0;

  const result: IModPackMod[] = await Promise.all(rules.map(async (rule, idx) => {
    const mod = mods[rule.reference.id];

    const modName = util.renderModName(mod, { version: false });
    try {
      // This call is relatively likely to fail to do it before the hash calculation to
      // save the user time in case it does fail
      const source = deduceSource(mod,
                                  util.getSafe(modpackInfo, ['source', mod.id], undefined),
                                  rule.reference.versionMatch);

      // let hashes: types.IFileListItem[];
      let hashes: any;

      let entries: IEntry[] = [];
      if (!util.getSafe(modpackInfo, ['freshInstall', mod.id], true)) {
        const modPath = path.join(stagingPath, mod.installationPath);
        await turbowalk(modPath, async input => {
          entries = [].concat(entries, input);
        }, {});

        hashes = await Promise.all(entries
          .filter(iter => !iter.isDirectory)
          .map(async iter => ({
            path: path.relative(modPath, iter.filePath),
            md5: await fileMD5Async(iter.filePath),
          })));

        onProgress(undefined, modName);

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
        source,
        hashes,
      };
    } catch (err) {
      --total;

      onError('failed to pack "{{modName}}": {{error}}', {
        modName, error: err.message,
      });

      return undefined;
    }
  }));

  return result.filter(mod => (mod !== undefined) && (Object.keys(mod.source).length > 0));
}

export function makeBiDirRule(mod: types.IMod, rule: types.IModRule): IModPackModRule {
  if (rule === undefined) {
    return undefined;
  }

  const source: types.IModReference = (util as any).makeModReference(mod);

  return {
    type: rule.type,
    reference: rule.reference,
    source,
  };
}

function makeTransferrable(mods: { [modId: string]: types.IMod },
                           rule: types.IModRule): types.IModRule {
  if ((rule.reference.fileMD5 !== undefined)
      || (rule.reference.logicalFileName !== undefined)
      || (rule.reference.fileExpression !== undefined)) {
    // ok unmodified
    return rule;
  }
  if (rule.reference.id === undefined) {
    // rule unusable
    log('warn', 'invalid rule couldn\'t be included in the mod pack', JSON.stringify(rule));
    return undefined;
  }

  // a rule that doesn't contain any of the above markers will likely not be able to match
  // anything on a different system

  const mod = findModByRef(rule.reference, mods);

  if (mod === undefined) {
    log('warn', 'mod enabled in mod pack isn\'t installed', JSON.stringify(rule));
    return undefined;
  }

  const newRef: types.IModReference = (util as any).makeModReference(mod);

  return {
    type: rule.type,
    fileList: (rule as any).fileList,
    comment: rule.comment,
    reference: newRef,
  } as any;
}

function extractModRules(rules: types.IModRule[],
                         mods: { [modId: string]: types.IMod }): IModPackModRule[] {
  return rules.reduce((prev: IModPackModRule[], rule: types.IModRule) => {
    const mod = mods[rule.reference.id];
    if (mod === undefined) {
      return prev;
    }

    return [].concat(prev, (mod.rules || []).map((input: types.IModRule): IModPackModRule =>
      makeBiDirRule(mod, makeTransferrable(mods, input))));
  }, [])
  // throw out rules that couldn't be converted
  .filter(rule => rule !== undefined);
}

export function modPackModToRule(mod: IModPackMod): types.IModRule {
  const downloadHint = ['manual', 'browse', 'direct'].indexOf(mod.source.type) !== -1
    ? {
      url: mod.source.url,
      instructions: mod.source.instructions,
      mode: mod.source.type,
    }
    : undefined;
  return {
    type: mod.optional ? 'recommends' : 'requires',
    reference: {
      description: mod.name,
      fileMD5: mod.source.md5,
      gameId: mod.game_id,
      fileSize: mod.source.file_size,
      versionMatch: mod.version,
      logicalFileName: mod.source.logical_filename,
      fileExpression: mod.source.file_expression,
    },
    fileList: mod.hashes,
    downloadHint,
  } as any;
}

export async function modToPack(gameId: string,
                                stagingPath: string,
                                modpack: types.IMod,
                                mods: { [modId: string]: types.IMod },
                                onProgress: (percent?: number, text?: string) => void,
                                onError: (message: string, replace: any) => void)
                                : Promise<IModPack> {
  if (selectors.activeGameId(state) !== gameId) {
    // this would be a bug
    return Promise.reject(new Error('Can only export mod pack for the active profile'));
  }

  const modRules = extractModRules(modpack.rules, mods);

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
                                   onProgress, onError),
    modRules,
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
  // remove rules not found in newRules
  mod.rules.forEach(rule => {
    if (newRules.find(iter => _.isEqual(rule, iter)) === undefined) {
      api.store.dispatch(actions.removeModRule(gameId, mod.id, rule));
    }
  });
  // add rules not found in the old list
  newRules.forEach(rule => {
    if (mod.rules.find(iter => _.isEqual(rule, iter)) === undefined) {
      api.store.dispatch(actions.addModRule(gameId, mod.id, rule));
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
