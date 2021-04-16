import { startEditCollection } from './actions/session';
import persistentReducer from './reducers/persistent';
import sessionReducer from './reducers/session';
import { ICollection } from './types/ICollection';
import InstallDriver from './util/InstallDriver';
import { createCollection, makeCollectionId } from './util/transformCollection';
import { bbProm, getUnfulfilledNotificationId } from './util/util';
import AddModsDialog from './views/AddModsDialog';
import CollectionsMainPage from './views/CollectionPage';
// import EditDialog from './views/EditDialog';
import InstallDialog from './views/InstallDialog';

import { MOD_TYPE } from './constants';
import {
  addCollectionAction, addCollectionCondition,
  alreadyIncluded,
  initFromProfile,
  removeCollectionAction, removeCollectionCondition
} from './collectionCreate';
import { doExportToFile } from './collectionExport';
import { install, postprocessCollection, testSupported } from './collectionInstall';

import * as PromiseBB from 'bluebird';
import memoize from 'memoize-one';
import * as path from 'path';
import * as React from 'react';
import { generate as shortid } from 'shortid';
import { pathToFileURL } from 'url';
import { actions, fs, log, OptionsFilter, selectors, types, util } from 'vortex-api';

function isEditableCollection(state: types.IState, modIds: string[]): boolean {
  const gameMode = selectors.activeGameId(state);
  const mod = state.persistent.mods[gameMode][modIds[0]];
  if (mod === undefined) {
    return false;
  }
  return util.getSafe(mod.attributes, ['editable'], false);
}

function profileCollectionExists(api: types.IExtensionApi, profileId: string) {
  const state = api.store.getState();
  const gameMode = selectors.activeGameId(state);
  const mods = state.persistent.mods[gameMode];
  return mods[makeCollectionId(profileId)] !== undefined;
}

function onlyLocalRules(rule: types.IModRule) {
  return ['requires', 'recommends'].includes(rule.type)
    && (rule.reference.fileExpression === undefined)
    && (rule.reference.fileMD5 === undefined)
    && (rule.reference.logicalFileName === undefined)
    && (rule.reference.repo === undefined);
}

function makeOnUnfulfilledRules(api: types.IExtensionApi) {
  return (profileId: string, modId: string, rules: types.IModRule[]): PromiseBB<boolean> => {
    const state: types.IState = api.store.getState();

    const profile = selectors.profileById(state, profileId);

    const collection: types.IMod =
      util.getSafe(state.persistent.mods, [profile.gameId, modId], undefined);

    if ((collection !== undefined)
        && (state.persistent.mods[profile.gameId][modId].type === MOD_TYPE)) {

      const collectionProfile = Object.keys(state.persistent.profiles)
        .find(iter => makeCollectionId(iter) === modId);

      const notiActions = [{
        title: 'Disable',
        action: dismiss => {
          dismiss();
          api.store.dispatch(actions.setModEnabled(profile.id, modId, false));
        },
      }];

      if (collectionProfile !== undefined) {
        // with local collections that we sync with a profile, we wouldn't be able to
        // installing the missing dependencies because the dependencies are referenced via
        // their local id
        notiActions.unshift({
          title: 'Update',
          action: dismiss => {
            initFromProfile(api, collectionProfile)
              .then(dismiss)
              .catch(err => api.showErrorNotification('Failed to update collection', err));
          }
        });
      } else {
        notiActions.unshift({
          title: 'Resume',
          action: dismiss => {
            dismiss();
            const localRules = collection.rules.filter(onlyLocalRules);
            localRules.forEach(rule => {
              api.store.dispatch(actions.removeModRule(profile.gameId, modId, rule));
            });
            api.events.emit('install-dependencies', profile.id, [collection.id], true);
            api.store.dispatch(actions.setOpenMainPage('Collections', false));
          }
        });
      }

      api.sendNotification({
        id: getUnfulfilledNotificationId(collection.id),
        type: 'info',
        title: 'Collection incomplete',
        message: util.renderModName(collection),
        actions: notiActions,
      });
      return PromiseBB.resolve(true);
    } else {
      return PromiseBB.resolve(false);
    }
  };
}

let driver: InstallDriver;

function createNewCollection(api: types.IExtensionApi, profile: types.IProfile, name: string) {
  const id = makeCollectionId(shortid());
  createCollection(api, profile.gameId, id, name, []);
  api.sendNotification({
    type: 'success',
    id: 'collection-created',
    title: 'Collection created',
    message: name,
    actions: [
      {
        title: 'Configure',
        action: dismiss => {
          api.store.dispatch(startEditCollection(id));
          dismiss();
        },
      },
    ],
  });
}

function genAttributeExtractor(api: types.IExtensionApi) {
  // tslint:disable-next-line:no-shadowed-variable
  return (modInfo: any, modPath: string): PromiseBB<{ [key: string]: any }> => {
    const collectionId = modInfo.download?.modInfo?.nexus?.ids?.collectionId;
    const revisionNumber = modInfo.download?.modInfo?.nexus?.ids?.revisionNumber;
    const referenceTag = modInfo.download?.modInfo?.referenceTag;

    const result: { [key: string]: any } = {
      collectionId,
      revisionNumber,
      referenceTag,
    };

    return PromiseBB.resolve(result);
  };
}

function generateCollectionMap(mods: { [modId: string]: types.IMod })
    : { [modId: string]: types.IMod[] } {
  const collections = Object.values(mods).filter(mod => mod.type === MOD_TYPE);

  const result: { [modId: string]: types.IMod[] } = {};

  collections.forEach(coll => coll.rules.forEach(rule => {
    if (rule.reference.id !== undefined) {
      util.setdefault(result, rule.reference.id, []).push(coll);
    }
  }));

  return result;
}

function generateCollectionOptions(mods: { [modId: string]: types.IMod })
    : Array<{ label: string, value: string }> {
  return Object.values(mods)
    .filter(mod => mod.type === MOD_TYPE)
    .map(mod => ({ label: util.renderModName(mod), value: mod.id }));
}

interface ICallbackMap { [cbName: string]: (...args: any[]) => void; }

function register(context: types.IExtensionContext,
                  onSetCallbacks: (callbacks: ICallbackMap) => void) {
  let collectionsCB: ICallbackMap;

  context.registerReducer(['session', 'collections'], sessionReducer);
  context.registerReducer(['persistent', 'collections'], persistentReducer);

  context.registerDialog('collection-install', InstallDialog, () => ({
    driver,
  }));

  context.registerDialog('add-mod-to-collection', AddModsDialog, () => ({
    onAddSelection: (collectionId: string, modIds: string[]) => {
      const state = context.api.getState();
      const gameId = selectors.activeGameId(state);
      const collection = state.persistent.mods[gameId][collectionId];

      modIds.forEach(modId => {
        if (!alreadyIncluded(collection.rules, modId)) {
          context.api.store.dispatch(actions.addModRule(gameId, collectionId, {
            type: 'requires',
            reference: {
              id: modId,
            },
          }));
        }
      });
    },
  }));

  context.registerMainPage('collection', 'Collections', CollectionsMainPage, {
    hotkey: 'C',
    group: 'per-game',
    visible: () => selectors.activeGameId(context.api.store.getState()) !== undefined,
    props: () => ({
      driver,
      onSetupCallbacks: (callbacks: ICallbackMap) => {
        collectionsCB = callbacks;
        onSetCallbacks(callbacks);
      },
      onCreateCollection: (profile: types.IProfile, name: string) =>
        createNewCollection(context.api, profile, name),
    }),
  });

  context.registerModType(MOD_TYPE, 200, () => true,
    () => undefined, () => PromiseBB.resolve(false), {
    name: 'Collection',
    customDependencyManagement: true,
    noConflicts: true,
  } as any);

  const state: () => types.IState = () => context.api.store.getState();

  const collectionsMap = () =>
    memoize(generateCollectionMap)(state().persistent.mods[selectors.activeGameId(state())] ?? {});
  const collectionOptions = memoize(generateCollectionOptions);

  let collectionChangedCB: () => void;

  const collectionChanged = new util.Debouncer(() => {
    collectionChangedCB?.();
    return null;
  }, 500);

  const collectionAttribute: types.ITableAttribute<types.IMod> = {
    id: 'collection',
    name: 'Collection',
    description: 'Collection(s) this mod was installed from (if any)',
    icon: 'collection',
    placement: 'both',
    customRenderer: (mod: types.IMod) => {
      const collections = collectionsMap()[mod.id];
      const collectionsString = (collections === undefined)
        ? '' : collections.map(iter => util.renderModName(iter)).join(', ');

      return React.createElement('div', {}, collectionsString);
    },
    calc: (mod: types.IMod) => {
      const collections = collectionsMap()[mod.id];
      return (collections === undefined)
        ? '' : collections.map(iter => iter.id);
    },
    externalData: (onChanged: () => void) => {
      collectionChangedCB = onChanged;
    },
    isToggleable: true,
    edit: {},
    filter: new OptionsFilter((() =>
      collectionOptions(state().persistent.mods[selectors.activeGameId(state())])) as any,
      false, false),
    isGroupable: true,
    groupName: (modId: string) =>
      util.renderModName(state().persistent.mods[selectors.activeGameId(state())][modId]),
    isDefaultVisible: false,
  };
  context.registerTableAttribute('mods', collectionAttribute);

  context.registerAction('mods-action-icons', 50, 'collection-export', {}, 'Export Collection',
    (modIds: string[]) => {
      const gameMode = selectors.activeGameId(state());
      doExportToFile(context.api, gameMode, modIds[0]);
    }, (modIds: string[]) => isEditableCollection(state(), modIds));

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
    }, (modIds: string[]) => isEditableCollection(context.api.store.getState(), modIds));

  context.registerAction('mods-action-icons', 75, 'start-install', {}, 'Install Optional Mods...',
    (modIds: string[]) => {
      const profile: types.IProfile = selectors.activeProfile(state());
      context.api.events.emit('install-recommendations', profile.id, modIds);
    }, (modIds: string[]) => {
      const gameMode = selectors.activeGameId(state());
      const mod = state().persistent.mods[gameMode][modIds[0]];
      if (mod === undefined) {
        return false;
      }
      return mod.type === MOD_TYPE;
    });

  context.registerAction('profile-actions', 150, 'highlight-lab', {}, 'Init Collection',
    (profileIds: string[]) => {
      initFromProfile(context.api, profileIds[0])
        .catch(err => context.api.showErrorNotification('Failed to init collection', err));
    }, (profileIds: string[]) => !profileCollectionExists(context.api, profileIds[0]));

  context.registerAction('profile-actions', 150, 'highlight-lab', {}, 'Update Collection',
    (profileIds: string[]) => {
      initFromProfile(context.api, profileIds[0])
        .catch(err => context.api.showErrorNotification('Failed to update collection', err));
    }, (profileIds: string[]) => profileCollectionExists(context.api, profileIds[0]));

  context.registerAction('mods-action-icons', 300, 'collection', {}, 'Add to Collection...',
    (instanceIds: string[]) => addCollectionAction(context.api, instanceIds)
        .then(() => collectionChanged.schedule())
        .catch(err => context.api.showErrorNotification('failed to add mod to collection', err)),
    (instanceIds: string[]) => addCollectionCondition(context.api, instanceIds));
  context.registerAction('mods-multirow-actions', 300, 'collection', {}, 'Add to Collection...',
    (instanceIds: string[]) => addCollectionAction(context.api, instanceIds)
        .then(() => collectionChanged.schedule())
        .catch(err => context.api.showErrorNotification('failed to add mod to collection', err)),
    (instanceIds: string[]) => addCollectionCondition(context.api, instanceIds));

  context.registerAction('mods-action-icons', 300, 'collection', {}, 'Remove from Collection...',
    (instanceIds: string[]) => removeCollectionAction(context.api, instanceIds)
        .then(() => collectionChanged.schedule())
        .catch(err => context.api.showErrorNotification('failed to add mod to collection', err)),
    (instanceIds: string[]) => removeCollectionCondition(context.api, instanceIds));
  context.registerAction('mods-multirow-actions', 300, 'collection', {}, 'Remove from Collection...',
    (instanceIds: string[]) => removeCollectionAction(context.api, instanceIds)
        .then(() => collectionChanged.schedule())
        .catch(err => context.api.showErrorNotification('failed to add mod to collection', err)),
    (instanceIds: string[]) => removeCollectionCondition(context.api, instanceIds));

  context.registerAttributeExtractor(100, genAttributeExtractor(context.api));

  context.registerInstaller('collection', 5, bbProm(testSupported), bbProm(install));
}

function once(api: types.IExtensionApi, collectionsCB: () => ICallbackMap) {
  const { store } = api;

  driver = new InstallDriver(api);

  driver.onUpdate(() => {
    // currently no UI associated with the start step
    if (driver.step === 'start') {
      driver.continue();
    }
  });

  api.setStylesheet('modpacks', path.join(__dirname, 'style.scss'));

  const state: () => types.IState = () => store.getState();

  api.events.on('did-install-mod', (gameId: string, archiveId: string, modId: string) => {
    // automatically enable collections once they're installed
    const profileId = selectors.lastActiveProfileForGame(state(), gameId);
    const profile = selectors.profileById(state(), profileId);
    if (profile === undefined) {
      return;
    }
    const mod = util.getSafe(state().persistent.mods, [gameId, modId], undefined);
    if ((mod !== undefined) && (mod.type === MOD_TYPE)) {
      driver.query(profile, mod);
    }
  });

  api.events.on('did-install-dependencies',
    async (profileId: string, modId: string, recommendations: boolean) => {
      const profile = selectors.profileById(state(), profileId);
      const stagingPath = selectors.installPathForGame(state(), profile.gameId);
      const mods = state().persistent.mods[profile.gameId];
      const mod = mods[modId];
      if ((mod !== undefined) && (mod.type === MOD_TYPE)) {
        try {
          const collectionData = await fs.readFileAsync(
            path.join(stagingPath, mod.installationPath, 'collection.json'),
            { encoding: 'utf-8' });
          const collection: ICollection = JSON.parse(collectionData);
          postprocessCollection(api, profile, collection, mods);
        } catch (err) {
          log('info', 'Failed to apply mod rules from collection. This is normal if this is the '
            + 'platform where the collection has been created.');
        }
      }
    });

  api.onAsync('unfulfilled-rules', makeOnUnfulfilledRules(api));

  api.events.on('did-finish-download', (dlId: string, outcome: string) => {
    if (outcome === 'finished') {
      const download: types.IDownload = state().persistent.downloads.files[dlId];
      if (download === undefined) {
        return;
      }
    }
  });

  api.events.on('did-download-collection', async (dlId: string) => {
    try {
      const dlInfo: types.IDownload =
        util.getSafe(state().persistent.downloads.files, [dlId], undefined);
      const profile = selectors.activeProfile(state());
      if (!dlInfo.game.includes(profile.gameId)) {
        log('info', 'Collection downloaded for a different game than is being managed',
            { gameMode: profile.gameId, game: dlInfo.game });
        api.sendNotification({
          message: 'The collection you downloaded is for a different game and thus '
                 + 'can\'t be installed right now.',
          type: 'info',
        });

        // the collection was for a different game, can't install it now
        return;
      } else {
        // once this is complete it will automatically trigger did-install-mod
        // which will then start the ui for the installation process
        await util.toPromise<string>(cb => api.events.emit('start-install-download', dlId, {}, cb));
      }
    } catch (err) {
      if (!(err instanceof util.UserCanceled)) {
        api.showErrorNotification('Failed to add collection', err, {
          allowReport: !(err instanceof util.ProcessCanceled),
        });
      }
    }
  });

  api.events.on('view-collection', (collectionId: string) => {
    api.events.emit('show-main-page', 'Collections');
    // have to delay this a bit because the callbacks are only set up once the page
    // is first opened
    setTimeout(() => {
      collectionsCB().viewCollection?.(collectionId);
    }, 100);
  });

  api.events.on('edit-collection', (collectionId: string) => {
    api.events.emit('show-main-page', 'Collections');
    // have to delay this a bit because the callbacks are only set up once the page
    // is first opened
    setTimeout(() => {
      collectionsCB().editCollection?.(collectionId);
    }, 100);
  });

  util.installIconSet('collections', path.join(__dirname, 'icons.svg'))
    .catch(err => api.showErrorNotification('failed to install icon set', err));

  const iconPath = path.join(__dirname, 'collectionicon.svg');
  document.getElementById('content').style
    .setProperty('--collection-icon', `url(${pathToFileURL(iconPath).href})`);
}

function init(context: types.IExtensionContext): boolean {
  let collectionsCB: ICallbackMap;

  register(context, (callbacks: ICallbackMap) => collectionsCB = callbacks);

  context.once(() => {
    once(context.api, () => collectionsCB);
  });
  return true;
}

export default init;
