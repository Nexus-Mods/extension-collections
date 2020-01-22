import { startEditModPack } from './actions/session';
import sessionReducer from './reducers/session';
import { IModPack } from './types/IModPack';
import InstallDriver from './util/InstallDriver';
import { createModpack, makeModpackId } from './util/modpack';
import { bbProm } from './util/util';
import CollectionsPage from './views/CollectionPage';
import EditDialog from './views/EditDialog';
import InstallDialog from './views/InstallDialog';

import { MOD_TYPE } from './constants';
import { initFromProfile } from './modpackCreate';
import { doExportToFile } from './modpackExport';
import { install, postprocessPack, testSupported } from './modpackInstall';

import * as PromiseBB from 'bluebird';
import * as path from 'path';
import { generate as shortid } from 'shortid';
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

function makeOnUnfulfilledRules(api: types.IExtensionApi) {
  return (profileId: string, modId: string, rules: types.IModRule[]): PromiseBB<boolean> => {
    const state: types.IState = api.store.getState();

    const profile = selectors.profileById(state, profileId);

    const collection = util.getSafe(state.persistent.mods, [profile.gameId, modId], undefined);

    if ((collection !== undefined)
        && (state.persistent.mods[profile.gameId][modId].type === MOD_TYPE)) {
      api.sendNotification({
        id: `collection-incomplete-${collection.id}`,
        type: 'info',
        title: 'Collection incomplete',
        message: util.renderModName(collection),
        actions: [
          {
            title: 'Resume',
            action: dismiss => {
              dismiss();
              api.events.emit('install-dependencies', profile.id, [collection.id], true);
            },
          }, {
            title: 'Disable',
            action: dismiss => {
              dismiss();
              api.store.dispatch(actions.setModEnabled(profile.id, modId, false));
            },
          },
        ],
      });
      return PromiseBB.resolve(true);
    } else {
      return PromiseBB.resolve(false);
    }
  };
}

let driver: InstallDriver;

function createCollection(api: types.IExtensionApi, profile: types.IProfile, name: string) {
  const id = makeModpackId(shortid());
  createModpack(api, profile.gameId, id, name, []);
  api.sendNotification({
    type: 'success',
    id: 'collection-created',
    title: 'Collection created',
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

function init(context: types.IExtensionContext): boolean {
  context.registerReducer(['session', 'modpack'], sessionReducer);

  context.registerDialog('modpack-edit', EditDialog, () => ({
    onClose: () => context.api.store.dispatch(startEditModPack(undefined)),
    onExport: (modpackId: string) => null,
  }));

  context.registerDialog('modpack-install', InstallDialog, () => ({
    driver,
  }));

  let collectionsCB: { [cbName: string]: (...args: any[]) => void };

  context.registerMainPage('collection', 'Collections', CollectionsPage, {
    hotkey: 'C',
    group: 'per-game',
    props: () => ({
      onSetupCallbacks: (callbacks: { [cbName: string]: (...args: any[]) => void }) => {
        collectionsCB = callbacks;
      },
      onCreateCollection: (profile: types.IProfile, name: string) =>
        createCollection(context.api, profile, name),
    }),
  });

  context.registerModType(MOD_TYPE, 200, () => true,
                          () => undefined, () => PromiseBB.resolve(false));

  context.registerAction('mods-action-icons', 50, 'collection-export', {}, 'Export Collection',
                         (modIds: string[]) => {
    const state = context.api.store.getState();
    const gameMode = selectors.activeGameId(state);
    doExportToFile(context.api, gameMode, modIds[0]);
  }, (modIds: string[]) => isEditableModPack(context.api.store.getState(), modIds));

  context.registerAction('mods-action-icons', 25, 'collection-edit', {}, 'Edit Collection',
                         (modIds: string[]) => {
    context.api.events.emit('show-main-page', 'Collections');
    // have to delay this a bit because the callbacks are only set up once the page
    // is first opened
    setTimeout(() => {
      if ((collectionsCB !== undefined) && (collectionsCB.editCollection !== undefined)) {
        collectionsCB.editCollection(modIds[0]);
      }
    }, 100);
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

  context.registerAction('profile-actions', 150, 'highlight-lab', {}, 'Init Collection',
    (profileIds: string[]) => {
      initFromProfile(context.api, profileIds[0]);
    }, (profileIds: string[]) => !profileModpackExists(context.api, profileIds[0]));

  context.registerAction('profile-actions', 150, 'highlight-lab', {}, 'Update collection',
    (profileIds: string[]) => {
      initFromProfile(context.api, profileIds[0]);
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
          log('info', 'Failed to apply mod rules from collection. This is normal if this is the '
            + 'platform where the collection has been created.');
        }
      }
    });

    context.api.onAsync('unfulfilled-rules', makeOnUnfulfilledRules(context.api));

    context.api.events.on('edit-collection', collectionId => {
      context.api.events.emit('show-main-page', 'Collections');
      // have to delay this a bit because the callbacks are only set up once the page
      // is first opened
      setTimeout(() => {
        if ((collectionsCB !== undefined) && (collectionsCB.editCollection !== undefined)) {
          collectionsCB.editCollection(collectionId);
        }
      }, 100);
    });

    return util.installIconSet('modpacks', path.join(__dirname, 'icons.svg'));
  });
  return true;
}

export default init;
