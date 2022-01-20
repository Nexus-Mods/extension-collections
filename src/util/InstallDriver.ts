import * as nexusApi from '@nexusmods/nexus-api';
import * as Promise from 'bluebird';
import * as path from 'path';
import { actions, fs, log, selectors, types, util } from 'vortex-api';
import { postprocessCollection } from '../collectionInstall';
import { INSTALLING_NOTIFICATION_ID, MOD_TYPE } from '../constants';
import { ICollection } from '../types/ICollection';
import { IRevisionEx } from '../types/IRevisionEx';
import { readCollection } from './importCollection';
import InfoCache from './InfoCache';
import { calculateCollectionSize, getUnfulfilledNotificationId, isRelevant, modRuleId } from './util';

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
  private mCollectionInfo: nexusApi.ICollection;
  private mRevisionInfo: nexusApi.IRevision;
  private mInfoCache: InfoCache;
  private mTotalSize: number;
  private mOnStop: () => void;

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
      // verify the mod installed is actually one required by this collection
      const required = this.mRequiredMods.find(iter =>
        util.testModReference(mod, iter.reference));
      if ((mod !== undefined) && (required !== undefined)) {
        this.mInstalledMods.push(mod);
        this.updateProgress(this.mProfile, this.mCollection);
      }
      this.triggerUpdate();
    });

    api.events.on('did-finish-download', () => {
      // not checking whether the download is actually part of this collection because
      // that check may be more expensive than the ui update
      this.updateProgress(this.mProfile, this.mCollection);
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
        this.onDidInstallDependencies(profileId, modId, recommendations);
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

    this.mTotalSize = calculateCollectionSize(this.getModsEx(profile, collection));

    await this.startInstall();

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

  public get collectionSlug(): string {
    const state: types.IState = this.mApi.store.getState();
    const modInfo = state.persistent.downloads.files[this.mCollection.archiveId]?.modInfo;
    const nexusInfo = modInfo?.nexus;

    return nexusInfo?.ids?.collectionSlug || modInfo?.ids?.collectionSlug;
  }

  public get revisionNumber(): number {
    const state: types.IState = this.mApi.store.getState();
    const modInfo = state.persistent.downloads.files[this.mCollection.archiveId]?.modInfo;
    const nexusInfo = modInfo?.nexus;

    return nexusInfo?.ids?.revisionNumber || modInfo?.ids?.revisionNumber;
  }

  public get revisionId(): string {
    const state: types.IState = this.mApi.store.getState();
    const modInfo = state.persistent.downloads.files[this.mCollection.archiveId]?.modInfo;
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

  public async continue() {
    if (this.canContinue()) {
      const steps = {
        query: this.startInstall,
        start: this.begin,
        disclaimer: this.closeDisclaimers,
        installing: this.finishInstalling,
        review: this.close,
      };
      const res = await steps[this.mStep]();
      if (res !== false) {
        this.triggerUpdate();
      }
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

  private async onDidInstallDependencies(profileId: string,
                                         modId: string,
                                         recommendations: boolean) {
    log('info', 'did install dependencies', { profileId, modId });

    const profile = selectors.profileById(this.mApi.getState(), profileId);
    const mods = this.mApi.getState().persistent.mods[profile.gameId];

    if ((this.mCollection !== undefined) && (modId === this.mCollection.id)) {
      if (!recommendations) {
        const filter = rule =>
          (rule.type === 'requires')
          && (rule['ignored'] !== true)
          && (util.findModByRef(rule.reference, mods) === undefined);

        const incomplete = this.mCollection.rules.find(filter);
        if (incomplete === undefined) {
          this.mStep = 'review';
        } else {
          this.mInstallDone = true;
          this.mInstallingMod = undefined;
        }
        this.mApi.dismissNotification(INSTALLING_NOTIFICATION_ID + modId);
        this.triggerUpdate();
      } else {
        // We finished installing optional mods for the current collection - reset everything.
        this.onStop();
      }
    }

    const stagingPath = selectors.installPathForGame(this.mApi.getState(), profile.gameId);
    const mod = mods[modId];
    if ((mod !== undefined) && (mod.type === MOD_TYPE)) {
      try {
        const collectionInfo: ICollection =
          await readCollection(path.join(stagingPath, mod.installationPath, 'collection.json'));
        await postprocessCollection(this.mApi, profile, mod, collectionInfo, mods);
      } catch (err) {
        log('info', 'Failed to apply mod rules from collection. This is normal if this is the '
          + 'platform where the collection has been created.');
      }
    }
  }

  private onStop() {
    this.mCollection = undefined;
    this.mProfile = undefined;
    this.mInstalledMods = [];
    this.mStep = 'query';
    this.mOnStop?.();
  }

  private getModsEx(profile: types.IProfile, collection: types.IMod)
      : { [id: string]: types.IMod & { collectionRule: types.IModRule } } {
    if (profile === undefined) {
      profile = this.mProfile;
    }
    if (profile === undefined) {
      return {};
    }

    const mods = this.mApi.getState().persistent.mods[profile.gameId];

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
    this.mApi.ext.withSuppressedTests?.(['plugins-changed'], () =>
      new Promise((resolve, reject) => {
        this.mOnStop = () => {
          resolve();
          this.mOnStop = undefined;
        };
      }));
    return this.startImpl();
  }

  private startImpl = async () => {
    if (this.mCollection === undefined) {
      return false;
    }

    this.mInstalledMods = [];
    this.mInstallingMod = undefined;
    this.mInstallDone = false;
    this.mStep = 'start';

    const collection = this.mCollection;
    const profile = this.mProfile;

    const state: types.IState = this.mApi.store.getState();
    const mods = state.persistent.mods[profile.gameId];
    const modInfo = state.persistent.downloads.files[collection.archiveId]?.modInfo;
    const nexusInfo = modInfo?.nexus;

    const slug = this.collectionSlug;
    const revisionId = this.revisionId;

    if (revisionId !== undefined) {
      this.mRevisionInfo = nexusInfo?.revisionInfo
        ?? await this.mInfoCache.getRevisionInfo(revisionId, slug, this.revisionNumber);
    }

    const gameMode = profile.gameId;
    const currentgame = util.getGame(gameMode);
    const discovery = selectors.discoveryByGame(state, gameMode);
    const gameVersion = await currentgame.getInstalledVersion(discovery);
    const gvMatch = gv => gv.reference === gameVersion;
    const revGameVersions = this.mRevisionInfo.gameVersions ?? [];
    if ((revGameVersions.length ?? 0 !== 0)
        && (revGameVersions.find(gvMatch) === undefined)) {
      const choice = await this.mApi.showDialog('question', 'Different version', {
        text: 'The collection was created with a different version of the game '
            + 'than you have installed ("{{actual}}" vs "{{intended}}").\n'
            + 'Whether this is a problem depends on the game but you may want to '
            + 'check if the collection is compatible before continuing.',
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

    this.mCollectionInfo = nexusInfo?.collectionInfo
      ?? await this.mInfoCache.getCollectionInfo(slug)
      // this last fallback is for the weird case where we have revision info cached but
      // not collection info and fetching is not possible because it's been deleted from the
      // site
      // Not sure if/why this would happen on live, it did occur during testing because the
      // stuff was getting deleted from the DB directly
      ?? this.mRevisionInfo?.collection;

    this.mApi.events.emit('view-collection', collection.id);

    this.updateProgress(profile, collection);

    this.augmentRules(profile, collection);

    this.mApi.dismissNotification(getUnfulfilledNotificationId(collection.id));
    this.mApi.store.dispatch(actions.setModEnabled(profile.id, collection.id, true));

    const required = (collection?.rules ?? [])
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

  private matchRepo(rule: types.IModRule, ref: nexusApi.IModFile) {
    const modId = rule.reference.repo?.modId;
    const fileId = rule.reference.repo?.fileId;

    if ((modId === undefined) || (fileId === undefined)
        || (ref.modId === undefined) || (ref.fileId === undefined)) {
      return false;
    }

    return modId.toString() === ref.modId.toString()
      && fileId.toString() === ref.fileId.toString();
  }

  private augmentRules(profile: types.IProfile, collection: types.IMod) {
    util.batchDispatch(this.mApi.store, collection.rules.map(rule => {
      if (rule.reference.repo === undefined) {
        return undefined;
      }
      const revMod = (this.mRevisionInfo?.modFiles ?? []).find(
        iter => this.matchRepo(rule, iter.file));
      if (revMod?.file !== undefined) {
        const newRule = util.setSafe(rule, ['extra', 'fileName'], revMod.file.uri);
        return actions.addModRule(profile.gameId, collection.id, newRule);
      }
    })
    .filter(rule => rule !== undefined));
  }

  private begin = () => {
    if ((this.mCollection === undefined) || (this.mProfile?.id === undefined)) {
      return;
    }

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

  private installProgress(profile: types.IProfile, collection: types.IMod): number {
    const mods = this.getModsEx(profile, collection);

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

  private updateProgress(profile: types.IProfile, collection: types.IMod) {
    if (collection === undefined) {
      return;
    }

    if (this.mTotalSize === undefined) {
      this.mTotalSize = calculateCollectionSize(this.getModsEx(profile, collection));
    }

    this.mApi.sendNotification({
      id: INSTALLING_NOTIFICATION_ID + collection.id,
      type: 'activity',
      title: 'Installing Collection',
      message: util.renderModName(collection),
      progress: this.installProgress(profile, collection),
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
