import persistentReducer from './reducers/persistent';
import sessionReducer from './reducers/session';
import { ICollection } from './types/ICollection';
import { IExtendedInterfaceProps } from './types/IExtendedInterfaceProps';
import { addExtension } from './util/extension';
import InstallDriver from './util/InstallDriver';
import { genDefaultInstallModeAction } from './util/installMode';
import { cloneCollection, createCollection, makeCollectionId } from './util/transformCollection';
import { bbProm, getUnfulfilledNotificationId } from './util/util';
import AddModsDialog from './views/AddModsDialog';
import CollectionsMainPage from './views/CollectionPage';
import { InstallFinishDialog, InstallStartDialog } from './views/InstallDialog';

import CollectionAttributeRenderer from './views/CollectionModsPageAttributeRenderer';

import {
  addCollectionAction, addCollectionCondition,
  alreadyIncluded,
  initFromProfile,
  removeCollectionAction, removeCollectionCondition,
} from './collectionCreate';
import { makeInstall, postprocessCollection, testSupported } from './collectionInstall';
import { MOD_TYPE } from './constants';
import { onCollectionUpdate } from './eventHandlers';
import initIniTweaks from './initweaks';
import initTools from './tools';

import * as nexusApi from '@nexusmods/nexus-api';
import * as PromiseBB from 'bluebird';
import * as _ from 'lodash';
import memoize from 'memoize-one';
import * as path from 'path';
import * as React from 'react';
import * as Redux from 'redux';
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
  const reported = new Set<string>();

  return (profileId: string, modId: string, rules: types.IModRule[]): PromiseBB<boolean> => {
    const state: types.IState = api.store.getState();

    const profile = selectors.profileById(state, profileId);

    const collection: types.IMod =
      util.getSafe(state.persistent.mods, [profile.gameId, modId], undefined);

    if ((collection !== undefined)
        && !reported.has(modId)
        && (state.persistent.mods[profile.gameId][modId].type === MOD_TYPE)
        && !collection.attributes?.editable) {

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
        // their local id.
        notiActions.unshift({
          title: 'Update',
          action: dismiss => {
            initFromProfile(api, collectionProfile)
              .then(dismiss)
              .catch(err => api.showErrorNotification('Failed to update collection', err));
          },
        });
      } else {
        notiActions.unshift({
          title: 'Resume',
          action: dismiss => {
            driver.start(profile, collection);
            dismiss();
          },
        });
      }

      reported.add(modId);

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

async function cloneInstalledCollection(api: types.IExtensionApi, collectionId: string) {
  const state = api.getState();
  const gameMode = selectors.activeGameId(state);
  const mods = state.persistent.mods[gameMode];

  const result: types.IDialogResult = await api.showDialog(
    'question',
    'Clone collection "{{collectionName}}"?', {
    text: 'Cloning a collection means you can make edits to the collection in the workshop '
      + 'and share your changes with the community.\n'
      + 'If this collection is your own, your uploads will be revisions of that existing '
      + 'collection, otherwise you will create a new collection associated with your own '
      + 'account.',
    parameters: {
      collectionName: util.renderModName(mods[collectionId]),
    },
  }, [
    { label: 'Cancel' },
    { label: 'Clone' },
  ]);

  if (result.action === 'Clone') {
    const id = makeCollectionId(shortid());
    return cloneCollection(api, gameMode, id, collectionId);
  }
}

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
        title: 'Edit',
        action: dismiss => {
          api.events.emit('edit-collection', id);
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
    const revisionId = modInfo.download?.modInfo?.nexus?.ids?.revisionId;
    const collectionSlug = modInfo.download?.modInfo?.nexus?.ids?.collectionSlug;
    const revisionNumber = modInfo.download?.modInfo?.nexus?.ids?.revisionNumber;
    const referenceTag = modInfo.download?.modInfo?.referenceTag;

    const result: { [key: string]: any } = {
      collectionId,
      revisionId,
      collectionSlug,
      revisionNumber,
      referenceTag,
    };

    return PromiseBB.resolve(result);
  };
}

let lastRun;

function generateCollectionMap(mods: { [modId: string]: types.IMod })
    : { [modId: string]: types.IMod[] } {

  if (lastRun !== undefined) {
    log('debug', 'mods changed', util.objDiff(lastRun, mods));
  }
  lastRun = mods;
  const collections = Object.values(mods).filter(mod => mod.type === MOD_TYPE);

  const result: { [modId: string]: types.IMod[] } = {};

  collections.forEach(coll => (coll.rules ?? []).forEach(rule => {
    if (rule.reference.id !== undefined) {
      util.setdefault(result, rule.reference.id, []).push(coll);
    } else {
      const installed = util.findModByRef(rule.reference, mods);
      if (installed !== undefined) {
        util.setdefault(result, installed.id, []).push(coll);
      }
    }
  }));

  return result;
}

interface IModTable { [modId: string]: types.IMod; }

function collectionListEqual(lArgs: IModTable[], rArgs: IModTable[]): boolean {
  const lhs = lArgs[0];
  const rhs = rArgs[0];

  const keys = Object.keys(lhs);

  if (!_.isEqual(keys, Object.keys(rhs))) {
    return false;
  }

  const ruleDiff = keys.find(modId =>
    (lhs[modId].state !== rhs[modId].state) || (lhs[modId].rules !== rhs[modId].rules));

  return ruleDiff === undefined;
}

function generateCollectionOptions(mods: { [modId: string]: types.IMod })
    : Array<{ label: string, value: string }> {
  return Object.values(mods)
    .filter(mod => mod.type === MOD_TYPE)
    .map(mod => ({ label: util.renderModName(mod), value: mod.id }));
}

async function updateMeta(api: types.IExtensionApi) {
  const state = api.getState();
  const gameMode = selectors.activeGameId(state);
  const mods = state.persistent.mods[gameMode] ?? {};
  const collections = Object.keys(mods)
    .filter(modId => mods[modId].type === MOD_TYPE);

  const notiId = shortid();

  const progress = (name: string, idx: number) => {
    api.sendNotification({
      id: notiId,
      type: 'activity',
      title: 'Updating Collection Information',
      message: name,
      progress: (idx * 100) / collections.length,
    });
  };

  // tslint:disable-next-line:prefer-for-of
  for (let i = 0; i < collections.length; ++i) {
    const modId = collections[i];
    const { revisionId } = mods[modId].attributes ?? {};
    try {
      if (revisionId !== undefined) {
        progress(util.renderModName(mods[modId]), i);

        const infos: nexusApi.IRevision[] =
          await api.emitAndAwait('get-nexus-collection-revision', revisionId);
        if (infos.length > 0) {
          const info = infos[0];
          api.store.dispatch(actions.setModAttributes(gameMode, modId, {
            customFileName: info.collection.name,
            collectionSlug: info.collection.slug,
            author: info.collection.user?.name,
            uploader: info.collection.user?.name,
            uploaderAvatar: info.collection.user?.avatar,
            uploaderId: info.collection.user?.memberId,
            pictureUrl: info.collection.tileImage?.url,
            description: info.collection.description,
            shortDescription: info.collection.summary,
            rating: info.rating,
          }));
        }
      }
    } catch (err) {
      api.showErrorNotification('Failed to check collection for update', err);
    }
  }

  api.dismissNotification(notiId);
}

interface ICallbackMap { [cbName: string]: (...args: any[]) => void; }

let collectionChangedCB: () => void;

function register(context: types.IExtensionContext,
                  onSetCallbacks: (callbacks: ICallbackMap) => void) {
  let collectionsCB: ICallbackMap;

  context.registerReducer(['session', 'collections'], sessionReducer);
  context.registerReducer(['persistent', 'collections'], persistentReducer);

  context.registerDialog('collection-install', InstallStartDialog, () => ({
    driver,
  }));

  context.registerDialog('collection-finish', InstallFinishDialog, () => ({
    api: context.api,
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

  let resetPageCB: () => void;

  context.registerMainPage('collection', 'Collections', CollectionsMainPage, {
    hotkey: 'C',
    group: 'per-game',
    badge: new util.ReduxProp(context.api, [], () => 'Beta'),
    visible: () => selectors.activeGameId(context.api.store.getState()) !== undefined,
    props: () => ({
      driver,
      onSetupCallbacks: (callbacks: ICallbackMap) => {
        collectionsCB = callbacks;
        onSetCallbacks(callbacks);
      },
      onCloneCollection: (collectionId: string) =>
        cloneInstalledCollection(context.api, collectionId),
      onCreateCollection: (profile: types.IProfile, name: string) =>
        createNewCollection(context.api, profile, name),
      onUpdateMeta: () => updateMeta(context.api),
      resetCB: (cb) => resetPageCB = cb,
    }),
    onReset: () => resetPageCB?.(),
    priority: 90,
  });

  context.registerModType(MOD_TYPE, 200, () => true,
    () => undefined, () => PromiseBB.resolve(false), {
    name: 'Collection',
    customDependencyManagement: true,
    noConflicts: true,
  } as any);

  const stateFunc: () => types.IState = () => context.api.store.getState();

  const emptyArray = [];
  const emptyObj = {};

  const collectionsMapFunc = memoize(generateCollectionMap, collectionListEqual);

  const collectionsMap = () =>
    collectionsMapFunc(
      stateFunc().persistent.mods[selectors.activeGameId(stateFunc())] ?? emptyObj);
  const collectionOptions = memoize(generateCollectionOptions);

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
    customRenderer: (mod: types.IMod, detailCell: boolean) => {
      const collections = collectionsMap()[mod.id] || emptyArray;
      return React.createElement(CollectionAttributeRenderer,
                                 { modId: mod.id, collections, detailCell }, []);
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
    filter: new OptionsFilter((() => {
      const mods = stateFunc().persistent.mods[selectors.activeGameId(stateFunc())] ?? {};
      return collectionOptions(mods);
    }) as any,
      false, false),
    isGroupable: true,
    groupName: (modId: string) =>
      util.renderModName(stateFunc().persistent.mods[selectors.activeGameId(stateFunc())]?.[modId]),
    isDefaultVisible: false,
  };
  context.registerTableAttribute('mods', collectionAttribute);

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
    }, (modIds: string[]) => isEditableCollection(context.api.getState(), modIds));

  context.registerAction('mods-action-icons', 75, 'start-install', {}, 'Install Optional Mods...',
    (modIds: string[]) => {
      const profile: types.IProfile = selectors.activeProfile(stateFunc());
      context.api.events.emit('install-recommendations', profile.id, modIds);
    }, (modIds: string[]) => {
      const gameMode = selectors.activeGameId(stateFunc());
      const mod = stateFunc().persistent.mods[gameMode][modIds[0]];
      if (mod === undefined) {
        return false;
      }
      if ((mod.rules ?? []).find(rule => rule.type === 'recommends') === undefined) {
        return context.api.translate('No optional mods') as string;
      }
      return (mod.type === MOD_TYPE);
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
  context.registerAction('mods-multirow-actions', 300, 'collection', {},
                         'Remove from Collection...',
    (instanceIds: string[]) => removeCollectionAction(context.api, instanceIds)
        .then(() => collectionChanged.schedule())
        .catch(err => context.api.showErrorNotification('failed to add mod to collection', err)),
    (instanceIds: string[]) => removeCollectionCondition(context.api, instanceIds));

  context.registerAttributeExtractor(100, genAttributeExtractor(context.api));

  context.registerInstaller('collection', 5,
                            bbProm(testSupported), bbProm(makeInstall(context.api)));

  context['registerCollectionFeature'] =
    (id: string,
     generate: (gameId: string, includedMods: string[]) => Promise<any>,
     parse: (gameId: string, collection: ICollection) => Promise<void>,
     clone: (gameId: string, collection: ICollection,
             from: types.IMod, to: types.IMod) => Promise<void>,
     title: (t: types.TFunction) => string,
     condition?: (state: types.IState, gameId: string) => boolean,
     editComponent?: React.ComponentType<IExtendedInterfaceProps>) => {
      addExtension({ id, generate, parse, clone, condition, title, editComponent });
    };

  context.registerActionCheck('ADD_NOTIFICATION', (state: any, action: Redux.Action) => {
    const notification: types.INotification = action['payload'];
    const ruleMatches = rule => rule.reference.tag === notification.replace.tag;
    if (notification.id.startsWith('multiple-plugins-')
        && (driver?.collection !== undefined)
        && ((driver.collection.rules ?? []).find(ruleMatches) !== undefined)) {
      return false as any;
    }
    return undefined;
  });
}

function once(api: types.IExtensionApi, collectionsCB: () => ICallbackMap) {
  const { store } = api;

  const applyDefaultInstallMode = new util.Debouncer(() => {
    const gameMode = selectors.activeGameId(state());
    const mods = util.getSafe(state(), ['persistent', 'mods', gameMode], {});
    const collectionIds = Object.keys(mods).filter(id => (mods[id]?.type === MOD_TYPE));
    const redActions: Redux.Action[] = collectionIds.reduce((accum, id) => {
      const collection: types.IMod = mods[id];
      if ((collection === undefined) || (collection.attributes['editable'] !== true)) {
        return accum;
      }
      const collMods = (collection.rules ?? [])
        .map(rule => util.findModByRef(rule.reference, mods))
        .filter(rule => rule !== undefined);
      const action = genDefaultInstallModeAction(api, id, collMods, gameMode);
      if (action !== undefined) {
        accum.push(action);
      }
      return accum;
    }, []);

    if (redActions.length > 0) {
      util.batchDispatch(api.store, redActions);
    }
    return null;
  }, 1000);

  driver = new InstallDriver(api);

  driver.onUpdate(() => {
    // currently no UI associated with the start step
    if (driver.step === 'start') {
      driver.continue();
    }
  });

  api.setStylesheet('modpacks', path.join(__dirname, 'style.scss'));

  const state: () => types.IState = () => store.getState();

  interface IModsDict { [gameId: string]: { [modId: string]: types.IMod }; }

  api.onStateChange(['persistent', 'mods'], (prev: IModsDict, cur: IModsDict) => {
    const gameMode = selectors.activeGameId(api.getState());
    const prevG = prev[gameMode] ?? {};
    const curG = cur[gameMode] ?? {};
    const allIds =
      Array.from(new Set([].concat(Object.keys(prevG), Object.keys(curG))));
    const collections = allIds.filter(id =>
      (prevG[id]?.type === MOD_TYPE) || (curG[id]?.type === MOD_TYPE));
    const changed = collections.find(modId =>
      (prevG[modId]?.attributes?.customFileName !== curG[modId]?.attributes?.customFileName));
    if (changed !== undefined) {
      collectionChangedCB?.();
    }

    const foundRuleChanges: boolean = collections.find((id) => {
      if (prevG[id]?.rules === curG[id]?.rules) {
        return false;
      }
      const added = _.difference(curG[id]?.rules, prevG[id]?.rules);
      const removed = _.difference(prevG[id]?.rules, curG[id]?.rules);
      return (removed.length > 0) || (added.find(rule =>
          ['requires', 'recommends'].includes(rule.type)) !== undefined);
    }) !== undefined;

    if (foundRuleChanges) {
      applyDefaultInstallMode.schedule();
      if (changed === undefined) {
        // The collectionChanged callback hasn't been called; yet
        //  the mod entries had been changed - we need to call the CB
        //  in order for the collection column on the mods page to rerender
        collectionChangedCB?.();
      }
    }
  });

  api.events.on('did-install-mod', async (gameId: string, archiveId: string, modId: string) => {
    // automatically enable collections once they're installed
    const profileId = selectors.lastActiveProfileForGame(state(), gameId);
    const profile = selectors.profileById(state(), profileId);
    if (profile === undefined) {
      return;
    }
    const mod = util.getSafe(state().persistent.mods, [gameId, modId], undefined);
    if (mod === undefined) {
      // how ?
      return;
    }
    if (mod.type === MOD_TYPE) {
      if  (driver.collection === undefined) {
        driver.query(profile, mod);
      } else {
        api.sendNotification({
          type: 'info',
          message: 'Collection can\'t be installed as another one is being installed already',
        });
      }
    } else {
      const isDependency = (driver.collection?.rules ?? []).find(rule => {
        const validType = ['requires', 'recommends'].includes(rule.type);
        if (!validType) {
          return false;
        }
        const matchedRule = util.testModReference(mod, rule.reference);
        return matchedRule;
      }) !== undefined;
      if (isDependency) {
        const modRules = await driver.infoCache.getCollectionModRules(driver.revisionId);
        util.batchDispatch(api.store, (modRules ?? []).reduce((prev, rule) => {
          if (util.testModReference(mod, rule.source)) {
            prev.push(actions.addModRule(gameId, modId, rule));
          }
          return prev;
        }, []));
      }
    }
  });

  api.events.on('did-install-dependencies',
    async (profileId: string, modId: string, recommendations: boolean) => {
      log('info', 'did install dependencies', { profileId, modId });
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
          postprocessCollection(api, profile, mod, collection, mods);
        } catch (err) {
          log('info', 'Failed to apply mod rules from collection. This is normal if this is the '
            + 'platform where the collection has been created.');
        }
      }
    });

  api.onAsync('unfulfilled-rules', makeOnUnfulfilledRules(api));
  api.events.on('collection-update', onCollectionUpdate(api));

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
      if (profile === undefined) {
        return;
      }
      if (!dlInfo.game.includes(profile.gameId)) {
        log('info', 'Collection downloaded for a different game than is being managed',
            { gameMode: profile.gameId, game: dlInfo.game });
        const expectedGame = util.getGame(dlInfo.game[0]);
        const actualGame = util.getGame(profile.gameId);
        api.sendNotification({
          message: '"{{collectionName}}" - This collection is intended for {{expectedGame}} '
                  + 'and cannot be installed to {{actualGame}}',
          type: 'info',
          replace: {
            collectionName: dlInfo.modInfo?.name ?? dlInfo.localPath,
            expectedGame: expectedGame?.name ?? api.translate('an unsupported game'),
            actualGame: actualGame.name,
          },
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

  initIniTweaks(context);
  initTools(context);

  context.once(() => {
    once(context.api, () => collectionsCB);
  });
  return true;
}

export default init;
