import { ICollection } from './types/IModPack';

import { findModByRef } from './util/findModByRef';
import { parseGameSpecifics } from './util/gameSupport';
import { collectionModToRule } from './util/modpack';

import { BUNDLED_PATH, MOD_TYPE } from './constants';

import * as path from 'path';
import { actions, fs, log, types } from 'vortex-api';

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
export async function install(files: string[],
                              destinationPath: string,
                              gameId: string,
                              progressDelegate: types.ProgressDelegate)
                              : Promise<types.IInstallResult> {
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

  return Promise.resolve({
    instructions: [
      {
        type: 'attribute' as any,
        key: 'customFileName',
        value: collection.info.name,
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
        destination: path.basename(filePath),
        section: 'download',
      })),
      ...collection.mods.map(mod => (
        {
          type: 'rule' as any,
          rule: collectionModToRule(mod),
        })),
    ],
  });
}

/**
 * postprocess a modpack. This is called after dependencies for the pack have been installed.
 * It may get called multiple times so it has to take care to not break if any data already
 * exists
 */
export async function postprocessCollection(api: types.IExtensionApi,
                                            profile: types.IProfile,
                                            collection: ICollection,
                                            mods: { [modId: string]: types.IMod }) {
  collection.modRules.forEach(rule => {
    const sourceMod = findModByRef(rule.source, mods);
    if (sourceMod !== undefined) {
      api.store.dispatch(actions.addModRule(profile.gameId, sourceMod.id, rule));
    }
  });

  parseGameSpecifics(api, profile.gameId, collection);
}
