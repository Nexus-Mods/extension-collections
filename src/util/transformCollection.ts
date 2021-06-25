import { BUNDLED_PATH, MOD_TYPE } from '../constants';
import { ICollection, ICollectionAttributes, ICollectionInfo, ICollectionMod,
         ICollectionModRule, ICollectionModRuleEx, ICollectionSourceInfo } from '../types/ICollection';

import { findExtensions, IExtensionFeature } from './extension';
import { generateGameSpecifics } from './gameSupport';
import { renderReference, ruleId } from './util';

import * as _ from 'lodash';
import Zip = require('node-7z');
import * as path from 'path';
import * as Redux from 'redux';
import * as semver from 'semver';
import { generate as shortid } from 'shortid';
import turbowalk, { IEntry } from 'turbowalk';
import { actions, fs, log, selectors, types, util } from 'vortex-api';
import { fileMD5 } from 'vortexmt';

export const LOGO_NAME: string = 'logo.jpg';

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

function toInt(input: string | number | undefined | null) {
  if (!input) {
    return 0;
  }

  if (typeof(input) === 'string') {
    return parseInt(input, 10);
  }

  return input;
}

function deduceSource(mod: types.IMod,
                      sourceInfo: ICollectionSourceInfo,
                      versionMatcher: string)
                      : ICollectionSourceInfo {
  const res: Partial<ICollectionSourceInfo> = (sourceInfo !== undefined)
    ? { ...sourceInfo }
    : { type: 'nexus' };

  if (res.type === 'nexus') {
    if (mod.attributes?.source !== 'nexus') {
      throw new Error(`"${util.renderModName(mod)}" doesn't have Nexus as its source`);
    }
    const modId = (mod.type === MOD_TYPE) ? mod.attributes?.collectionId : mod.attributes?.modId;
    const fileId = (mod.type === MOD_TYPE) ? mod.attributes?.revisionId : mod.attributes?.fileId;
    if ((modId === undefined) || (fileId === undefined)) {
      throw new Error(`"${mod.id}" is missing mod id or file id`);
    }

    res.modId = toInt(modId);
    res.fileId = toInt(fileId);
  }

  const assign = (obj: any, key: string, value: any) => {
    if (obj[key] === undefined) {
      obj[key] = value;
    }
  };

  assign(res, 'md5', mod.attributes?.fileMD5);
  assign(res, 'fileSize', mod.attributes?.fileSize);
  assign(res, 'logicalFilename', mod.attributes?.logicalFileName);
  if (sourceInfo?.updatePolicy !== undefined) {
    assign(res, 'updatePolicy', sourceInfo.updatePolicy);
  } else if (sourceInfo?.type === 'bundle') {
    assign(res, 'updatePolicy', 'exact');
  } else {
    if (versionMatcher === '*') {
      assign(res, 'updatePolicy', 'latest');
    } else if ((versionMatcher === undefined)
               || versionMatcher.endsWith('+prefer')) {
      assign(res, 'updatePolicy', 'prefer');
    } else {
      assign(res, 'updatePolicy', 'exact');
    }
  }

  if ((res.md5 === undefined)
      && (res.logicalFilename === undefined)
      && (res.fileExpression === undefined)) {
    assign(res, 'fileExpression', sanitizeExpression(mod.attributes?.fileName));
  }

  return res as ICollectionSourceInfo;
}

export function generateCollection(info: ICollectionInfo,
                                   mods: ICollectionMod[],
                                   modRules: ICollectionModRule[]): ICollection {
  return {
    info,
    mods,
    modRules,
  };
}

async function rulesToCollectionMods(collection: types.IMod,
                                     mods: { [modId: string]: types.IMod },
                                     stagingPath: string,
                                     game: types.IGame,
                                     collectionInfo: ICollectionAttributes,
                                     onProgress: (percent: number, text: string) => void,
                                     onError: (message: string, replace: any) => void)
                                     : Promise<ICollectionMod[]> {
  let total = collection.rules.length;

  let finished = 0;

  const zipper = new Zip();
  const collectionPath = path.join(stagingPath, collection.installationPath);
  await fs.removeAsync(path.join(collectionPath, BUNDLED_PATH));
  await fs.ensureDirAsync(path.join(collectionPath, BUNDLED_PATH));

  const result: ICollectionMod[] = await Promise.all(collection.rules.map(async (rule, idx) => {
    const mod = (rule.reference.id !== undefined)
      ? mods[rule.reference.id]
      : util.findModByRef(rule.reference, mods);

    if ((mod === undefined) || (mod.type === MOD_TYPE)) {
      // don't include the collection itself (or any other collection for that matter,
      // nested collections aren't allowed)
      --total;
      return undefined;
    }

    const modName = util.renderModName(mod, { version: false });
    try {
      // This call is relatively likely to fail to do it before the hash calculation to
      // save the user time in case it does fail
      const source = deduceSource(mod,
                                  collectionInfo.source?.[mod.id],
                                  rule.reference.versionMatch);

      let hashes: any;
      let choices: any;

      let entries: IEntry[] = [];

      const installMode: string = collectionInfo.installMode?.[mod.id] ?? 'fresh';

      const modPath = path.join(stagingPath, mod.installationPath);

      if (installMode === 'clone') {
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
      } else if (installMode === 'choices') {
        choices = mod?.attributes?.installerChoices;
        --total;
      } else {
        --total;
      }

      if (collectionInfo.source?.[mod.id]?.type === 'bundle') {
        const tlFiles = await fs.readdirAsync(modPath);
        const generatedName: string =
          `Bundled - ${(util as any).sanitizeFilename(util.renderModName(mod, { version: true }))}`;
        const destPath = path.join(collectionPath, BUNDLED_PATH, generatedName) + '.7z';
        try {
          await fs.removeAsync(destPath);
        } catch (err) {
          if (err.code !== 'ENOENT') {
            throw err;
          }
        }
        await zipper.add(destPath, tlFiles.map(name => path.join(modPath, name)));
        // update the source reference to match the actual bundled file
        source.fileExpression = generatedName + '.7z';
        source.fileSize = (await fs.statAsync(destPath)).size;
        source.md5 = await util.fileMD5(destPath);
      }

      onProgress(Math.floor((finished / total) * 100), modName);

      const dlGame: types.IGame = (mod.attributes?.downloadGame !== undefined)
        ? util.getGame(mod.attributes.downloadGame)
        : game;

      // workaround where Vortex has no support for the game this download came from
      const domainName = (dlGame !== undefined)
        ? util.nexusGameId(dlGame) : mod.attributes?.downloadGame;

      const res: ICollectionMod = {
        name: modName,
        version: mod.attributes?.version ?? '1.0.0',
        optional: rule.type === 'recommends',
        domainName,
        source,
        hashes,
        choices,
        instructions: collectionInfo.instructions?.[mod.id],
        author: mod.attributes?.author,
        details: {},
      };

      if (mod.type !== '') {
        res.details['type'] = mod.type;
      }
      return res;
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

export function makeBiDirRule(mod: types.IMod, rule: types.IModRule): ICollectionModRule {
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
                           collection: types.IMod,
                           rule: types.IModRule): types.IModRule {
  if ((rule.reference.fileMD5 !== undefined)
      || (rule.reference.logicalFileName !== undefined)
      || (rule.reference.fileExpression !== undefined)) {
    // ok unmodified
    return rule;
  }
  if (rule.reference.id === undefined) {
    // rule unusable
    log('warn', 'invalid rule couldn\'t be included in the collection', JSON.stringify(rule));
    return undefined;
  }

  // a rule that doesn't contain any of the above markers will likely not be able to match
  // anything on a different system

  const mod = util.findModByRef(rule.reference, mods);

  if (mod === undefined) {
    log('warn', 'mod enabled in collection isn\'t installed', JSON.stringify(rule));
    return undefined;
  }

  const newRef: types.IModReference = util.makeModReference(mod);

  // ok, this gets a bit complex now. If the referenced mod gets updated, also make sure
  // the rules referencing it apply to newer versions
  const mpRule = collection.rules.find(iter => util.testModReference(mod, iter.reference));
  if ((mpRule !== undefined) && (mpRule.reference.versionMatch === '*')) {
    newRef.versionMatch = '*';
  }

  return {
    type: rule.type,
    fileList: (rule as any).fileList,
    comment: rule.comment,
    reference: newRef,
  } as any;
}

function ruleEnabled(rule: ICollectionModRule,
                     mods: { [modId: string]: types.IMod },
                     collection: types.IMod) {
  const ruleEx: ICollectionModRuleEx = {
    ...rule,
    sourceName: renderReference(rule.source, mods),
    referenceName: renderReference(rule.reference, mods),
  };
  const id = ruleId(ruleEx);

  return collection.attributes?.collection?.rule?.[id] ?? true;
}

function extractModRules(rules: types.IModRule[],
                         collection: types.IMod,
                         mods: { [modId: string]: types.IMod },
                         onError: (message: string, replace: any) => void): ICollectionModRule[] {
  return rules.reduce((prev: ICollectionModRule[], rule: types.IModRule) => {
    const mod = (rule.reference.id !== undefined)
      ? mods[rule.reference.id]
      : util.findModByRef(rule.reference, mods);
    if (mod === undefined) {
      onError('Not packaging mod that isn\'t installed: "{{id}}"', { id: rule.reference.id });
      return prev;
    } else if (mod.id === collection.id) {
      return prev;
    }

    return [].concat(prev, (mod.rules || []).map((input: types.IModRule): ICollectionModRule =>
      makeBiDirRule(mod, makeTransferrable(mods, collection, input))));
  }, [])
  // throw out rules that couldn't be converted
  .filter(rule => (rule !== undefined) && ruleEnabled(rule, mods, collection));
}

export function collectionModToRule(knownGames: types.IGameStored[],
                                    mod: ICollectionMod): types.IModRule {
  const downloadHint = ['manual', 'browse', 'direct'].includes(mod.source.type)
    ? {
      url: mod.source.url,
      instructions: mod.source.instructions,
      mode: mod.source.type,
    }
    : undefined;

  const coerced = semver.coerce(mod.version);

  let versionMatch = !!coerced
    ? `>=${coerced.version ?? '0.0.0'}+prefer`
    : mod.version;

  if ((mod.source.updatePolicy === 'exact')
      || (mod.source.type === 'bundle')
      || (mod.hashes !== undefined)) {
    versionMatch = !!coerced ? coerced.version : mod.version;
  } else if (mod.source.updatePolicy === 'latest') {
    versionMatch = '*';
  }
  const reference: types.IModReference = {
    description: mod.name,
    fileMD5: mod.source.md5,
    gameId: (util as any).convertGameIdReverse(knownGames, mod.domainName),
    fileSize: mod.source.fileSize,
    versionMatch,
    logicalFileName: mod.source.type === 'bundle' ? undefined : mod.source.logicalFilename,
    fileExpression: mod.source.type === 'bundle' ? undefined : mod.source.fileExpression,
    tag: shortid(),
  };

  if (mod.source.type === 'nexus') {
    if (!mod.source.modId || !mod.source.fileId) {
      const err = new Error('Invalid nexus repo specification');
      err['mod'] = mod;
      throw err;
    }
    reference['repo'] = {
      repository: 'nexus',
      gameId: mod.domainName,
      modId: mod.source.modId.toString(),
      fileId: mod.source.fileId.toString(),
    };
  }

  return {
    type: mod.optional ? 'recommends' : 'requires',
    reference,
    fileList: mod.hashes,
    installerChoices: mod.choices,
    downloadHint,
    extra: {
      author: mod.author,
      type: mod.details.type,
      name: mod.name,
      instructions: mod.instructions,
    },
  } as any;
}

export async function modToCollection(state: types.IState,
                                      gameId: string,
                                      stagingPath: string,
                                      collection: types.IMod,
                                      mods: { [modId: string]: types.IMod },
                                      onProgress: (percent?: number, text?: string) => void,
                                      onError: (message: string, replace: any) => void)
                                      : Promise<ICollection> {
  if (selectors.activeGameId(state) !== gameId) {
    // this would be a bug
    return Promise.reject(new Error('Can only export collection for the active profile'));
  }

  const modRules = extractModRules(collection.rules, collection, mods, onError);

  const includedMods = (collection.rules as types.IModRule[])
    .map(rule => {
      if (rule.reference.id !== undefined) {
        return rule.reference.id;
      } else {
        const mod = util.findModByRef(rule.reference, mods);
        if (mod !== undefined) {
          return mod.id;
        }
        return undefined;
      }
    })
    .filter(id => id !== undefined);

  const missing = includedMods.find(modId => mods[modId] === undefined);
  if (missing !== undefined) {
    return Promise.reject(new Error('Can only export collections that are fully installed'));
  }

  const exts: IExtensionFeature[] = findExtensions(state, gameId);
  const extData: any = {};
  for (const ext of exts) {
    Object.assign(extData, await ext.generate(gameId, includedMods));
  }

  const gameSpecific = await generateGameSpecifics(state, gameId, stagingPath, includedMods, mods);

  const game = util.getGame(gameId);

  const collectionInfo: ICollectionInfo = {
    author: collection.attributes?.author ?? 'Anonymous',
    authorUrl: collection.attributes?.authorURL ?? '',
    name: util.renderModName(collection),
    description: collection.attributes?.shortDescription ?? '',
    domainName: (util as any).nexusGameId(game),
  };

  const res: ICollection = {
    info: collectionInfo,
    mods: await rulesToCollectionMods(collection, mods, stagingPath, game,
                                      collection.attributes?.collection ?? {},
                                      onProgress, onError),
    modRules,
    ...extData,
    ...gameSpecific,
  };

  return res;
}

function createRulesFromProfile(profile: types.IProfile,
                                mods: {[modId: string]: types.IMod},
                                existingRules: types.IModRule[],
                                existingId: string): types.IModRule[] {
  return Object.keys(profile.modState)
    .filter(modId => profile.modState[modId].enabled
                  && (mods[modId] !== undefined)
                  && (modId !== existingId)
                  // no nested collections allowed
                  && (mods[modId].type !== MOD_TYPE)
                  && (mods[modId].attributes['generated'] !== true))
    .map(modId => {
      // don't forget what we set up regarding version matching
      let versionMatch: string;

      const oldRule = existingRules
        .find(iter => util.testModReference(mods[modId], iter.reference));
      if ((oldRule !== undefined) && (oldRule.reference.versionMatch !== undefined)) {
        versionMatch = (oldRule.reference.versionMatch === '*')
          ? '*'
          : mods[modId].attributes.version;
      }

      return {
        type: 'requires',
        reference: {
          id: modId,
          archiveId: mods[modId].archiveId,
          versionMatch,
        },
      } as any;
    });
}

export function makeCollectionId(baseId: string): string {
  return `vortex_collection_${baseId}`;
}

function deduceCollectionAttributes(collection: types.IMod,
                                    mods: { [modId: string]: types.IMod })
                                    : ICollectionAttributes {

  const res: ICollectionAttributes = {
    installMode: {},
    instructions: {},
    source: {},
  };

  collection.rules.forEach(rule => {
    const mod = util.findModByRef(rule.reference, mods);
    if (mod === undefined) {
      throw new util.ProcessCanceled('included mod not found');
    }

    res.installMode[mod.id] = (rule.installerChoices !== undefined)
      ? 'choices'
      : (rule.fileList !== undefined)
      ? 'clone'
      : 'fresh';

    res.instructions[mod.id] = rule.downloadHint?.instructions;
    res.source[mod.id] = {
      type: rule.downloadHint?.mode ?? ((rule.reference.repo?.repository === 'nexus') ? 'nexus' : 'bundle'),
      url: rule.downloadHint?.url,
      instructions: rule.downloadHint?.instructions,
    };
  });

  return res;
}

/**
 * clone an existing collection
 * @returns on success, returns the new collection id. on failure, returns undefined,
 *          in that case an error notification has already been reported
 */
export async function cloneCollection(api: types.IExtensionApi,
                                      gameId: string,
                                      id: string,
                                      sourceId: string)
                                      : Promise<string> {
  const state = api.getState();
  const t = api.translate;

  const userInfo = state.persistent['nexus']?.userInfo;
  const mods = (state.persistent.mods[gameId] ?? {});
  const existingCollection: types.IMod = mods[sourceId];

  const ownCollection: boolean = existingCollection.attributes?.uploader === userInfo?.name;
  const name = 'Copy of ' + existingCollection.attributes?.name;

  const customFileName = ownCollection
    ? existingCollection.attributes?.customFileName
    : t('Copy of {{name}}', { replace: { name: existingCollection.attributes?.customFileName } });

  const mod: types.IMod = {
    id,
    type: MOD_TYPE,
    state: 'installed',
    attributes: {
      name,
      customFileName,
      version: ownCollection ? existingCollection.attributes?.version : '0',
      installTime: new Date(),
      author: userInfo?.name ?? 'Anonymous',
      editable: true,
      collectionId: ownCollection ? existingCollection.attributes?.collectionId : undefined,
      collection: deduceCollectionAttributes(existingCollection, mods),
    },
    installationPath: id,
    rules: existingCollection.rules,
  };

  try {
    await new Promise<void>((resolve, reject) => {
      api.events.emit('create-mod', gameId, mod, (error: Error) => {
        if (error !== null) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
    const deployPath = selectors.installPathForGame(state, gameId);
    const sourcePath = path.join(deployPath, sourceId);
    const clonePath = path.join(deployPath, id);
    const files: string[] = await fs.readdirAsync(sourcePath);
    for (const file of files) {
      await fs.copyAsync(path.join(sourcePath, file), path.join(clonePath, file));
    }

    return id;
  } catch (err) {
    api.showErrorNotification('Failed to clone collection', err);
    return undefined;
  }
}

export async function createCollection(api: types.IExtensionApi,
                                       gameId: string,
                                       id: string,
                                       name: string,
                                       rules: types.IModRule[]) {
  const state: types.IState = api.store.getState();

  const mod: types.IMod = {
    id,
    type: MOD_TYPE,
    state: 'installed',
    attributes: {
      name,
      version: '0',
      installTime: new Date(),
      author: state.persistent['nexus']?.userInfo?.name ?? 'Anonymous',
      editable: true,
    },
    installationPath: id,
    rules,
  };

  try {
    await new Promise<void>((resolve, reject) => {
      api.events.emit('create-mod', gameId, mod, (error: Error) => {
        if (error !== null) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

    const deployPath = selectors.installPathForGame(state, gameId);
    await fs.copyAsync(path.join(__dirname, 'fallback_tile.png'),
                       path.join(deployPath, id, 'assets', LOGO_NAME))
      .catch(err => api.showErrorNotification('Failed to install default collection logo', err));
  } catch (err) {
    api.showErrorNotification('Failed to create collection', err);
  }
}

function updateCollection(api: types.IExtensionApi,
                          gameId: string,
                          mod: types.IMod,
                          newRules: types.IModRule[]) {
  api.store.dispatch(actions.setModAttribute(gameId, mod.id, 'editable', true));

  const removedRules: types.IModRule[] = [];
  // remove rules not found in newRules
  util.batchDispatch(api.store, mod.rules.reduce((prev: Redux.Action[], rule: types.IModRule) => {
      if (newRules.find(iter => _.isEqual(rule, iter)) === undefined) {
        removedRules.push(rule);
        prev.push(actions.removeModRule(gameId, mod.id, rule));
      }
      return prev;
    }, []));
  // add rules not found in the old list

  util.batchDispatch(api.store, newRules.reduce((prev: Redux.Action[], rule: types.IModRule) => {
    if (mod.rules.find(iter => _.isEqual(rule, iter)) === undefined) {
      prev.push(actions.addModRule(gameId, mod.id, rule));
    }
    return prev;
  }, []));
}

export async function createCollectionFromProfile(api: types.IExtensionApi,
                                                  profileId: string)
    : Promise<{ id: string, name: string, updated: boolean }> {
  const state: types.IState = api.store.getState();
  const profile = state.persistent.profiles[profileId];

  const id = makeCollectionId(profileId);
  const name = `Collection: ${profile.name}`;
  const mod: types.IMod = state.persistent.mods[profile.gameId]?.[id];

  const rules = createRulesFromProfile(profile, state.persistent.mods[profile.gameId],
                                       mod?.rules ?? [], mod?.id);

  if (mod === undefined) {
    await createCollection(api, profile.gameId, id, name, rules);
  } else {
    updateCollection(api, profile.gameId, mod, rules);
  }

  return { id, name, updated: mod !== undefined };
}
