import { IModPack } from './types/IModPack';
import findModByRef from './util/findModByRef';
import EditDialog from './views/EditDialog';

import { startEditModPack } from './actions/session';
import sessionReducer from './reducers/session';
import { createModpackFromProfile, makeModpackId, modPackModToRule,
         modToPack } from './util/modpack';
import { makeProgressFunction } from './util/util';

import * as PromiseBB from 'bluebird';
global.Promise = Promise;

import Zip = require('node-7z');
import * as path from 'path';
import { actions, fs, selectors, types, util } from 'vortex-api';

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
  try {
    await fs.copyAsync(path.join(modPath, 'INI Tweaks'), path.join(outputPath, 'INI Tweaks'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw  err;
    } // else: no ini tweak, no problem
  }
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

  const filesToCopy = files
    .filter(filePath => !filePath.endsWith(path.sep));

  return Promise.resolve({
    instructions: [
      {
        type: 'setmodtype' as any,
        value: 'modpack',
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

function bbProm<T>(func: (...args: any[]) => Promise<T>): (...args: any[]) => PromiseBB<T> {
  return (...args: any[]) => PromiseBB.resolve(func(...args));
}

function isEditableModPack(state: types.IState, modIds: string[]): boolean {
  const gameMode = selectors.activeGameId(state);
  const mod = state.persistent.mods[gameMode][modIds[0]];
  if (mod === undefined) {
    return false;
  }
  return mod.type === 'modpack';
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
          actions: [
            { title: 'Open', action: () => {
              const stagingPath = selectors.installPath(state);
              const gameMode = selectors.activeGameId(state);
              const mods = state.persistent.mods[gameMode];
              const mod: types.IMod = mods[modId];
              util.opn(path.join(stagingPath, mod.installationPath)).catch(() => null);
            } },
          ],
        });
      })
      .catch(err => {
        api.showErrorNotification('Failed to export modpack', err);
      })
      .finally(() => {
        progressEnd();
      });
}

function initFromProfile(api: types.IExtensionApi, profileId: string, update: boolean) {
  const { id, name } = createModpackFromProfile(api, profileId);
  api.sendNotification({
    type: 'success',
    id: 'modpack-created',
    title: update ? 'Modpack updated' : 'Modpack created',
    message: name,
    actions: [
      {
        title: 'Configure',
        action: dismiss => {
          api.store.dispatch(startEditModPack(id));
          dismiss();
        },
      },
    ],
  });
}

function profileModpackExists(api: types.IExtensionApi, profileId: string) {
  const state = api.store.getState();
  const gameMode = selectors.activeGameId(state);
  const mods = state.persistent.mods[gameMode];
  return mods[makeModpackId(profileId)] !== undefined;
}

function init(context: types.IExtensionContext): boolean {
  context.registerReducer(['session', 'modpack'], sessionReducer);

  context.registerDialog('modpack-edit', EditDialog, () => ({
    onClose: () => context.api.store.dispatch(startEditModPack(undefined)),
    onExport: (modpackId: string) => doExport(context.api, modpackId),
  }));

  context.registerModType('modpack', 200, () => true,
                          () => undefined, () => PromiseBB.resolve(false));

  context.registerAction('mods-action-icons', 50, 'modpack-export', {}, 'Export Modpack',
                         (modIds: string[]) => {
    doExport(context.api, modIds[0]);
  }, (modIds: string[]) => isEditableModPack(context.api.store.getState(), modIds));

  context.registerAction('mods-action-icons', 25, 'modpack-edit', {}, 'Edit Modpack',
                         (modIds: string[]) => {
      context.api.store.dispatch(startEditModPack(modIds[0]));
  }, (modIds: string[]) => isEditableModPack(context.api.store.getState(), modIds));

  context.registerAction('mods-action-icons', 75, 'start-install', {}, 'Install Optional Mods...',
                         (modIds: string[]) => {
      const state = context.api.store.getState();
      const profile: types.IProfile = selectors.activeProfile(state);
      context.api.events.emit('install-recommendations', profile.id, modIds);
    }, (modIds: string[]) => {
      const state = context.api.store.getState();
      const gameMode = selectors.activeGameId(state);
      const mod = state.persistent.mods[gameMode][modIds[0]];
      if (mod === undefined) {
        return false;
      }
      return mod.type === 'modpack';
    });

  context.registerAction('profile-actions', 150, 'highlight-lab', {}, 'Init Modpack',
    (profileIds: string[]) => {
      initFromProfile(context.api, profileIds[0], false);
    }, (profileIds: string[]) => !profileModpackExists(context.api, profileIds[0]));

  context.registerAction('profile-actions', 150, 'highlight-lab', {}, 'Update Modpack',
    (profileIds: string[]) => {
      initFromProfile(context.api, profileIds[0], true);
    }, (profileIds: string[]) => profileModpackExists(context.api, profileIds[0]));

  context.registerInstaller('modpack', 5, testSupported, bbProm(install));

  context.once(() => {
    context.api.setStylesheet('modpacks', path.join(__dirname, 'style.scss'));

    context.api.events.on('did-install-dependencies',
                          async (profileId: string, modId: string, recommendations: boolean) => {
      const { store } = context.api;
      const state: types.IState = store.getState();
      const profile = selectors.profileById(state, profileId);
      const stagingPath = selectors.installPathForGame(state, profile.gameId);
      const mods = state.persistent.mods[profile.gameId];
      const mod = mods[modId];
      if ((mod !== undefined) && (mod.type === 'modpack')) {
        const modPackData = await fs.readFileAsync(
          path.join(stagingPath, mod.installationPath, 'modpack.json'),
          { encoding: 'utf-8' });
        const modpack: IModPack = JSON.parse(modPackData);
        modpack.modRules.forEach(rule => {
          const sourceMod = findModByRef(rule.source, mods);
          if (sourceMod !== undefined) {
            store.dispatch(actions.addModRule(profile.gameId, sourceMod.id, rule));
          }
        });
      }
    });

    return (util as any).installIconSet('modpacks', path.join(__dirname, 'icons.svg'));
  });
  return true;
}

export default init;
