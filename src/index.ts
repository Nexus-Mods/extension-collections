import { IModPack } from './types/IModPack';
import EditDialog from './views/EditDialog';

import { startEditModPack } from './actions/session';
import sessionReducer from './reducers/session';
import { makeModpackId } from './util/modpack';

import { initFromProfile } from './modpackCreate';
import doExport from './modpackExport';
import { install, postprocessPack, testSupported } from './modpackInstall';

import * as PromiseBB from 'bluebird';
global.Promise = Promise;

import * as path from 'path';
import { fs, log, selectors, types, util } from 'vortex-api';
import { bbProm } from './util/util';

function isEditableModPack(state: types.IState, modIds: string[]): boolean {
  const gameMode = selectors.activeGameId(state);
  const mod = state.persistent.mods[gameMode][modIds[0]];
  if (mod === undefined) {
    return false;
  }
  return mod.type === 'modpack';
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

  context.registerInstaller('modpack', 5, bbProm(testSupported), bbProm(install));

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
        try {
          postprocessPack(context.api, profile, modpack, mods);
        } catch (err) {
          log('info', 'Failed to apply mod rules from pack. This is normal if this is the '
            + 'platform where the pack has been created.');
        }
      }
    });

    return (util as any).installIconSet('modpacks', path.join(__dirname, 'icons.svg'));
  });
  return true;
}

export default init;
