import * as Promise from 'bluebird';
import { ICollection } from 'nexus-api';
import { actions, log, types, util } from 'vortex-api';
import { findModByRef } from './findModByRef';
import InfoCache from './InfoCache';
import { getUnfulfilledNotificationId } from './util';
import { IRevisionEx } from '../types/IRevisionEx';

export type Step = 'query' | 'start' | 'disclaimer' | 'installing' | 'review';

export type UpdateCB = () => void;

class InstallDriver {
  private mApi: types.IExtensionApi;
  private mProfile: types.IProfile;
  private mCollection: types.IMod;
  private mStep: Step = 'query';
  private mUpdateHandlers: UpdateCB[] = [];
  private mInstalledMods: types.IMod[] = [];
  private mRequiredMods: types.IModRule[] = [];
  private mInstallingMod: string;
  private mInstallDone: boolean = false;
  private mCollectionInfo: ICollection;
  private mInfoCache: InfoCache;

  constructor(api: types.IExtensionApi) {
    this.mApi = api;

    this.mInfoCache = new InfoCache(api);

    api.onAsync('will-install-mod', (gameId, archiveId, modId) => {
      const state: types.IState = api.store.getState();
      const download = state.persistent.downloads.files[archiveId];
      if (download !== undefined) {
        this.mInstallingMod = download.localPath;
      }
      return Promise.resolve();
    });

    api.events.on('did-install-mod', (gameId, archiveId, modId) => {
      const state: types.IState = api.store.getState();
      const mod = util.getSafe(state.persistent.mods, [gameId, modId], undefined);
      // verify the mod installed is actually one required by this pack
      const required = this.mRequiredMods.find(iter =>
        util.testModReference(mod, iter.reference));
      if ((mod !== undefined) && (required !== undefined)) {
        this.mInstalledMods.push(mod);
      }
      this.triggerUpdate();
    });

    api.events.on('did-install-dependencies',
      (profileId: string, modId: string, recommendations: boolean) => {
        if ((this.mCollection !== undefined) && (modId === this.mCollection.id)) {
          this.mInstallDone = true;
          this.mInstallingMod = undefined;
          this.mApi.dismissNotification('installing-collection');
          this.triggerUpdate();
        }
      });
  }

  public async query(profile: types.IProfile, collection: types.IMod) {
    this.mProfile = profile;
    this.mCollection = collection;
    this.mStep = 'query';
    this.triggerUpdate();
  }

  public async start(profile: types.IProfile, collection: types.IMod) {
    this.mProfile = profile;
    this.mCollection = collection;

    this.startImpl();

    this.triggerUpdate();
  }

  public onUpdate(cb: UpdateCB) {
    this.mUpdateHandlers.push(cb);
  }

  public get step() {
    return this.mStep;
  }

  public get installedMods(): types.IMod[] {
    return this.mInstalledMods;
  }

  public get numRequired(): number {
    return this.mRequiredMods.length;
  }

  public get installingMod(): string {
    return this.mInstallingMod;
  }

  public get collection(): types.IMod {
    return this.mCollection;
  }

  public get collectionId(): string {
    const state: types.IState = this.mApi.store.getState();
    const modInfo = state.persistent.downloads.files[this.mCollection.archiveId]?.modInfo;
    const nexusInfo = modInfo?.nexus;

    return nexusInfo?.ids?.collectionId || modInfo?.ids?.collectionId;
  }

  public get revisionNumber(): number {
    const state: types.IState = this.mApi.store.getState();
    const modInfo = state.persistent.downloads.files[this.mCollection.archiveId]?.modInfo;
    const nexusInfo = modInfo?.nexus;

    return nexusInfo?.ids?.revisionNumber || modInfo?.ids?.revisionNumber;
  }

  public get collectionInfo(): ICollection {
    return this.mCollectionInfo;
  }

  public get revisionInfo(): IRevisionEx {
    const revisionNumber = this.revisionNumber;
    return this.mCollectionInfo.revisions.find(rev => rev.revision === revisionNumber);
  }

  public get installDone(): boolean {
    return this.mInstallDone;
  }

  public cancel() {
    this.mCollection = undefined;
    this.mProfile = undefined;
    this.mInstalledMods = [];
    this.mStep = 'query';

    this.triggerUpdate();
  }

  public continue() {
    if (this.canContinue()) {
      const steps = {
        query: this.startImpl,
        start: this.begin,
        disclaimer: this.closeDisclaimers,
        installing: this.finishInstalling,
        review: this.close,
      };
      steps[this.mStep]();
      this.triggerUpdate();
    }
  }

  public canContinue() {
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

  private startImpl = async () => {
    this.mInstalledMods = [];
    this.mInstallingMod = undefined;
    this.mInstallDone = false;
    this.mStep = 'start';

    const state: types.IState = this.mApi.store.getState();
    const mods = state.persistent.mods[this.mProfile.gameId];
    const modInfo = state.persistent.downloads.files[this.mCollection.archiveId]?.modInfo;
    const nexusInfo = modInfo?.nexus;

    const collectionId = this.collectionId;
    const revisionNumber = this.revisionNumber;

    if ((collectionId !== undefined) && (revisionNumber !== undefined)) {
      this.mCollectionInfo = nexusInfo?.collectionInfo
        ?? await this.mInfoCache.getRevisionInfo(collectionId, revisionNumber);
    }

    this.mApi.events.emit('view-collection', this.mCollection.id);

    this.mApi.sendNotification({
      id: 'installing-collection',
      type: 'activity',
      message: 'Installing Collection',
      actions: [
        {
          title: 'Show',
          action: () => {
            this.mApi.events.emit('view-collection', this.mCollection.id);
          },
        },
      ],
    });

    this.mApi.dismissNotification(getUnfulfilledNotificationId(this.mCollection.id));
    this.mApi.store.dispatch(actions.setModEnabled(this.mProfile.id, this.mCollection.id, true));

    const required = this.mCollection.rules
      .filter(rule => rule.type === 'requires');
    this.mRequiredMods = required
      .filter(rule => findModByRef(rule.reference, mods) === undefined);

    if (this.mRequiredMods.length === 0) {
      this.mInstallDone = false;
    }

    log('info', 'starting install of collection', {
      totalMods: required.length,
      missing: this.mRequiredMods.length,
    });
  }

  private begin = () => {
    this.mApi.events.emit('install-dependencies', this.mProfile.id, [this.mCollection.id], true);
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
    this.mCollection = undefined;
    this.triggerUpdate();
  }

  private triggerUpdate() {
    this.mUpdateHandlers.forEach(cb => {
      cb();
    });
  }
}

export default InstallDriver;
