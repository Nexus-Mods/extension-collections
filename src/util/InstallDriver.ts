/* eslint-disable */
import * as nexusApi from '@nexusmods/nexus-api';
import * as Promise from 'bluebird';
import * as path from 'path';
import { actions, log, selectors, types, util } from 'vortex-api';
import { setPendingVote } from '../actions/persistent';
import { postprocessCollection } from '../collectionInstall';
import { INSTALLING_NOTIFICATION_ID, MOD_TYPE } from '../constants';
import { ICollection } from '../types/ICollection';
import { IRevisionEx } from '../types/IRevisionEx';
import { applyPatches } from './binaryPatching';
import { readCollection } from './importCollection';
import InfoCache from './InfoCache';
import { calculateCollectionSize, getUnfulfilledNotificationId, isRelevant, modRuleId, walkPath } from './util';

import * as _ from 'lodash';

export type Step = 'prepare' | 'changelog' | 'query' | 'start' | 'disclaimer' | 'installing' | 'recommendations' | 'review';

export type UpdateCB = () => void;

class InstallDriver {
  private mApi: types.IExtensionApi;
  private mProfile: types.IProfile;
  private mGameId: string;
  private mCollection: types.IMod;
  private mLastCollection: types.IMod;
  private mStep: Step = 'prepare';
  private mUpdateHandlers: UpdateCB[] = [];
  private mInstalledMods: types.IMod[] = [];
  private mDependentMods: types.IModRule[] = [];
  private mInstallingMod: string;
  private mInstallDone: boolean = false;
  private mCollectionInfo: nexusApi.ICollection;
  private mRevisionInfo: nexusApi.IRevision;
  private mInfoCache: InfoCache;
  private mTotalSize: number;
  private mOnStop: () => void;
  private mPrepare: Promise<void> = Promise.resolve();
  private get requiredMods() {
    return this.mDependentMods.filter(_ => _.type === 'requires');
  }
  private get recommendedMods() {
    return this.mDependentMods.filter(_ => _.type === 'recommends');
    }
  private mInstallStartTime: Date;

  constructor(api: types.IExtensionApi) {
    this.mApi = api;

    this.mInfoCache = new InfoCache(api);

    api.onAsync('will-install-mod', (gameId: string, archiveId: string, modId: string) => {
      const state: types.IState = api.store.getState();
      const download = state.persistent.downloads.files[archiveId];
      if (download !== undefined) {
        this.mInstallingMod = download.localPath;
      }
      return Promise.resolve();
    });

    api.events.on('did-install-mod', (gameId: string, archiveId: string, modId: string) => {
      const state: types.IState = api.store.getState();
      const mod = util.getSafe(state.persistent.mods, [gameId, modId], undefined);
      // verify the mod installed is actually one required by this collection
      const dependent = this.mDependentMods.find(iter =>
        util.testModReference(mod, iter.reference));
      if ((mod !== undefined) && (dependent !== undefined)) {
        if (dependent.type === 'requires') {
          this.mInstalledMods.push(mod);
        }
        if ((this.mCollection?.installationPath !== undefined)
            && (dependent.reference.description !== undefined)) {
          if (dependent.type === 'requires') {
            this.updateProgress(this.mProfile, this.mGameId, this.mCollection);
          }
          applyPatches(api, this.mCollection,
                       gameId, dependent.reference.description, modId, dependent.extra?.patches);
          util.batchDispatch(api.store, [
            actions.setFileOverride(gameId, modId, dependent.extra?.fileOverrides),
            actions.setModAttribute(gameId, modId, 'patches', dependent.extra?.patches),
            actions.setModAttribute(gameId, modId, 'fileList', dependent.fileList),
          ]);
        }
      }
      this.triggerUpdate();
    });

    api.events.on('did-finish-download', () => {
      // not checking whether the download is actually part of this collection because
      // that check may be more expensive than the ui update
      this.updateProgress(this.mProfile, this.mGameId, this.mCollection);
    });

    api.events.on(
      'will-install-dependencies',
      (profileId: string, modId: string, recommendations: boolean, onCancel: () => void) => {
        const state = api.getState();
        const profile = this.profile || selectors.profileById(state, profileId);
        const gameId = this.mGameId || profile?.gameId;
        if (gameId === undefined) {
          // how?
          return;
        }
        const mods = state.persistent.mods[gameId];
        if ((this.mCollection === undefined)
            && (mods[modId]?.type === MOD_TYPE)
            && recommendations) {
          // When installing optional mods, it's possible for the mCollection
          //  property to be undefined - we need to ensure that the driver is
          //  aware that it's installing mods that are part of the collection
          //  in order for us to apply any collection mod rules to the mods themselves
          //  upon successful installation.
          this.mLastCollection = this.mCollection = mods[modId];
          this.mStep = 'installing';
        }
        
        const isCollectionMod = rule => util.findModByRef(rule.reference, mods)?.id === modId;

        if ((this.mCollection !== undefined)
            && recommendations
            && (this.mCollection.rules ?? []).find(isCollectionMod)) {
          onCancel();
        }
      });

    api.events.on(
      'did-install-dependencies',
      (gameId: string, modId: string, recommendations: boolean) => {
        this.onDidInstallDependencies(gameId, modId, recommendations);
      });
  }

  public async prepare(func: () => Promise<void>) {
    this.mPrepare = this.mPrepare.then(func);
  }

  public async query(profile: types.IProfile, collection: types.IMod) {
    await this.mPrepare;
    this.mPrepare = Promise.resolve();

    if (collection?.archiveId === undefined) {
      return;
    }

    if (!this.mInstallDone && (this.mCollection !== undefined)) {
      this.mApi.sendNotification({
        type: 'warning',
        message: 'Already installing a collection',
      });
      return;
    }
    this.mProfile = profile;
    this.mLastCollection = this.mCollection = collection;
    this.mGameId = profile?.gameId ?? selectors.activeGameId(this.mApi.getState());
    this.mStep = 'query';
    await this.initCollectionInfo();
    this.triggerUpdate();
  }

  public async start(profile: types.IProfile, collection: types.IMod) {
    await this.mPrepare;
    this.mPrepare = Promise.resolve();

    if (collection?.archiveId === undefined) {
      return;
    }

    if (!this.mInstallDone && (this.mCollection !== undefined)) {
      this.mApi.sendNotification({
        type: 'warning',
        message: 'Already installing a collection',
        displayMS: 5000,
      });
      log('warn', 'already installing a collection');
      return;
    }

    this.mProfile = profile;
    this.mLastCollection = this.mCollection = collection;
    this.mGameId = profile?.gameId ?? selectors.activeGameId(this.mApi.getState());

    this.mTotalSize = calculateCollectionSize(this.getModsEx(profile, this.mGameId, collection));

    await this.startInstall();
    await this.initCollectionInfo();
    this.triggerUpdate();
  }

  public onUpdate(cb: UpdateCB) {
    this.mUpdateHandlers.push(cb);
  }

  public get profile() {
    return this.mProfile;
  }

  public set profile(val: types.IProfile) {
    this.mProfile = val;
    if (val !== undefined) {
      this.mGameId = val?.gameId;
    }
  }

  public get infoCache() {
    return this.mInfoCache;
  }

  public get step() {
    return this.mStep;
  }

  public get installedMods(): types.IMod[] {
    return this.mInstalledMods;
  }

  public get numRequired(): number {
    return this.requiredMods.length;
  }

  public get installingMod(): string {
    return this.mInstallingMod;
  }

  public get collection(): types.IMod {
    return this.mCollection;
  }

  /**
   * return last collection that was installed. Only difference to "collection" is that this
   * does not get reset after the installation completes but please be aware that there is
   * no guarantee this collection is still installed
   */
  public get lastCollection(): types.IMod {
    return this.mLastCollection;
  }

  public get collectionId(): string {
    const state: types.IState = this.mApi.store.getState();
    const modInfo = (this.mCollection !== undefined)
      ? state.persistent.downloads.files[this.mCollection.archiveId]?.modInfo
      : undefined;
    const nexusInfo = modInfo?.nexus;

    return nexusInfo?.ids?.collectionId || modInfo?.ids?.collectionId;
  }

  public get collectionSlug(): string {
    const state: types.IState = this.mApi.store.getState();
    const modInfo = (this.mCollection !== undefined)
      ? state.persistent.downloads.files[this.mCollection.archiveId]?.modInfo
      : undefined;
    const nexusInfo = modInfo?.nexus;

    return nexusInfo?.ids?.collectionSlug || modInfo?.ids?.collectionSlug;
  }

  public get revisionNumber(): number {
    const state: types.IState = this.mApi.store.getState();
    const modInfo = (this.mCollection !== undefined)
      ? state.persistent.downloads.files[this.mCollection.archiveId]?.modInfo
      : undefined;
    const nexusInfo = modInfo?.nexus;

    return nexusInfo?.ids?.revisionNumber || modInfo?.ids?.revisionNumber;
  }

  public get revisionId(): string {
    const state: types.IState = this.mApi.store.getState();
    const modInfo = (this.mCollection !== undefined)
      ? state.persistent.downloads.files[this.mCollection.archiveId]?.modInfo
      : undefined;
    const nexusInfo = modInfo?.nexus;

    return nexusInfo?.ids?.revisionId || modInfo?.ids?.revisionId;
  }

  public get collectionInfo(): nexusApi.ICollection {
    return this.mCollectionInfo;
  }

  public get revisionInfo(): IRevisionEx {
    return this.mRevisionInfo;
  }

  public get installDone(): boolean {
    return this.mInstallDone;
  }

  public cancel() {
    this.onStop();

    this.triggerUpdate();
  }

  public installRecommended() {
    this.mApi.emitAndAwait('install-from-dependencies',
                           this.mCollection.id, this.mCollection.rules, true);
    this.mStep = 'recommendations';
    this.triggerUpdate();
  }

  public async continue() {
    if (this.canContinue() && (this.mCollection?.archiveId !== undefined)) {
      await this.initCollectionInfo();

      const steps = {
        query: this.startInstall,
        start: this.begin,
        disclaimer: this.closeDisclaimers,
        installing: this.finishInstalling,
        recommendations: this.finishInstalling,
        review: this.close,
      };
      const res = await steps[this.mStep]?.();
      if (res !== false) {
        this.triggerUpdate();
      }
    }
  }

  public canContinue() {
    if (this.mCollection === undefined) {
      return false;
    }
    if (this.mStep === 'installing') {
      return this.mInstallDone;
    } else if (this.mStep === 'disclaimer') {
      return (this.mInstalledMods.length > 0) || this.mInstallDone;
    } else {
      return true;
    }
  }

  public canClose() {
    return ['start'].indexOf(this.mStep) !== -1;
  }

  public canHide() {
    return ['disclaimer', 'installing'].indexOf(this.mStep) !== -1;
  }

  private async initCollectionInfo() {
    if (this.mCollection?.archiveId === undefined) {
      return;
    }
    const slug = this.collectionSlug;
    const state: types.IState = this.mApi.store.getState();
    const modInfo = state.persistent.downloads.files[this.mCollection.archiveId]?.modInfo;
    const nexusInfo = modInfo?.nexus;
    this.mCollectionInfo = nexusInfo?.collectionInfo
      ?? await this.mInfoCache.getCollectionInfo(slug)
      // this last fallback is for the weird case where we have revision info cached but
      // not collection info and fetching is not possible because it's been deleted from the
      // site
      // Not sure if/why this would happen on live, it did occur during testing because the
      // stuff was getting deleted from the DB directly
      ?? this.mRevisionInfo?.collection;
  }

  private async onDidInstallDependencies(gameId: string,
                                         modId: string,
                                         recommendations: boolean) {
    const mods = this.mApi.getState().persistent.mods[gameId];

    if (mods[modId]?.type === MOD_TYPE) {
      log('info', 'did install dependencies', { gameId, modId });
    }

    if ((this.mCollection !== undefined) && (modId === this.mCollection.id)) {
      // update the stored collection because it might have been updated as part of the
      // dependency installation
      this.mLastCollection = this.mCollection = mods[modId];

      if (this.mCollection !== undefined) {
        if (!recommendations) {
          const filter = rule =>
            (rule.type === 'requires')
            && (rule['ignored'] !== true)
            && (util.findModByRef(rule.reference, mods) === undefined);

          const incomplete = (this.mCollection.rules ?? []).find(filter);
            if (incomplete === undefined) {
            // collection installation complete
            this.mApi.events.emit('analytics-track-event', 'Collections', 'Installation End', 'Slug+Revision', `${this.collectionSlug}+${this.revisionNumber}`);
            const installEndTime = new Date();
            const installTime = installEndTime.getTime() - this.mInstallStartTime.getTime();
            this.mApi.events.emit('analytics-track-event', 'Collections', 'Installation Time Taken', 'Time', installTime)
            // revisit review screen
            await this.initCollectionInfo();
            this.mStep = 'review';
          } else {
            this.mInstallDone = true;
            this.mInstallingMod = undefined;
          }
          this.mApi.dismissNotification(INSTALLING_NOTIFICATION_ID + modId);
          this.triggerUpdate();
        } else {
          // We finished installing optional mods for the current collection - reset everything.
          const filter = rule =>
            (['requires', 'recommends'].includes(rule.type))
            && (rule['ignored'] !== true)
            && (util.findModByRef(rule.reference, mods) === undefined);

          const incomplete = (this.mCollection.rules ?? []).find(filter);

          this.mApi.dismissNotification(INSTALLING_NOTIFICATION_ID + modId);

          if (incomplete === undefined) {
            // revisit review screen
            await this.initCollectionInfo();
            this.mStep = 'review';
          } else {
            this.onStop();
          }
        }
      }
    }

    const stagingPath = selectors.installPathForGame(this.mApi.getState(), gameId);
    const mod = mods[modId];
    if ((mod !== undefined) && (mod.type === MOD_TYPE)) {
      try {
        const collectionInfo: ICollection =
          await readCollection(
            this.mApi,
            path.join(stagingPath, mod.installationPath, 'collection.json'));
        await postprocessCollection(this.mApi, gameId, mod, collectionInfo, mods);
      } catch (err) {
        log('info', 'Failed to apply mod rules from collection. This is normal if this is the '
          + 'platform where the collection has been created.');
      }
    }
  }

  private onStop() {
    if (this.mCollection !== undefined) {
      this.mApi.dismissNotification(INSTALLING_NOTIFICATION_ID + this.mCollection.id);
    }
    this.mCollection = undefined;
    this.mProfile = undefined;
    this.mGameId = undefined;
    this.mInstalledMods = [];
    this.mStep = 'prepare';
    this.mOnStop?.();
  }

  private getModsEx(profile: types.IProfile, gameId: string, collection: types.IMod)
      : { [id: string]: types.IMod & { collectionRule: types.IModRule } } {
    if (profile === undefined) {
      profile = this.mProfile;
    }
    if (profile === undefined) {
      return {};
    }

    const mods = this.mApi.getState().persistent.mods[gameId];

    if (mods === undefined) {
      log('error', 'no mods for game', { gameId });
      return {};
    }

    return (collection.rules ?? []).reduce((prev, rule) => {
      if (!['requires', 'recommends'].includes(rule.type)) {
        return prev;
      }

      const mod = util.findModByRef(rule.reference, mods);
      prev[modRuleId(rule)] = { ...mod, collectionRule: rule };

      return prev;
    }, {});
  }

  private startInstall = async () => {
    // suppress plugins-changed event to avoid constantly running expensive callbacks
    // until onStop gets called
    this.mApi.ext.withSuppressedTests?.(['plugins-changed', 'settings-changed', 'mod-activated', 'mod-installed'], () =>
      new Promise(resolve => {
        this.mOnStop = () => {
          resolve(undefined);
          this.mOnStop = undefined;
        };
      }));

    return this.startImpl();
  }

    private startImpl = async () => {

    this.mInstallStartTime = new Date();
    if ((this.mCollection?.archiveId === undefined) || (this.mProfile === undefined)) {
      return false;
    }

    this.mInstalledMods = [];
    this.mInstallingMod = undefined;
    this.mInstallDone = false;
    this.mStep = 'start';

    const collection = this.mCollection;
    const profile = this.mProfile;
    const gameId = this.mGameId;

    const state: types.IState = this.mApi.store.getState();
    const mods = state.persistent.mods[gameId] ?? {};
    const modInfo = state.persistent.downloads.files[collection.archiveId]?.modInfo;
    const nexusInfo = modInfo?.nexus;

    const slug = this.collectionSlug;
    const revisionId = this.revisionId;

    if (revisionId !== undefined) {
      try {
        this.mRevisionInfo = nexusInfo?.revisionInfo
          ?? await this.mInfoCache.getRevisionInfo(revisionId, slug, this.revisionNumber);
      } catch (err) {
        log('error', 'failed to get remote info for revision', {
          revisionId, slug, revisionNumber: this.revisionNumber, error: err.message });
      }
    }

    const { userInfo } = state.persistent['nexus'] ?? {};
    // don't request a vote on own collection
    if (this.mRevisionInfo?.collection?.user?.memberId !== userInfo?.userId) {
      this.mApi.store.dispatch(
        setPendingVote(revisionId, slug, this.revisionNumber, Date.now()));
    }

    const gameMode = gameId;
    const currentgame = util.getGame(gameMode);
    const discovery = selectors.discoveryByGame(state, gameMode);
    const gameVersion = await currentgame.getInstalledVersion(discovery);
    const gvMatch = gv => gv.reference === gameVersion;
    const revGameVersions = this.mRevisionInfo?.gameVersions ?? [];
    if ((revGameVersions.length ?? 0 !== 0)
        && (revGameVersions.find(gvMatch) === undefined)) {
      const choice = await this.mApi.showDialog('question', 'Game version mismatch', {
        bbcode: 'The version of the game you have installed is different to the one the curator used when creating this collection.'
            + '[br][/br][br][/br]'
            + 'Your game version: [style=dialog-success-text]{{actual}}[/style][br][/br]'
            + 'Recommended game version: [style=dialog-danger-text]{{intended}}[/style]'            
            + '[br][/br][br][/br]'
            + 'If you choose to continue, some or all of the mods included in the collection may not work properly for you. This will '
            + 'require manual troubleshooting to correct. For users who are not familiar with modding, we do not recommend continuing with installation.'
            + '[br][/br][br][/br]'
            + 'You can also check the description, comments and bug reports on the Collection page to see if others have been successful'
            + 'while playing with the game version you have installed or to request advice from the curator.',
        parameters: {
          actual: gameVersion,
          intended: revGameVersions.map(gv => gv.reference).join(' or '),
        },
      }, [
        { label: 'Cancel' },
        { label: 'Continue' },
      ]);
      if (choice.action === 'Cancel') {
        this.mInstallDone = true;
        return false;
      }
    }

    this.mApi.events.emit('will-install-collection', gameId, collection.id);

    this.mApi.events.emit('view-collection', collection.id);

    this.updateProgress(profile, gameId, collection);

    this.augmentRules(gameId, collection);

    this.mApi.dismissNotification(getUnfulfilledNotificationId(collection.id));
    this.mApi.store.dispatch(actions.setModEnabled(profile.id, collection.id, true));

    const required = (collection?.rules ?? [])
      .filter(rule => ['requires', 'recommends'].includes(rule.type));
    const dependencies: types.IModRule[] = required
      .reduce((accum, rule) => {
        const modRef: any = {
          ...rule.reference,
          patches: rule?.extra?.patches ? { ...rule.extra.patches } : undefined,
          fileList: rule?.fileList,
        }
        const mod = util.findModByRef(modRef, mods);
        if (mod === undefined) {
          accum.push(rule);
        }
        return accum;
      }, []);
    this.mDependentMods = dependencies;
    // log('debug', 'dependent mods', JSON.stringify(dependencies));

    if (this.requiredMods.length === 0) {
      this.mInstallDone = false;
    }

    log('info', 'starting install of collection', {
      totalMods: required.length,
      missing: this.requiredMods.length,
    });
  }

  private matchRepo(rule: types.IModRule, ref: nexusApi.IModFile) {
    if (ref === null) {
      return false;
    }

    const modId = rule.reference.repo?.modId;
    const fileId = rule.reference.repo?.fileId;

    if ((modId === undefined) || (fileId === undefined)
        || !ref.modId || !ref.fileId) {
      return false;
    }

    return modId.toString() === ref.modId.toString()
      && fileId.toString() === ref.fileId.toString();
  }

  private augmentRules(gameId: string, collection: types.IMod) {
    util.batchDispatch(this.mApi.store, (collection.rules ?? []).map(rule => {
      if (rule.reference.repo === undefined) {
        return undefined;
      }
      const revMod = (this.mRevisionInfo?.modFiles ?? []).find(
        iter => this.matchRepo(rule, iter.file));
      if (revMod?.file !== undefined) {
        const newRule = util.setSafe(rule, ['extra', 'fileName'], revMod.file.uri);
        return actions.addModRule(gameId, collection.id, newRule);
      }
    })
    .filter(rule => rule !== undefined));
  }

  private begin = () => {
    if ((this.mCollection === undefined) || (this.mProfile?.id === undefined)) {
      return;
    }

    this.mApi.events.emit('install-dependencies',
      this.mProfile.id, this.mGameId, [this.mCollection.id], true);
    // skipping disclaimer for now
    this.mStep = 'installing';
  }

  private closeDisclaimers = () => {
    this.mStep = 'installing';
  }

  private finishInstalling = () => {
    this.mStep = 'review';
  }

  private close = () => {
    if ((this.mGameId !== undefined) && (this.mCollection !== undefined)) {
      this.mApi.events.emit('did-install-collection', this.mGameId, this.mCollection.id);
    }
    this.mCollection = undefined;
    this.mInstallDone = true;
    this.triggerUpdate();
  }

  private triggerUpdate() {
    this.mUpdateHandlers.forEach(cb => {
      cb();
    });
  }

  private installProgress(profile: types.IProfile, gameId: string, collection: types.IMod): number {
    const mods = this.getModsEx(profile, gameId, collection);

    const downloads = this.mApi.getState().persistent.downloads.files;

    const downloadProgress = Object.values(mods).reduce((prev, mod) => {
      let size = 0;
      if ((mod.state === 'downloading') || (mod.state === null)) {
        const download = downloads[mod.archiveId];
        size += download?.received || 0;
      } else {
        size += mod.attributes?.fileSize || 0;
      }
      return prev + size;
    }, 0);

    const installedMods = Object.values(mods).filter(mod => mod.state === 'installed');
    const totalMods = Object.values(mods).filter(isRelevant);

    const dlPerc = downloadProgress / this.mTotalSize;
    const instPerc = installedMods.length / totalMods.length;

    return (dlPerc + instPerc) * 50.0;
  }

  private updateProgress(profile: types.IProfile, gameId: string, collection: types.IMod) {
    if (collection === undefined) {
      return;
    }

    if (this.mTotalSize === undefined) {
      this.mTotalSize = calculateCollectionSize(this.getModsEx(profile, gameId, collection));
    }

    this.mApi.sendNotification({
      id: INSTALLING_NOTIFICATION_ID + collection.id,
      type: 'activity',
      title: 'Installing Collection',
      message: util.renderModName(collection),
      progress: this.installProgress(profile, gameId, collection),
      actions: [
        {
          title: 'Show',
          action: () => {
            this.mApi.events.emit('view-collection', collection.id);
          },
        },
      ],
    });
  }
}

export default InstallDriver;
