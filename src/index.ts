import EditDialog from './views/EditDialog';

import { startEditModPack } from './actions/session';
import sessionReducer from './reducers/session';
import { modPackModToRule, modToPack } from './util/modpack';

import * as PromiseBB from 'bluebird';
global.Promise = Promise;

import Zip = require('node-7z');
import * as path from 'path';
import { fs, selectors, types, util } from 'vortex-api';
import { IModPack } from './types/IModPack';

function createRulesFromProfile(profile: types.IProfile,
                                mods: {[modId: string]: types.IMod}): types.IModRule[] {
  return Object.keys(profile.modState)
    .filter(modId => profile.modState[modId].enabled && (mods[modId] !== undefined))
    .map(modId => ({
      type: 'requires',
      reference: {
        id: modId,
      },
    }) as any);
}

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

function init(context: types.IExtensionContext): boolean {
  context.registerReducer(['session', 'modpack'], sessionReducer);
  context.registerDialog('modpack-edit', EditDialog, () => ({
    onClose: () => context.api.store.dispatch(startEditModPack(undefined)),
  }));
  context.registerModType('modpack', 200, () => true,
                          () => undefined, () => PromiseBB.resolve(false));
  context.registerAction('mods-action-icons', 50, 'modpack', {}, 'Export Modpack',
                         (modIds: string[]) => {
    const state: types.IState = context.api.store.getState();

    const notiId = context.api.sendNotification({
      type: 'activity',
      title: 'Building Modpack',
      message: '',
      progress: 0,
    });

    let notiPerc = 0;
    let notiText = '';

    const progress = (percent?: number, text?: string) => {
      let change = false;
      if ((percent !== undefined) && (percent > notiPerc)) {
        change = true;
        notiPerc = percent;
      }
      if ((text !== undefined) && (text !== notiText)) {
        change = true;
        notiText = text;
      }
      if (change) {
        context.api.sendNotification({
          id: notiId,
          type: 'activity',
          title: 'Building Modpack',
          progress: notiPerc,
          message: notiText,
        });
      }
    };

    generateModPack(state, modIds[0], progress)
      .then((zipPath: string) => {
        context.api.sendNotification({
          id: 'modpack-exported',
          title: 'Modpack exported',
          message: zipPath,
          type: 'success',
        });
      })
      .catch(err => {
        context.api.showErrorNotification('Failed to export modpack', err);
      })
      .finally(() => {
        context.api.dismissNotification(notiId);
      });
  }, (modIds: string[]) => isEditableModPack(context.api.store.getState(), modIds));
  context.registerAction('mods-action-icons', 25, '', {}, 'Edit Modpack',
                         (modIds: string[]) => {
      context.api.store.dispatch(startEditModPack(modIds[0]));
  }, (modIds: string[]) => isEditableModPack(context.api.store.getState(), modIds));

  context.registerAction('profile-actions', 150, 'highlight-lab', {}, 'Init Modpack',
    (profileIds: string[]) => {
      const state: types.IState = context.api.store.getState();
      const profile = state.persistent.profiles[profileIds[0]];

      const id = `vortex_modpack_${profile.id}`;
      const name = `Modpack: ${profile.name}`;

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
        rules: createRulesFromProfile(profile, state.persistent.mods[profile.gameId]),
      };

      context.api.events.emit('create-mod', profile.gameId, mod, (error: Error) => {
        if (error !== null) {
          context.api.showErrorNotification('Failed to create mod pack', error);
        }
      });
      context.api.sendNotification({
        type: 'success',
        id: 'modpack-created',
        title: 'Modpack created',
        message: name,
      });
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
