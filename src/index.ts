import EditDialog from './views/EditDialog';

import { startEditModPack } from './actions/session';
import sessionReducer from './reducers/session';
import { createModpackFromProfile, modPackModToRule, modToPack } from './util/modpack';
import { makeProgressFunction } from './util/util';

import * as PromiseBB from 'bluebird';
global.Promise = Promise;

import Zip = require('node-7z');
import * as path from 'path';
import { fs, selectors, types, util } from 'vortex-api';
import { IModPack } from './types/IModPack';

async function zip(zipPath: string, sourcePath: string): Promise<void> {
  const zipper = new Zip();
  const files = await fs.readdirAsync(sourcePath);
  await zipper.add(zipPath, files.map(fileName => path.join(sourcePath, fileName)));
}

async function generateModPack(state: types.IState, modId: string,
                               progress: (percent: number, text: string) => void): Promise<string> {
  const gameMode = selectors.activeGameId(state);
  const mods = state.persistent.mods[gameMode];
  const mod: types.IMod = mods[modId];
  const stagingPath = selectors.installPath(state);
  const modPath = path.join(stagingPath, mod.installationPath);
  const outputPath = path.join(modPath, 'build');
  await fs.ensureDirWritableAsync(outputPath, () => PromiseBB.resolve());
  await fs.writeFileAsync(path.join(outputPath, 'modpack.json'),
    JSON.stringify(await modToPack(gameMode, stagingPath, mod, mods, progress), undefined, 2));
  const zipPath = path.join(modPath,
                            `modpack_${util.getSafe(mod.attributes, ['version'], '1.0.0')}.7z`);
  await zip(zipPath, outputPath);
  await fs.removeAsync(outputPath);
  return zipPath;
}

function testSupported(files: string[], gameId: string): PromiseBB<types.ISupportedResult> {
  return PromiseBB.resolve({
    supported: files.indexOf('modpack.json') !== -1,
    requiredFiles: ['modpack.json'],
  });
}

async function install(files: string[],
                       destinationPath: string,
                       gameId: string,
                       progressDelegate: types.ProgressDelegate): Promise<types.IInstallResult> {
  const modPackData = await fs.readFileAsync(path.join(destinationPath, 'modpack.json'),
                                             { encoding: 'utf-8' });
  const modpack: IModPack = JSON.parse(modPackData);

  return Promise.resolve({
    instructions: [
      {
        type: 'setmodtype' as any,
        value: 'modpack',
      },
      ...modpack.mods.map(mod => (
        {
          type: 'rule' as any,
          value: 'requires',
          rule: modPackModToRule(mod),
        })),
    ],
  });
}

function bbProm<T>(func: (...args: any[]) => Promise<T>): (...args: any[]) => PromiseBB<T> {
  return (...args: any[]) => PromiseBB.resolve(func(...args));
}

function isEditableModPack(state: types.IState, modIds: string[]): boolean {
  const gameMode = selectors.activeGameId(state);
  return state.persistent.mods[gameMode][modIds[0]].type === 'modpack';
}

function doExport(api: types.IExtensionApi, modId: string) {
    const state: types.IState = api.store.getState();

    const { progress, progressEnd } = makeProgressFunction(api);

    generateModPack(state, modId, progress)
      .then((zipPath: string) => {
        api.sendNotification({
          id: 'modpack-exported',
          title: 'Modpack exported',
          message: zipPath,
          type: 'success',
        });
      })
      .catch(err => {
        api.showErrorNotification('Failed to export modpack', err);
      })
      .finally(() => {
        progressEnd();
      });

}

function init(context: types.IExtensionContext): boolean {
  context.registerReducer(['session', 'modpack'], sessionReducer);
  context.registerDialog('modpack-edit', EditDialog, () => ({
    onClose: () => context.api.store.dispatch(startEditModPack(undefined)),
  }));
  context.registerModType('modpack', 200, () => true,
                          () => undefined, () => PromiseBB.resolve(false));
  context.registerAction('mods-action-icons', 50, 'modpack', {}, 'Export Modpack',
                         (modIds: string[]) => {
    doExport(context.api, modIds[0]);
  }, (modIds: string[]) => isEditableModPack(context.api.store.getState(), modIds));

  context.registerAction('mods-action-icons', 25, '', {}, 'Edit Modpack',
                         (modIds: string[]) => {
      context.api.store.dispatch(startEditModPack(modIds[0]));
  }, (modIds: string[]) => isEditableModPack(context.api.store.getState(), modIds));

  context.registerAction('profile-actions', 150, 'highlight-lab', {}, 'Init Modpack',
    (profileIds: string[]) => {
      createModpackFromProfile(context.api, profileIds[0]);
    }, (profileIds: string[]) => {
      return true;
    });

  context.registerInstaller('modpack', 5, testSupported, bbProm(install));

  context.once(() => {
    context.api.setStylesheet('modpacks', path.join(__dirname, 'style.scss'));
  });
  return true;
}

export default init;
