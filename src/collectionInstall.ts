import { ICollection, ICollectionTool } from './types/ICollection';

import { findExtensions, IExtensionFeature } from './util/extension';
import { parseGameSpecifics } from './util/gameSupport';
import { collectionModToRule } from './util/transformCollection';

import { BUNDLED_PATH, MOD_TYPE } from './constants';

import * as path from 'path';
import { actions, fs, log, selectors, types, util } from 'vortex-api';

/**
 * supported test for use in registerInstaller
 */
export async function testSupported(files: string[], gameId: string)
    : Promise<types.ISupportedResult> {
  return {
    supported: files.indexOf('collection.json') !== -1,
    requiredFiles: ['collection.json'],
  };
}

/**
 * installer function to be used with registerInstaller
 */
export function makeInstall(api: types.IExtensionApi) {
  return async (files: string[],
                destinationPath: string,
                gameId: string,
                progressDelegate: types.ProgressDelegate)
                : Promise<types.IInstallResult> => {
    const collectionData = await fs.readFileAsync(path.join(destinationPath, 'collection.json'),
      { encoding: 'utf-8' });

    const collection: ICollection = JSON.parse(collectionData);

    /*
    if (!isIModPack(modpack)) {
      const errorText = isIModPack.errors.length > 10
        ? ajv.errorsText(isIModPack.errors.slice(0, 10)) + '...'
        : ajv.errorsText(isIModPack.errors);

      log('warn', 'invalid mod pack', { errorText });
      return Promise.reject(new Error('invalid modpack (see log for details)'));
    }
    */

    const filesToCopy = files
      .filter(filePath => !filePath.endsWith(path.sep)
        && (filePath.split(path.sep)[0] !== BUNDLED_PATH));

    const bundled = files
      .filter(filePath => !filePath.endsWith(path.sep)
        && (filePath.split(path.sep)[0] === BUNDLED_PATH));

    const knownGames = selectors.knownGames(api.getState());

    // Attempt to get the download for this collection to resolve the collection's name
    //  which may have been modified on the website and is therefore different than the value
    //  in the json file.
    // We reverse the downloads array as it's likely that the user just downloaded this
    //  from the website and therefore the download entry is somewhere at the bottom.
    // (pointless optimisation ?)
    const state = api.getState();
    const downloads = Object.values(state.persistent.downloads.files).reverse();
    const collectionDownload = downloads.find(down =>
      path.basename(destinationPath, '.installing') === path.basename(down.localPath, path.extname(down.localPath)));

    return Promise.resolve({
      instructions: [
        {
          type: 'attribute' as any,
          key: 'customFileName',
          value: (collectionDownload?.modInfo?.name !== undefined)
            ? collectionDownload.modInfo.name
            : collection.info.name,
        },
        {
          type: 'setmodtype' as any,
          value: MOD_TYPE,
        },
        ...filesToCopy.map(filePath => ({
          type: 'copy' as any,
          source: filePath,
          destination: filePath,
        })),
        ...bundled.map(filePath => ({
          type: 'copy' as any,
          source: filePath,
          destination: filePath,
        })),
        ...collection.mods.map(mod => (
          {
            type: 'rule' as any,
            rule: collectionModToRule(knownGames, mod),
          })),
      ],
    });
  };
}

function applyCollectionRules(api: types.IExtensionApi,
                              gameId: string,
                              collection: ICollection,
                              mods: { [modId: string]: types.IMod }) {
  util.batchDispatch(api.store, (collection.modRules ?? []).reduce((prev, rule) => {
    const sourceMod = util.findModByRef(rule.source, mods);
    if (sourceMod !== undefined) {
      log('info', 'add collection rule',
          { gameId, sourceMod: sourceMod.id, rule: JSON.stringify(rule) });
      prev.push(actions.addModRule(gameId, sourceMod.id, rule));
    }
    return prev;
  }, []));
}

/**
 * postprocess a collection. This is called after dependencies for the pack have been installed.
 * It may get called multiple times so it has to take care to not break if any data already
 * exists
 */
export async function postprocessCollection(api: types.IExtensionApi,
                                            profile: types.IProfile,
                                            collectionMod: types.IMod,
                                            collection: ICollection,
                                            mods: { [modId: string]: types.IMod }) {
  log('info', 'postprocess collection');
  applyCollectionRules(api, profile.gameId, collection, mods);

  const exts: IExtensionFeature[] = findExtensions(api.getState(), profile.gameId);

  for (const ext of exts) {
    await ext.parse(profile.gameId, collection, collectionMod);
  }

  await parseGameSpecifics(api, profile.gameId, collection);
}
