import { ICollection, IModFile, IRevision } from '@nexusmods/nexus-api';
import * as Promise from 'bluebird';
import { actions, log, selectors, types, util } from 'vortex-api';
import { INSTALLING_NOTIFICATION_ID, MOD_TYPE } from '../constants';
import { IRevisionEx } from '../types/IRevisionEx';
import InfoCache from './InfoCache';
import { getUnfulfilledNotificationId } from './util';

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
  private mRevisionInfo: IRevision;
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

    api.events.on('will-install-dependencies',
      (profileId: string, modId: string, recommendations: boolean) => {
        const state = api.getState();
        const profile = this.profile || selectors.profileById(state, profileId);
        if (profile?.gameId === undefined) {
          // how?
          return;
        }
        const mods = state.persistent.mods[profile.gameId];
        if ((this.mCollection === undefined)
            && (mods[modId]?.type === MOD_TYPE)
            && recommendations) {
          // When installing optional mods, it's possible for the mCollection
          //  property to be undefined - we need to ensure that the driver is
          //  aware that it's installing mods that are part of the collection
          //  in order for us to apply any collection mod rules to the mods themselves
          //  upon successful installation.
          this.mCollection = mods[modId];
          this.mStep = 'installing';
        }
      });

    api.events.on('did-install-dependencies',
      (profileId: string, modId: string, recommendations: boolean) => {
        if ((this.mCollection !== undefined)
            && (modId === this.mCollection.id)) {
          if (!recommendations) {
            const profile = selectors.profileById(api.getState(), profileId);
            const mods = api.getState().persistent.mods[profile.gameId];
            const incomplete = this.mCollection.rules.find(rule =>
              (rule.type === 'requires')
          && (rule['ignored'] !== true)
          && (util.findModByRef(rule.reference, mods) === undefined));

            if (incomplete === undefined) {
              this.mStep = 'review';
              this.deployMods();
            } else {
              this.mInstallDone = true;
              this.mInstallingMod = undefined;
            }
            this.mApi.dismissNotification(INSTALLING_NOTIFICATION_ID + modId);
            this.triggerUpdate();
          } else {
            // We finished installing optional mods for the current collection - reset everything.
            this.mCollection = undefined;
            this.mStep = 'query';
            this.deployMods();
          }
        }
      });
  }

  public async query(profile: types.IProfile, collection: types.IMod) {
    if (!this.mInstallDone && (this.mCollection !== undefined)) {
      this.mApi.sendNotification({
        type: 'warning',
        message: 'Already installing a collection',
      });
      return;
    }
    this.mProfile = profile;
    this.mCollection = collection;
    this.mStep = 'query';
    this.triggerUpdate();
  }

  public async start(profile: types.IProfile, collection: types.IMod) {
    if (!this.mInstallDone && (this.mCollection !== undefined)) {
      this.mApi.sendNotification({
        type: 'warning',
        message: 'Already installing a collection',
        displayMS: 5000,
      });
      return;
    }

    this.mProfile = profile;
    this.mCollection = collection;

    this.startImpl();

    this.triggerUpdate();
  }

  public onUpdate(cb: UpdateCB) {
    this.mUpdateHandlers.push(cb);
  }

  public get profile() {
    return this.mProfile;
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

  public get revisionId(): string {
    const state: types.IState = this.mApi.store.getState();
    const modInfo = state.persistent.downloads.files[this.mCollection.archiveId]?.modInfo;
    const nexusInfo = modInfo?.nexus;

    return nexusInfo?.ids?.revisionId || modInfo?.ids?.revisionId;
  }

  public get collectionInfo(): ICollection {
    return this.mCollectionInfo;
  }

  public get revisionInfo(): IRevisionEx {
    return this.mRevisionInfo;
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
    const revisionId = this.revisionId;

    if (revisionId !== undefined) {
      this.mRevisionInfo = nexusInfo?.revisionInfo
        ?? await this.mInfoCache.getRevisionInfo(revisionId);
    }
    if (collectionId !== undefined) {
      this.mCollectionInfo = nexusInfo?.collectionInfo
        ?? await this.mInfoCache.getCollectionInfo(collectionId)
        // this last fallback is for the weird case where we have revision info cached but
        // not collection info and fetching is not possible because it's been deleted from the
        // site
        // Not sure if/why this would happen on live, it did occur during testing because the
        // stuff was getting deleted from the DB directly
        ?? this.mRevisionInfo.collection;
    }

    this.mApi.events.emit('view-collection', this.mCollection.id);

    this.mApi.sendNotification({
      id: INSTALLING_NOTIFICATION_ID + this.mCollection.id,
      type: 'activity',
      title: 'Installing Collection',
      message: util.renderModName(this.mCollection),
      actions: [
        {
          title: 'Show',
          action: () => {
            this.mApi.events.emit('view-collection', this.mCollection.id);
          },
        },
      ],
    });

    this.augmentRules();

    this.mApi.dismissNotification(getUnfulfilledNotificationId(this.mCollection.id));
    this.mApi.store.dispatch(actions.setModEnabled(this.mProfile.id, this.mCollection.id, true));

    const required = this.mCollection.rules
      .filter(rule => rule.type === 'requires');
    this.mRequiredMods = required
      .filter(rule => util.findModByRef(rule.reference, mods) === undefined);

    if (this.mRequiredMods.length === 0) {
      this.mInstallDone = false;
    }

    log('info', 'starting install of collection', {
      totalMods: required.length,
      missing: this.mRequiredMods.length,
    });
  }

  private matchRepo(rule: types.IModRule, ref: IModFile) {
    const modId = rule.reference.repo?.modId;
    const fileId = rule.reference.repo?.fileId;

    if ((modId === undefined) || (fileId === undefined)
        || (ref.modId === undefined) || (ref.fileId === undefined)) {
      return false;
    }

    return modId.toString() === ref.modId.toString()
      && fileId.toString() === ref.fileId.toString();
  }

  private augmentRules() {
    util.batchDispatch(this.mApi.store, this.mCollection.rules.map(rule => {
      if (rule.reference.repo === undefined) {
        return undefined;
      }
      const revMod = (this.mRevisionInfo?.modFiles ?? []).find(
        iter => this.matchRepo(rule, iter.file));
      if (revMod?.file !== undefined) {
        const newRule = util.setSafe(rule, ['extra', 'fileName'], revMod.file.uri);
        return actions.addModRule(this.mProfile.gameId, this.mCollection.id, newRule);
      }
    })
    .filter(rule => rule !== undefined));
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
    this.mInstallDone = true;
    this.triggerUpdate();
  }

  private triggerUpdate() {
    this.mUpdateHandlers.forEach(cb => {
      cb();
    });
  }

  private deployMods = () => {
    const state = this.mApi.getState();
    if (state.settings.automation.deploy) {
      // Any errors will be reported by the deployment mechanism itself.
      this.mApi.events.emit('deploy-mods', () => undefined);
    }
  };
}

export default InstallDriver;
