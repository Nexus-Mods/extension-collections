import { ICollection, ICollectionTool } from './types/ICollection';

import { findExtensions, IExtensionFeature } from './util/extension';
import { parseGameSpecifics } from './util/gameSupport';
import { collectionModToRule } from './util/transformCollection';

import { BUNDLED_PATH, MOD_TYPE } from './constants';

import * as path from 'path';
import { generate as shortid } from 'shortid';
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

interface ICollectionToolEx extends ICollectionTool {
  id?: string;
}

async function setUpTools(api: types.IExtensionApi,
                          gameId: string,
                          tools: ICollectionTool[])
                          : Promise<void> {
  const knownTools = api.getState().settings.gameMode.discovered[gameId].tools;

  // create tools right away to prevent race conditions in case this is invoked multiple times,
  // icons are generated later, if necessary

  const normalize = (input: string) => path.normalize(input.toUpperCase());

  const addTools: ICollectionToolEx[] = (tools ?? []).filter(tool => Object.values(knownTools ?? {})
      .find(iter => (normalize(iter.path) === normalize(tool.exe))
                 || (iter.name === tool.name)) === undefined);

  const addActions = addTools.map(tool => {
    tool.id = shortid();

    return actions.addDiscoveredTool(gameId, tool.id, {
      id: tool.id,
      path: tool.exe,
      name: tool.name,

      requiredFiles: [],
      executable: null,
      parameters: tool.args,
      environment: tool.env,
      workingDirectory: tool.cwd,
      shell: tool.shell,
      detach: tool.detach,
      onStart: tool.onStart,
      custom: true,
      hidden: true,
    }, true);
  });

  // this has to happen before we extract icons, otherwise we might create duplicates
  util.batchDispatch(api.store, addActions);

  await Promise.all(addTools.map(async tool => {
    if (path.extname(tool.exe) === '.exe') {
      const iconPath = util.StarterInfo.toolIconRW(gameId, tool.id);
      await fs.ensureDirWritableAsync(path.dirname(iconPath), () => Promise.resolve());
      await util['extractExeIcon'](tool.exe, iconPath);
    }
  }));

  util.batchDispatch(api.store, addTools.map(tool =>
    actions.setToolVisible(gameId, tool.id, true)));
}

/**
 * postprocess a collection. This is called after dependencies for the pack have been installed.
 * It may get called multiple times so it has to take care to not break if any data already
 * exists
 */
export async function postprocessCollection(api: types.IExtensionApi,
                                            profile: types.IProfile,
                                            collection: ICollection,
                                            mods: { [modId: string]: types.IMod }) {
  log('info', 'postprocess collection');
  applyCollectionRules(api, profile.gameId, collection, mods);

  await setUpTools(api, profile.gameId, collection.tools);

  const exts: IExtensionFeature[] = findExtensions(api.getState(), profile.gameId);

  for (const ext of exts) {
    await ext.parse(profile.gameId, collection);
  }

  await parseGameSpecifics(api, profile.gameId, collection);
}
