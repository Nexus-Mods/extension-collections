import findModByRef from './findModByRef';

import * as Promise from 'bluebird';
import { actions, log, types, util } from 'vortex-api';

export type Step = 'start' | 'disclaimer' | 'installing' | 'review';

export type UpdateCB = () => void;

class InstallDriver {
  private mApi: types.IExtensionApi;
  private mProfile: types.IProfile;
  private mModPack: types.IMod;
  private mStep: Step = 'start';
  private mUpdateHandlers: UpdateCB[] = [];
  private mInstalledMods: types.IMod[] = [];
  private mRequiredMods: types.IModRule[] = [];
  private mInstallingMod: string;
  private mInstallDone: boolean = false;

  constructor(api: types.IExtensionApi) {
    this.mApi = api;
    api.onAsync('will-install-mod', (gameId, archiveId, modId, modInfo) => {
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
        if ((this.mModPack !== undefined) && (modId === this.mModPack.id)) {
          this.mInstallDone = true;
          this.mInstallingMod = undefined;
          this.mApi.dismissNotification('installing-modpack');
          this.triggerUpdate();
        }
      });
  }

  public start(profile: types.IProfile, modpack: types.IMod) {
    this.mProfile = profile;
    this.mModPack = modpack;
    this.mStep = 'start';
    this.mInstalledMods = [];
    this.mInstallingMod = undefined;
    this.mInstallDone = false;

    const state: types.IState = this.mApi.store.getState();
    const mods = state.persistent.mods[this.mProfile.gameId];

    this.mApi.store.dispatch(actions.setDialogVisible('modpack-install'));

    this.mApi.sendNotification({
      id: 'installing-modpack',
      type: 'activity',
      message: 'Installing Modpack',
      actions: [
        {
          title: 'Show',
          action: () => {
            this.mApi.store.dispatch(actions.setDialogVisible('modpack-install'));
          },
        },
      ],
    });

    const required = modpack.rules
      .filter(rule => rule.type === 'requires');
    this.mRequiredMods = required
      .filter(rule => findModByRef(rule.reference, mods) === undefined);

    log('info', 'starting install of mod pack', {
      totalMods: required.length,
      missing: this.mRequiredMods.length,
    });

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

  public get modPack() {
    return this.mModPack;
  }

  public get installDone(): boolean {
    return this.mInstallDone;
  }

  public cancel() {
    this.mModPack = undefined;
    this.mProfile = undefined;
    this.mInstalledMods = [];
    this.mStep = 'start';

    this.triggerUpdate();
  }

  public continue() {
    if (this.canContinue()) {
      const steps = {
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
      return this.mInstalledMods.length > 0;
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

  private begin = () => {
    this.mApi.events.emit('install-dependencies', this.mProfile.id, [this.mModPack.id], true);
    this.mStep = 'disclaimer';
  }

  private closeDisclaimers = () => {
    this.mStep = 'installing';
  }

  private finishInstalling = () => {
    this.mApi.store.dispatch(actions.setModEnabled(this.mProfile.id, this.mModPack.id, true));
    this.mStep = 'review';
  }

  private close = () => {
    this.mModPack = undefined;
    this.triggerUpdate();
  }

  private triggerUpdate() {
    this.mUpdateHandlers.forEach(cb => {
      cb();
    });
  }
}

export default InstallDriver;
