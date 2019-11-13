import { startEditModPack } from './actions/session';
import sessionReducer from './reducers/session';
import { IModPack } from './types/IModPack';
import InstallDriver from './util/InstallDriver';
import { makeModpackId } from './util/modpack';
import { bbProm } from './util/util';
import CollectionsPage from './views/CollectionPage';
import EditDialog from './views/EditDialog';
import InstallDialog from './views/InstallDialog';

import { MOD_TYPE } from './constants';
import { initFromProfile } from './modpackCreate';
import doExport from './modpackExport';
import { install, postprocessPack, testSupported } from './modpackInstall';

import * as PromiseBB from 'bluebird';

import * as path from 'path';
import { actions, fs, log, selectors, types, util } from 'vortex-api';

function isEditableModPack(state: types.IState, modIds: string[]): boolean {
  const gameMode = selectors.activeGameId(state);
  const mod = state.persistent.mods[gameMode][modIds[0]];
  if (mod === undefined) {
    return false;
  }
  return mod.type === MOD_TYPE;
}

function profileModpackExists(api: types.IExtensionApi, profileId: string) {
  const state = api.store.getState();
  const gameMode = selectors.activeGameId(state);
  const mods = state.persistent.mods[gameMode];
  return mods[makeModpackId(profileId)] !== undefined;
}

let driver: InstallDriver;

function init(context: types.IExtensionContext): boolean {
  context.registerReducer(['session', 'modpack'], sessionReducer);

  context.registerDialog('modpack-edit', EditDialog, () => ({
    onClose: () => context.api.store.dispatch(startEditModPack(undefined)),
    onExport: (modpackId: string) => doExport(context.api, modpackId),
  }));

  context.registerDialog('modpack-install', InstallDialog, () => ({
    driver,
  }));

  context.registerMainPage('collection', 'Collections', CollectionsPage, {
    hotkey: 'C',
    group: 'per-game',
  });

  context.registerModType(MOD_TYPE, 200, () => true,
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
      return mod.type === MOD_TYPE;
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
    driver = new InstallDriver(context.api);
    context.api.setStylesheet('modpacks', path.join(__dirname, 'style.scss'));

    context.api.events.on('did-install-mod', (gameId: string, archiveId: string, modId: string) => {
      // automatically enable modpacks once they're installed
      const { store } = context.api;
      const state: types.IState = store.getState();
      const profileId = selectors.lastActiveProfileForGame(state, gameId);
      const profile = selectors.profileById(state, profileId);
      if (profile === undefined) {
        return;
      }
      const mod = util.getSafe(state.persistent.mods, [gameId, modId], undefined);
      if ((mod !== undefined) && (mod.type === MOD_TYPE)) {
        driver.start(profile, mod);
      }
    });

    context.api.events.on('did-install-dependencies',
                          async (profileId: string, modId: string, recommendations: boolean) => {
      const { store } = context.api;
      const state: types.IState = store.getState();
      const profile = selectors.profileById(state, profileId);
      const stagingPath = selectors.installPathForGame(state, profile.gameId);
      const mods = state.persistent.mods[profile.gameId];
      const mod = mods[modId];
      if ((mod !== undefined) && (mod.type === MOD_TYPE)) {
        try {
          const modPackData = await fs.readFileAsync(
            path.join(stagingPath, mod.installationPath, 'modpack.json'),
            { encoding: 'utf-8' });
          const modpack: IModPack = JSON.parse(modPackData);
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
