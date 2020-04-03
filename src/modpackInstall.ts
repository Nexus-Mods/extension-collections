import { IModPack } from './types/IModPack';
import { findModByRef } from './util/findModByRef';
import { parseGameSpecifics } from './util/gameSupport';
import { modPackModToRule } from './util/modpack';

import { MOD_TYPE } from './constants';

import * as path from 'path';
import { actions, fs, types } from 'vortex-api';

/**
 * supported test for use in registerInstaller
 */
export async function testSupported(files: string[], gameId: string)
    : Promise<types.ISupportedResult> {
  return {
    supported: files.indexOf('modpack.json') !== -1,
    requiredFiles: ['modpack.json'],
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
  const modPackData = await fs.readFileAsync(path.join(destinationPath, 'modpack.json'),
                                             { encoding: 'utf-8' });
  const modpack: IModPack = JSON.parse(modPackData);

  const filesToCopy = files
    .filter(filePath => !filePath.endsWith(path.sep));

  return Promise.resolve({
    instructions: [
      {
        type: 'attribute' as any,
        key: 'customFileName',
        value: modpack.info.name,
      },
      {
        type: 'attribute' as any,
        key: 'version',
        value: modpack.info.version,
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
      ...modpack.mods.map(mod => (
        {
          type: 'rule' as any,
          rule: modPackModToRule(mod),
        })),
    ],
  });
}

/**
 * postprocess a modpack. This is called after dependencies for the pack have been installed.
 * It may get called multiple times so it has to take care to not break if any data already
 * exists
 */
export async function postprocessPack(api: types.IExtensionApi,
                                      profile: types.IProfile,
                                      modpack: IModPack,
                                      mods: { [modId: string]: types.IMod }) {
  modpack.modRules.forEach(rule => {
    const sourceMod = findModByRef(rule.source, mods);
    if (sourceMod !== undefined) {
      api.store.dispatch(actions.addModRule(profile.gameId, sourceMod.id, rule));
    }
  });

  /* this is now done through the "extra" attribute in the mod rules
  modpack.mods.forEach(iter => {
    const rule = modPackModToRule(iter);
    const mod = findModByRef(rule.reference, mods);
    if (mod !== undefined) {
      if (mod.attributes['customFileName'] === undefined) {
        api.store.dispatch(
          actions.setModAttribute(profile.gameId, mod.id, 'customFileName', iter.name));
      }
      if (iter.details.type !== undefined) {
        api.store.dispatch(actions.setModType(profile.gameId, mod.id, iter.details.type));
      }
    }
  });
  */

  parseGameSpecifics(api, profile.gameId, modpack);
}
